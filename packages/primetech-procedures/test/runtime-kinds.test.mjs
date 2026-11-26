import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createProcedureCatalog, createPrimeTechProcedureHandler, validateProcedureManifest, PrimetechProcedureError } from '../src/index.js';
import { createLocalScriptRuntime } from '../../../src/sam/adapters/local-script-runtime.js';
import { createLocalMediaStore } from '../../../src/sam/adapters/local-media-store.js';
import { createSamOS } from '../../../src/sam/os.js';
import { createSamCapabilityAdapter } from '../../../src/sam/model-adapter.js';
import { createShellSamAdapter } from '../../../src/sam/shell-host.js';

const catalog = createProcedureCatalog();
const identity = { accountId: 'acct_procedure_test', actorId: 'actor_procedure_test', installationId: 'install_procedure_test' };
const temp = prefix => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

function samHost(root, { expose = [], assetStore = null, processRuntime = null } = {}) {
  const osRuntime = createSamOS({ core: true, generated: {
    assetStore, processRuntime, scriptStore: null,
    scriptExecutionLanes: ['local'],
    resolveTrustedContext: async () => identity,
    authorize: async () => true,
  } });
  return createSamCapabilityAdapter({ os: osRuntime, expose, authorize: async () => true });
}

function runner(root, host, extra = {}) {
  return createPrimeTechProcedureHandler({
    catalog, projectRoot: root,
    receiptDir: path.join(root, '.agentsam', 'receipts'),
    invokeSamOperation: (id, input) => host.invoke(id, input),
    isCapabilityAvailable: id => host.canInvoke(id),
    invokeNativeTool: (id, input) => host.invoke(id, input),
    isNativeToolAvailable: id => host.canInvoke(id),
    ...extra,
  });
}

test('all four manifest runtime kinds resolve to real catalog entries', () => {
  const expected = [
    ['repo.asset.inventory', 'python'],
    ['repo.git.status', 'bash'],
    ['arch.assembly.calculate', 'sam_operation'],
    ['media.asset.preflight', 'native_tool'],
  ];
  for (const [id, kind] of expected) {
    const row = catalog.get(id, '0.1.0');
    assert.equal(validateProcedureManifest(row.manifest).ok, true);
    assert.equal(row.manifest.runtime.kind, kind);
    assert.equal(row.entrypointPath === null, kind === 'sam_operation' || kind === 'native_tool');
  }
  const sam = catalog.get('arch.assembly.calculate').manifest;
  assert.equal(validateProcedureManifest({ ...sam, runtime: { kind: 'sam_operation', operation: 'primetech.procedure.run' } }).ok, false);
  assert.equal(validateProcedureManifest({ ...sam, runtime: { kind: 'sam_operation', operation: 'terminal.exec' } }).ok, false);
  assert.equal(validateProcedureManifest({ ...sam, capabilities: ['sam.superbash'], runtime: { kind: 'sam_operation', operation: 'sam.superbash' } }).ok, false);
  const bash = catalog.get('repo.git.status').manifest;
  assert.equal(validateProcedureManifest({ ...bash, capabilities: [] }).ok, false);
  assert.equal(validateProcedureManifest({ ...sam, runtime: { ...sam.runtime, entrypoint: '../outside' } }).ok, false);
  const native = catalog.get('media.asset.preflight').manifest;
  assert.equal(validateProcedureManifest({ ...native, runtime: { ...native.runtime, tool_key: 'unknown.tool' } }).ok, false);
});

test('sam_operation calls a real architectural calculation and preserves SAM receipt provenance', async () => {
  const root = temp('primetech-sam-');
  try {
    const host = samHost(root, { expose: ['arch.assembly.thickness'] });
    const input = { layers: [{ name: 'sheet', thickness_in: 0.5 }, { name: 'frame', thickness_in: 3.5 }] };
    const result = await runner(root, host)({ id: 'arch.assembly.calculate', version: '0.1.0', input });
    assert.equal(result.status, 'completed');
    assert.equal(result.output.total_in, 4);
    assert.equal(result.output.total_mm, 101.6);
    assert.equal(result.verification.ok, true);
    assert.equal(result.execution.operation, 'arch.assembly.thickness');
    assert.equal(result.execution.runtime_kind, 'sam_operation');
    assert.match(result.execution.source_receipt_id, /^samr_/);
    assert.equal(result.execution.script_sha256, null);
    assert.equal(result.receipt.written, undefined);
    assert.equal(fs.existsSync(path.join(root, '.agentsam', 'receipts', result.receipt.ref)), true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('bash runs a manifest-pinned, read-only Git status procedure through the authorized SAM process', async () => {
  const root = temp('primetech-git-');
  try {
    execFileSync('git', ['init', '-q', root]);
    fs.writeFileSync(path.join(root, 'untracked.txt'), 'hello');
    const host = samHost(root, { expose: ['sam.superbash'], processRuntime: createLocalScriptRuntime({ root }) });
    const result = await runner(root, host)({ id: 'repo.git.status', version: '0.1.0', input: {} });
    assert.equal(result.output.engine, 'git');
    assert.equal(result.output.tracked_changes, 0);
    assert.equal(result.output.untracked_files, 1);
    assert.equal(result.execution.operation, 'sam.superbash');
    assert.equal(result.execution.runtime_kind, 'bash');
    assert.match(result.execution.script_sha256, /^[a-f0-9]{64}$/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('native_tool uses the real owned media store and rejects missing/foreign assets', async () => {
  const root = temp('primetech-media-');
  try {
    const assetStore = createLocalMediaStore({ root: path.join(root, 'media') });
    const bytes = Buffer.from('verified native asset data');
    const asset = await assetStore.importAsset({ ...identity, bytes, contentType: 'text/plain' });
    const host = samHost(root, { expose: ['media.asset.inspect'], assetStore });
    const result = await runner(root, host)({ id: 'media.asset.preflight', version: '0.1.0', input: { assetId: asset.id } });
    assert.equal(result.execution.operation, 'media.asset.inspect');
    assert.equal(result.execution.runtime_kind, 'native_tool');
    assert.equal(result.output.sha256, crypto.createHash('sha256').update(bytes).digest('hex'));
    assert.equal(result.output.byteLength, bytes.length);
    assert.match(result.execution.source_receipt_id, /^samr_/);
    await assert.rejects(
      () => runner(root, host)({ id: 'media.asset.preflight', version: '0.1.0', input: { assetId: 'nonexistent' } }),
      error => error instanceof PrimetechProcedureError,
    );
    await assert.rejects(
      () => runner(root, host, { invokeNativeTool: null })({ id: 'media.asset.preflight', version: '0.1.0', input: { assetId: asset.id } }),
      error => error instanceof PrimetechProcedureError && error.code === 'primetech_native_tool_host_not_bound',
    );
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('a write-capable native procedure enforces approval and preserves the original image', async () => {
  const root = temp('primetech-native-write-');
  try {
    const { default: sharp } = await import('sharp');
    const originalBytes = await sharp({ create: { width: 4, height: 4, channels: 4, background: '#0099aa' } }).png().toBuffer();
    const assetStore = createLocalMediaStore({ root: path.join(root, 'media') });
    const original = await assetStore.importAsset({ ...identity, bytes: originalBytes, contentType: 'image/png' });
    const host = samHost(root, { expose: ['media.image.optimize'], assetStore });
    const request = {
      id: 'media.image.optimize-asset', version: '0.1.0',
      input: { assetId: original.id, format: 'webp', quality: 82 },
    };
    let approvals = 0;
    await assert.rejects(
      () => runner(root, host, { authorizeProcedure: async ({ effect, requires_operator_review }) => {
        approvals += 1;
        assert.equal(effect, 'project_write');
        assert.equal(requires_operator_review, true);
        return false;
      } })(request),
      error => error.code === 'primetech_procedure_operator_approval_required',
    );
    assert.equal(approvals, 1);
    const success = await runner(root, host, { authorizeProcedure: async () => true })(request);
    assert.equal(success.status, 'completed');
    assert.equal(success.execution.runtime_kind, 'native_tool');
    assert.equal(success.execution.operation, 'media.image.optimize');
    assert.equal(success.verification.ok, true);
    assert.equal(success.output.sourceAssetId, original.id);
    assert.notEqual(success.output.derivativeAssetId, original.id);
    assert.equal(success.output.contentType, 'image/webp');
    const derivative = await assetStore.getOwnedAsset({ assetId: success.output.derivativeAssetId, ...identity });
    assert.equal(derivative.sha256, success.output.derivativeHash);
    assert.equal(derivative.sourceAssetId, original.id);
    assert.equal(derivative.bytes.length, success.output.bytes);
    const preserved = await assetStore.getOwnedAsset({ assetId: original.id, ...identity });
    assert.deepEqual(preserved.bytes, originalBytes, 'the source bytes remain untouched');
    assert.equal(success.receipt.written, undefined);
    assert.equal(fs.existsSync(path.join(root, '.agentsam', 'receipts', success.receipt.ref)), true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('fixture-suite and native verification require a bound verifier and reject failed evidence', async () => {
  const root = temp('primetech-verify-');
  const procedureDir = temp('primetech-verify-catalog-');
  try {
    const manifest = catalog.get('arch.assembly.calculate').manifest;
    const id = 'arch.assembly.calculate';
    fs.mkdirSync(path.join(procedureDir, id));
    fs.writeFileSync(path.join(procedureDir, id, 'procedure.json'), JSON.stringify({
      ...manifest, verification: { kind: 'native_validation' },
    }));
    const host = samHost(root, { expose: ['arch.assembly.thickness'] });
    const input = { id, version: '0.1.0', input: { layers: [{ name: 'sample', thickness_in: 1 }] } };
    const base = { catalog: createProcedureCatalog({ root: procedureDir }) };
    await assert.rejects(() => runner(root, host, base)(input), error => error.code === 'primetech_procedure_verifier_not_bound');
    await assert.rejects(() => runner(root, host, { ...base, verifyProcedureOutput: async () => ({ ok: false, kind: 'native_validation' }) })(input), error => error.code === 'primetech_procedure_verification_failed');
    const verified = await runner(root, host, { ...base, verifyProcedureOutput: async ({output, projectRoot}) => {
      assert.equal(projectRoot, fs.realpathSync(root));
      return { kind: 'native_validation', ok: output.total_in === 1, evidence: { verified_total_in: output.total_in } };
    } })(input);
    assert.equal(verified.verification.ok, true);
    assert.equal(verified.verification.evidence.verified_total_in, 1);
  } finally { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(procedureDir, { recursive: true, force: true }); }
});


test('authenticated interactive shell binds packaged SAM operations but not arbitrary write operations', async () => {
  const root = temp('primetech-cli-shell-');
  try {
    const host = createShellSamAdapter({
      state: { home: root, cwd: root, projectRoot: root },
      trustedIdentity: identity,
      authorize: async () => true,
      procedureOperationIds: ['arch.assembly.thickness', 'terminal.exec'],
    });
    assert.ok(host);
    assert.equal(host.canInvoke('arch.assembly.thickness'), true);
    assert.equal(host.canInvoke('terminal.exec'), false, 'manifest cannot expose arbitrary write operations');
    assert.equal(host.canInvoke('media.asset.inspect'), true, 'native media tools reuse the existing host');
    const result = await runner(root, host)({ id: 'arch.assembly.calculate', version: '0.1.0', input: {
      layers: [{ name: 'real layer', thickness_in: 1.25 }],
    } });
    assert.equal(result.output.total_in, 1.25);
    assert.equal(result.execution.runtime_kind, 'sam_operation');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
