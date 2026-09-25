import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parseWranglerVersionId } from '../lib/deploy/health.js';
import { writeDeploymentReceipt, writeProductRegistryLocal, buildProductRow } from './receipts.js';
import { applyGoProductRegistry } from './registry.js';
import { gitEvidence } from '../knowledge/config.js';
import { SDK_ROOT } from './discover.js';

function resolveWranglerInvocation(productRoot) {
  const js = path.join(productRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  if (fs.existsSync(js)) return { command: process.execPath, args: [js] };
  const bin = path.join(productRoot, 'node_modules', '.bin', 'wrangler');
  if (fs.existsSync(bin)) return { command: bin, args: [] };
  return { command: 'npx', args: ['--yes', 'wrangler'] };
}

/**
 * Cloudflare adapter for Go products.
 * Owns Wrangler invocation + live probes. Does not own the Go build itself.
 */
export async function deployGoCloudflare({
  productRoot,
  product = 'agentsam-go-worker',
  dryRun = false,
  skipDeploy = false,
  skipRegistry = false,
  spawn = spawnSync,
  fetchImpl = globalThis.fetch,
} = {}) {
  const wranglerConfig = path.join(productRoot, 'wrangler.jsonc');
  if (!fs.existsSync(wranglerConfig)) throw new Error(`wrangler_config_missing: ${wranglerConfig}`);

  const docker = spawn('docker', ['info'], { encoding: 'utf8' });
  const dockerOk = docker.status === 0;
  if (!dockerOk && !dryRun && !skipDeploy) {
    const err = new Error('docker_unavailable');
    err.detail = (docker.stderr || docker.stdout || '').trim().slice(0, 400);
    err.hint = 'Cloudflare Containers require a local container engine for image build. Start Docker Desktop or pass --skip-deploy / --dry-run.';
    throw err;
  }

  const wrangler = resolveWranglerInvocation(productRoot);
  let deployOutput = '';
  let versionId = null;
  let deployed = false;

  if (dryRun || skipDeploy) {
    deployOutput = dryRun ? 'dry_run' : 'skip_deploy';
  } else {
    const res = spawn(wrangler.command, wrangler.args.concat(['deploy', '-c', 'wrangler.jsonc']), {
      cwd: productRoot,
      encoding: 'utf8',
      env: { ...process.env },
    });
    deployOutput = `${res.stdout || ''}\n${res.stderr || ''}`.trim();
    if (res.status !== 0) {
      const err = new Error('wrangler_deploy_failed');
      err.detail = deployOutput.slice(0, 2000);
      throw err;
    }
    versionId = parseWranglerVersionId(deployOutput);
    deployed = true;
  }

  const url = extractWorkersDevUrl(deployOutput) || guessWorkersDevUrl(product);
  const probes = url && !dryRun && !skipDeploy
    ? await probeGoDeployment(url, { fetchImpl })
    : { skipped: true, ok: Boolean(dryRun || skipDeploy), results: {} };

  const git = gitEvidence(path.resolve(productRoot, '../..'));
  const health = probes.skipped
    ? 'pending'
    : (probes.ok ? 'healthy' : (deployed ? 'degraded' : 'pending'));
  const receipt = {
    product,
    provider: 'cloudflare',
    kind: 'worker-container',
    url,
    health,
    artifact_digest: null,
    worker_version_id: versionId,
    deployed_at: new Date().toISOString(),
    source_commit: git.commit,
    probes,
    dry_run: Boolean(dryRun),
    skipped_deploy: Boolean(skipDeploy),
  };

  const receiptPath = writeDeploymentReceipt(productRoot, receipt);
  const productRow = buildProductRow({
    product,
    repositoryId: 'github:samprimeaux/agentsam-sdk',
    commit: git.commit,
    url,
    health,
  });
  const productPath = writeProductRegistryLocal(productRoot, productRow);

  const registryStatus = health === 'healthy' ? 'wired' : (deployed ? 'scaffolded' : 'prototype');
  const registry = applyGoProductRegistry({
    productRoot,
    product,
    cwd: SDK_ROOT,
    status: registryStatus,
    url,
    commit: git.commit,
    health,
    dryRun,
    skipRemote: skipRegistry || skipDeploy,
    spawn,
  });

  return {
    deployed,
    url,
    versionId,
    probes,
    receipt,
    receiptPath,
    productPath,
    productRow,
    registry,
    dockerOk,
  };
}

export function extractWorkersDevUrl(output = '') {
  const m = String(output).match(/https:\/\/[a-z0-9.-]+\.workers\.dev[^\s]*/i);
  return m ? m[0].replace(/[).,]+$/, '') : null;
}

export function guessWorkersDevUrl(product) {
  const account = process.env.CLOUDFLARE_ACCOUNT_SUBDOMAIN || process.env.CF_SUBDOMAIN || '';
  if (!account) return null;
  return `https://${product}.${account}.workers.dev`;
}

export async function probeGoDeployment(origin, { fetchImpl = globalThis.fetch } = {}) {
  const base = String(origin).replace(/\/+$/, '');
  const results = {};

  async function get(pathname) {
    const url = `${base}${pathname}`;
    try {
      const res = await fetchImpl(url, { headers: { Accept: 'application/json' } });
      let body = null;
      try { body = await res.json(); } catch { body = null; }
      results[pathname] = { status: res.status, ok: res.status >= 200 && res.status < 300, body };
      return { res, body };
    } catch (error) {
      results[pathname] = { status: 0, ok: false, error: error.message };
      return { res: null, body: null };
    }
  }

  async function post(pathname, payload) {
    const url = `${base}${pathname}`;
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      let body = null;
      try { body = await res.json(); } catch { body = null; }
      results[pathname] = { status: res.status, ok: res.status >= 200 && res.status < 300, body };
      return { res, body };
    } catch (error) {
      results[pathname] = { status: 0, ok: false, error: error.message };
      return { res: null, body: null };
    }
  }

  await get('/health');
  await get('/v1/runtime');
  const hash = await post('/v1/hash', { input: 'agentsam', algorithm: 'sha256' });
  const inspect = await post('/v1/inspect', {
    files: [{ path: 'demo.css', content: '.button { color: #2563eb; }' }],
  });
  // Probe malformed separately so it does not overwrite the successful /v1/inspect result.
  let malformed;
  try {
    const res = await fetchImpl(`${base}/v1/inspect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ not_files: true }),
    });
    malformed = { res, body: null };
    try { malformed.body = await res.json(); } catch { /* ignore */ }
  } catch (error) {
    malformed = { res: null, body: null, error: error.message };
  }

  const hashOk = Boolean(hash.body?.hash && String(hash.body.hash).length === 64);
  const inspectOk = Array.isArray(inspect.body?.findings)
    && inspect.body.findings.some((f) => f.kind === 'hardcoded_color' && f.value === '#2563eb');
  const malformedOk = Boolean(malformed.res && malformed.res.status >= 400);

  results['deterministic_hash'] = { ok: hashOk };
  results['deterministic_inspect'] = { ok: inspectOk };
  results['malformed_rejected'] = { ok: malformedOk };

  const required = ['/health', '/v1/runtime', 'deterministic_hash', 'deterministic_inspect', 'malformed_rejected'];
  const ok = required.every((key) => results[key]?.ok);
  return { origin: base, ok, results };
}
