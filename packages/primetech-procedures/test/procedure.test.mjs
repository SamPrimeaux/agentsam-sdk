import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createProcedureCatalog, createPrimeTechProcedureHandler, validateProcedureManifest, PrimetechProcedureError, summarizeProcedureRuns } from '../src/index.js';
import { createLocalScriptRuntime } from '../../../src/sam/adapters/local-script-runtime.js';
import { createSamOS } from '../../../src/sam/os.js';
import { createSamCapabilityAdapter } from '../../../src/sam/model-adapter.js';

const packageRoot = path.resolve(new URL('..', import.meta.url).pathname);
const procedureRoot = path.join(packageRoot, 'procedures');
const manifestPath = path.join(procedureRoot, 'repo.asset.inventory', 'procedure.json');
const sourceManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const sha = value => crypto.createHash('sha256').update(value).digest('hex');

function makeProject(root) {
  fs.writeFileSync(path.join(root, 'DreamHouse.FCStd'), 'native-cad-source');
  fs.writeFileSync(path.join(root, 'scene.blend'), 'blender-scene-source');
  fs.mkdirSync(path.join(root, 'models'));
  fs.writeFileSync(path.join(root, 'models', 'assembly.step'), 'step-source');
  fs.mkdirSync(path.join(root, 'node_modules'));
  fs.writeFileSync(path.join(root, 'node_modules', 'ignored.stl'), 'ignore');
  fs.mkdirSync(path.join(root, '.agentsam'));
  fs.writeFileSync(path.join(root, '.agentsam', 'receipt.stl'), 'ignore');
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'primetech-outside-'));
  fs.writeFileSync(path.join(outside, 'external.ifc'), 'outside');
  fs.symlinkSync(outside, path.join(root, 'external-link'));
  return outside;
}

function createSamHost(projectRoot, approvalCalls) {
  const processRuntime = createLocalScriptRuntime({ root: projectRoot });
  const osRuntime = createSamOS({
    core: true,
    generated: {
      processRuntime,
      scriptStore: null,
      scriptExecutionLanes: ['local'],
      resolveTrustedContext: async () => ({
        accountId: 'fixture-account',
        actorId: 'fixture-actor',
        installationId: 'fixture-installation',
      }),
      authorize: async request => {
        approvalCalls.push({ operation: request.operation, effect: request.policy?.effect || null });
        return true;
      },
    },
  });
  const samAdapter = createSamCapabilityAdapter({
    os: osRuntime,
    expose: ['sam.superbash'],
    authorize: async () => true,
  });
  return samAdapter;
}

test('procedure catalog validates the versioned inventory manifest', () => {
  const catalog = createProcedureCatalog({ root: procedureRoot });
  const inventory = catalog.list().find(item => item.id === 'repo.asset.inventory');
  assert.deepEqual(inventory, {
    id: 'repo.asset.inventory',
    version: '0.1.0',
    summary: sourceManifest.summary,
    effect: 'read',
    available: true,
  });
  const validation = validateProcedureManifest(sourceManifest);
  assert.equal(validation.ok, true, JSON.stringify(validation.errors));
  const traversal = validateProcedureManifest({
    ...sourceManifest,
    runtime: { ...sourceManifest.runtime, entrypoint: '../outside.py' },
  });
  assert.equal(traversal.ok, false);
  assert.ok(traversal.errors.some(error => error.code === 'procedure_entrypoint_invalid'));
  const arbitraryCommand = validateProcedureManifest({
    ...sourceManifest,
    verification: { command: 'rm -rf .', expected: 'done' },
  });
  assert.equal(arbitraryCommand.ok, false);
});

test('repo.asset.inventory runs through the existing authenticated sam.superbash operation and records evidence', async () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'primetech-project-'));
  const receiptDir = fs.mkdtempSync(path.join(os.tmpdir(), 'primetech-receipts-'));
  const outside = makeProject(projectRoot);
  const approvalCalls = [];
  const samAdapter = createSamHost(projectRoot, approvalCalls);
  let invocationCount = 0;
  try {
    const handler = createPrimeTechProcedureHandler({
      catalog: createProcedureCatalog({ root: procedureRoot }),
      projectRoot,
      receiptDir,
      invokeSamOperation: async (id, input) => {
        invocationCount += 1;
        assert.equal(id, 'sam.superbash');
        assert.equal(samAdapter.canInvoke(id), true);
        return samAdapter.invoke(id, input);
      },
      isCapabilityAvailable: id => samAdapter.canInvoke(id),
    });
    const result = await handler({ id: 'repo.asset.inventory', version: '0.1.0', input: {} });
    assert.equal(result.schema, 'inneranimalmedia.primetech.procedure-run.v1');
    assert.equal(result.status, 'completed');
    assert.equal(result.verification.ok, true);
    assert.equal(result.output.total, 3);
    assert.deepEqual(result.output.counts, { blender: 1, freecad: 1, step: 1 });
    assert.equal(result.output.engine.name, 'python');
    assert.ok(result.output.engine.version.startsWith('3.'));
    assert.equal(result.output.assets.some(asset => asset.path.includes('ignored')), false);
    assert.equal(result.output.assets.some(asset => asset.path.includes('external-link')), false);
    assert.ok(result.output.assets.every(asset => asset.sha256 && asset.hash_status === 'hashed'));
    assert.equal(invocationCount, 1);
    assert.equal(approvalCalls.length, 1);
    assert.equal(approvalCalls[0].operation, 'sam.superbash');
    assert.equal(result.execution.operation, 'sam.superbash');
    assert.equal(result.execution.status, 'completed');
    assert.match(result.execution.script_sha256, /^[a-f0-9]{64}$/);

    const artifactPath = path.join(receiptDir, result.artifact.ref);
    const artifactBytes = fs.readFileSync(artifactPath);
    assert.equal(sha(artifactBytes), result.artifact.sha256);
    assert.equal(JSON.parse(artifactBytes.toString()).total, 3);
    const receiptPath = path.join(receiptDir, result.receipt.ref);
    const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
    assert.equal(receipt.schema, 'agentsam.primetech.procedure-receipt.v1');
    assert.equal(receipt.status, 'completed');
    assert.equal(receipt.procedure.id, 'repo.asset.inventory');
    assert.match(receipt.manifest_sha256, /^[a-f0-9]{64}$/);
    assert.match(receipt.entrypoint_sha256, /^[a-f0-9]{64}$/);
    assert.match(receipt.output_sha256, /^[a-f0-9]{64}$/);
    assert.equal(receipt.verification.ok, true);
    assert.equal(receipt.artifact_ref, result.artifact.ref);
    assert.ok(receipt.timings_ms.execution >= 0);
    assert.ok(receipt.output_bytes > 0);
    const performance = summarizeProcedureRuns({ receiptDir, procedureId: 'repo.asset.inventory' });
    assert.equal(performance.scanned, 1);
    assert.equal(performance.by_procedure[0].run_count, 1);
    assert.equal(performance.by_procedure[0].completed, 1);
    assert.equal(performance.by_procedure[0].failed, 0);
    assert.equal(performance.by_procedure[0].success_rate, 1);
    assert.ok(performance.by_procedure[0].mean_duration_ms >= 0);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
    fs.rmSync(receiptDir, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('procedure refuses caller-selected roots, unknown capabilities, and unapproved write effects', async () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'primetech-project-'));
  const receiptDir = fs.mkdtempSync(path.join(os.tmpdir(), 'primetech-receipts-'));
  let invoked = 0;
  try {
    const base = {
      catalog: createProcedureCatalog({ root: procedureRoot }),
      projectRoot, receiptDir,
      invokeSamOperation: async () => { invoked += 1; return { ok: true, data: {} }; },
      isCapabilityAvailable: () => false,
    };
    const handler = createPrimeTechProcedureHandler(base);
    await assert.rejects(
      () => handler({ id: 'repo.asset.inventory', version: '0.1.0', input: { project_root: '/tmp' } }),
      error => error instanceof PrimetechProcedureError && error.code === 'primetech_procedure_input_schema_invalid',
    );
    await assert.rejects(
      () => handler({ id: 'repo.asset.inventory', version: '0.1.0', input: {} }),
      error => error instanceof PrimetechProcedureError && error.code === 'primetech_required_capability_unavailable',
    );
    assert.equal(invoked, 0);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
    fs.rmSync(receiptDir, { recursive: true, force: true });
  }
});

test('procedure requires explicit approval for a non-read effect', async () => {
  const tempCatalog = fs.mkdtempSync(path.join(os.tmpdir(), 'primetech-catalog-'));
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'primetech-project-'));
  const receiptDir = fs.mkdtempSync(path.join(os.tmpdir(), 'primetech-receipts-'));
  const procedureDir = path.join(tempCatalog, 'repo.asset.inventory');
  fs.mkdirSync(procedureDir);
  fs.copyFileSync(path.join(procedureRoot, 'repo.asset.inventory', 'run.py'), path.join(procedureDir, 'run.py'));
  fs.writeFileSync(path.join(procedureDir, 'procedure.json'), JSON.stringify({ ...sourceManifest, effect: 'project_write' }));
  let invoked = 0;
  try {
    const handler = createPrimeTechProcedureHandler({
      catalog: createProcedureCatalog({ root: tempCatalog }),
      projectRoot, receiptDir,
      invokeSamOperation: async () => { invoked += 1; return { ok: true, data: {} }; },
      isCapabilityAvailable: () => true,
      authorizeProcedure: async () => false,
    });
    await assert.rejects(
      () => handler({ id: 'repo.asset.inventory', version: '0.1.0', input: {} }),
      error => error instanceof PrimetechProcedureError && error.code === 'primetech_procedure_operator_approval_required',
    );
    assert.equal(invoked, 0);
  } finally {
    fs.rmSync(tempCatalog, { recursive: true, force: true });
    fs.rmSync(projectRoot, { recursive: true, force: true });
    fs.rmSync(receiptDir, { recursive: true, force: true });
  }
});
