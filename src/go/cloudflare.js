import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parseWranglerVersionId } from '../lib/deploy/health.js';
import { writeDeploymentReceipt, writeProductRegistryLocal, buildProductRow } from './receipts.js';
import { applyGoProductRegistry } from './registry.js';
import { gitEvidence } from '../knowledge/config.js';
import { SDK_ROOT } from './discover.js';

const EXPECTED_HASH = '2e60bba13dc2bc37d75dd2ce5deb25466f19cb2994e20889388948879875eae9';

function resolveWranglerInvocation(productRoot) {
  const js = path.join(productRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  if (fs.existsSync(js)) return { command: process.execPath, args: [js] };
  const bin = path.join(productRoot, 'node_modules', '.bin', 'wrangler');
  if (fs.existsSync(bin)) return { command: bin, args: [] };
  return { command: 'npx', args: ['--yes', 'wrangler'] };
}

function runWrangler(wrangler, args, { productRoot, spawn = spawnSync } = {}) {
  const res = spawn(wrangler.command, wrangler.args.concat(args), {
    cwd: productRoot,
    encoding: 'utf8',
    env: { ...process.env },
    maxBuffer: 16 * 1024 * 1024,
  });
  return {
    status: res.status,
    stdout: res.stdout || '',
    stderr: res.stderr || '',
    output: ((res.stdout || '') + '\n' + (res.stderr || '')).trim(),
  };
}

function parseJSON(text) {
  try { return JSON.parse(String(text || '').trim()); } catch { return null; }
}

export function readLatestWranglerDeployment(productRoot, product, { spawn = spawnSync } = {}) {
  const wrangler = resolveWranglerInvocation(productRoot);
  const res = runWrangler(wrangler, ['deployments', 'list', '--name', product, '--json'], { productRoot, spawn });
  if (res.status !== 0) {
    return { ok: false, error: 'wrangler_deployments_list_failed', detail: res.output.slice(0, 2000) };
  }
  const rows = parseJSON(res.stdout);
  if (!Array.isArray(rows) || !rows.length) {
    return { ok: false, error: 'wrangler_deployment_identity_missing', detail: res.stdout.slice(0, 2000) };
  }
  rows.sort((a, b) => String(b.created_on || '').localeCompare(String(a.created_on || '')));
  const latest = rows[0];
  const version = Array.isArray(latest.versions)
    ? [...latest.versions].sort((a, b) => Number(b.percentage || 0) - Number(a.percentage || 0))[0]
    : null;
  return {
    ok: true,
    deployment_id: latest.id || null,
    version_id: version?.version_id || null,
    created_on: latest.created_on || null,
    source: latest.source || null,
  };
}

export async function deployGoCloudflare({
  productRoot,
  product = 'agentsam-go-worker',
  dryRun = false,
  skipDeploy = false,
  skipRegistry = false,
  artifactDigest = null,
  containerDigest = null,
  spawn = spawnSync,
  fetchImpl = globalThis.fetch,
} = {}) {
  const wranglerConfig = path.join(productRoot, 'wrangler.jsonc');
  if (!fs.existsSync(wranglerConfig)) throw new Error('wrangler_config_missing: ' + wranglerConfig);

  const docker = spawn('docker', ['info'], { encoding: 'utf8' });
  const dockerOk = docker.status === 0;
  if (!dockerOk && !skipDeploy) {
    const err = new Error('docker_unavailable');
    err.detail = (docker.stderr || docker.stdout || '').trim().slice(0, 400);
    err.hint = 'Cloudflare Containers require a local container engine for image build.';
    throw err;
  }

  const git = gitEvidence(path.resolve(productRoot, '../..'));
  const wrangler = resolveWranglerInvocation(productRoot);
  let deployOutput = '';
  let deployed = false;
  let dryRunValidated = false;
  let identity = { ok: false, deployment_id: null, version_id: null, created_on: null };

  if (skipDeploy) {
    deployOutput = 'skip_deploy';
  } else if (dryRun) {
    const res = runWrangler(wrangler, ['deploy', '-c', 'wrangler.jsonc', '--dry-run'], { productRoot, spawn });
    deployOutput = res.output;
    if (res.status !== 0) {
      const err = new Error('wrangler_dry_run_failed');
      err.detail = deployOutput.slice(0, 3000);
      throw err;
    }
    dryRunValidated = true;
  } else {
    const res = runWrangler(wrangler, ['deploy', '-c', 'wrangler.jsonc'], { productRoot, spawn });
    deployOutput = res.output;
    if (res.status !== 0) {
      const err = new Error('wrangler_deploy_failed');
      err.detail = deployOutput.slice(0, 3000);
      throw err;
    }
    deployed = true;
    identity = readLatestWranglerDeployment(productRoot, product, { spawn });
    if (!identity.ok) {
      const err = new Error(identity.error || 'wrangler_deployment_identity_missing');
      err.detail = identity.detail;
      throw err;
    }
  }

  const outputVersionId = parseWranglerVersionId(deployOutput);
  const versionId = identity.version_id || outputVersionId || null;
  const deploymentId = identity.deployment_id || null;
  const url = deployed ? (extractWorkersDevUrl(deployOutput) || guessWorkersDevUrl(product)) : null;
  if (deployed && !url) {
    const err = new Error('cloudflare_deployment_url_missing');
    err.detail = deployOutput.slice(0, 3000);
    throw err;
  }

  const probes = deployed
    ? await probeGoDeploymentWithRetry(url, {
        fetchImpl,
        expectedSourceCommit: git.commit,
        expectedTarget: 'cloudflare',
        edge: true,
      })
    : {
        skipped: true,
        ok: Boolean(skipDeploy || dryRunValidated),
        results: {},
        checks: {},
        probed_at: null,
      };

  const health = probes.skipped ? 'pending' : (probes.ok ? 'healthy' : 'degraded');
  const receipt = {
    product,
    provider: 'cloudflare',
    kind: 'worker-container',
    url,
    health,
    artifact_digest: artifactDigest,
    container_image_digest: containerDigest,
    worker_deployment_id: deploymentId,
    worker_version_id: versionId,
    deployed_at: deployed ? (identity.created_on || new Date().toISOString()) : null,
    source_commit: git.commit,
    probes,
    dry_run: Boolean(dryRun),
    dry_run_validated: Boolean(dryRunValidated),
    skipped_deploy: Boolean(skipDeploy),
  };

  const receiptPath = writeDeploymentReceipt(productRoot, receipt);
  const productRow = buildProductRow({
    product,
    repositoryId: 'github:samprimeaux/agentsam-sdk',
    commit: git.commit,
    url,
    health,
    workerDeploymentId: deploymentId,
    workerVersionId: versionId,
    artifactDigest,
    containerDigest,
  });
  const productPath = writeProductRegistryLocal(productRoot, productRow);

  const registryStatus = health === 'healthy' ? 'deployed' : (deployed ? 'degraded' : 'built');
  const registry = applyGoProductRegistry({
    productRoot,
    product,
    cwd: SDK_ROOT,
    status: registryStatus,
    url,
    commit: git.commit,
    health,
    workerDeploymentId: deploymentId,
    workerVersionId: versionId,
    artifactDigest,
    containerDigest,
    dryRun,
    skipRemote: skipRegistry || skipDeploy || dryRun || health !== 'healthy',
    spawn,
  });

  return {
    deployed,
    dryRunValidated,
    url,
    versionId,
    deploymentId,
    probes,
    receipt,
    receiptPath,
    productPath,
    productRow,
    registry,
    dockerOk,
    deployOutput,
  };
}

export function extractWorkersDevUrl(output = '') {
  const match = String(output).match(/https:\/\/[a-z0-9.-]+\.workers\.dev[^\s]*/i);
  return match ? match[0].replace(/[).,]+$/, '') : null;
}

export function guessWorkersDevUrl(product) {
  const account = process.env.CLOUDFLARE_ACCOUNT_SUBDOMAIN || process.env.CF_SUBDOMAIN || '';
  return account ? 'https://' + product + '.' + account + '.workers.dev' : null;
}

export async function probeGoDeployment(origin, {
  fetchImpl = globalThis.fetch,
  expectedSourceCommit = null,
  expectedTarget = null,
  edge = true,
} = {}) {
  const base = String(origin).replace(/\/+$/, '');
  const results = {};
  const checks = {};
  const probedAt = new Date().toISOString();

  async function request(key, pathname, init = {}) {
    try {
      const res = await fetchImpl(base + pathname, init);
      let body = null;
      try { body = await res.json(); } catch {}
      results[key] = {
        path: pathname,
        status: res.status,
        ok: res.status >= 200 && res.status < 300,
        body,
      };
      return results[key];
    } catch (error) {
      results[key] = { path: pathname, status: 0, ok: false, error: error.message };
      return results[key];
    }
  }

  if (edge) {
    await request('edge_root', '/', { headers: { Accept: 'application/json' } });
    await request('edge_health', '/edge/health', { headers: { Accept: 'application/json' } });
  }
  await request('health', '/health', { headers: { Accept: 'application/json' } });
  await request('runtime', '/v1/runtime', { headers: { Accept: 'application/json' } });
  await request('capabilities', '/v1/capabilities', { headers: { Accept: 'application/json' } });
  await request('hash', '/v1/hash', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ input: 'agentsam', algorithm: 'sha256' }),
  });
  await request('inspect', '/v1/inspect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ files: [{ path: 'demo.css', content: '.button { color: #2563eb; }' }] }),
  });
  await request('malformed', '/v1/inspect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ not_files: true }),
  });

  const health = results.health?.body;
  const runtime = results.runtime?.body;
  const caps = results.capabilities?.body;
  const malformed = results.malformed?.body;

  if (edge) {
    checks.edge_root = results.edge_root?.status === 200 && results.edge_root?.body?.edge === 'worker';
    checks.edge_health = results.edge_health?.status === 200 && results.edge_health?.body?.edge === 'worker';
  }
  checks.health = results.health?.status === 200
    && health?.ok === true
    && health?.runtime === 'go'
    && (!expectedTarget || health?.target === expectedTarget);
  checks.source_commit = expectedSourceCommit ? health?.build?.commit === expectedSourceCommit : true;
  checks.runtime = results.runtime?.status === 200
    && runtime?.schema === 'agentsam.go-runtime.v1'
    && runtime?.os === 'linux';
  checks.capabilities = results.capabilities?.status === 200
    && caps?.schema === 'agentsam.go-capabilities.v1'
    && ['hash', 'inspect', 'runtime', 'capabilities'].every((name) => caps?.capabilities?.includes(name));
  checks.hash = results.hash?.status === 200 && results.hash?.body?.hash === EXPECTED_HASH;
  checks.inspect = results.inspect?.status === 200
    && results.inspect?.body?.findings?.some((finding) => finding.kind === 'hardcoded_color' && finding.value === '#2563eb');
  checks.error_envelope = results.malformed?.status === 400
    && malformed?.ok === false
    && malformed?.schema_version === 1
    && malformed?.reason === 'input_invalid'
    && malformed?.code === 'INVALID_ARGUMENT';

  results.deterministic_hash = { ok: checks.hash };
  results.deterministic_inspect = { ok: checks.inspect };
  results.malformed_rejected = { ok: checks.error_envelope };
  const ok = Object.values(checks).every(Boolean);
  return { origin: base, ok, checks, results, probed_at: probedAt };
}

export async function probeGoDeploymentWithRetry(origin, {
  attempts = 12,
  delayMs = 2500,
  ...options
} = {}) {
  let latest = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    latest = await probeGoDeployment(origin, options);
    latest.attempt = attempt;
    if (latest.ok) return latest;
    if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return latest || { origin, ok: false, checks: {}, results: {}, probed_at: new Date().toISOString() };
}
