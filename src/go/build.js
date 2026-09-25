import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gitEvidence } from '../knowledge/config.js';
import { writeGoBuildReceipt } from './receipts.js';

const BUILD_COMMIT_FILE = '.agentsam-build-commit';
const BUILD_TIME_FILE = '.agentsam-built-at';
const NATIVE_PROBE_RUNNER = fileURLToPath(new URL('./native-probe-runner.mjs', import.meta.url));

function ldflags(commit, builtAt) {
  return [
    '-s',
    '-w',
    '-X github.com/inneranimalmedia/agentsam-go-worker/internal/health.BuildCommit=' + (commit || ''),
    '-X github.com/inneranimalmedia/agentsam-go-worker/internal/health.BuildTime=' + (builtAt || ''),
  ].join(' ');
}

export function writeBuildProvenance(runtimeRoot, { commit = '', builtAt = '' } = {}) {
  fs.writeFileSync(path.join(runtimeRoot, BUILD_COMMIT_FILE), commit + '\n', 'utf8');
  fs.writeFileSync(path.join(runtimeRoot, BUILD_TIME_FILE), builtAt + '\n', 'utf8');
}

export function runGoTests(runtimeRoot, { spawn = spawnSync } = {}) {
  const res = spawn('go', ['test', './...'], { cwd: runtimeRoot, encoding: 'utf8' });
  return { ok: res.status === 0, status: res.status, stdout: res.stdout || '', stderr: res.stderr || '' };
}

export function runGoVet(runtimeRoot, { spawn = spawnSync } = {}) {
  const res = spawn('go', ['vet', './...'], { cwd: runtimeRoot, encoding: 'utf8' });
  return { ok: res.status === 0, status: res.status, stdout: res.stdout || '', stderr: res.stderr || '' };
}

export function runGoBuild(runtimeRoot, {
  outDir = null,
  commit = '',
  builtAt = '',
  spawn = spawnSync,
} = {}) {
  const binDir = outDir || path.join(runtimeRoot, '..', '.agentsam', 'go-build');
  fs.mkdirSync(binDir, { recursive: true });
  const out = path.join(binDir, 'agentsam-go-worker');
  const res = spawn('go', [
    'build',
    '-trimpath',
    '-ldflags',
    ldflags(commit, builtAt),
    '-o',
    out,
    './cmd/server',
  ], { cwd: runtimeRoot, encoding: 'utf8' });
  return {
    ok: res.status === 0,
    status: res.status,
    binary: res.status === 0 ? out : null,
    stdout: res.stdout || '',
    stderr: res.stderr || '',
  };
}

export function sha256File(file) {
  const hash = createHash('sha256');
  hash.update(fs.readFileSync(file));
  return 'sha256:' + hash.digest('hex');
}

export function runNativeRuntimeProbe(binary, {
  expectedCommit = '',
  spawn = spawnSync,
} = {}) {
  if (!binary || !fs.existsSync(binary)) return { ok: false, error: 'binary_missing', results: {} };
  const res = spawn(process.execPath, [NATIVE_PROBE_RUNNER, binary, expectedCommit], {
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  });
  let parsed = null;
  try { parsed = JSON.parse(res.stdout || '{}'); } catch {}
  return {
    ok: res.status === 0 && parsed?.ok === true,
    status: res.status,
    ...(parsed || {}),
    stdout: parsed ? '' : (res.stdout || ''),
    stderr: ((parsed?.stderr || '') + (res.stderr || '')).trim(),
  };
}

/**
 * Build + test + boot the discovered Go runtime and emit deployment-grade
 * source/artifact evidence.
 */
export function buildGoProduct({
  productRoot,
  runtimeRoot,
  repositoryRoot,
  dryRun = false,
} = {}) {
  if (!runtimeRoot || !fs.existsSync(path.join(runtimeRoot, 'go.mod'))) {
    throw new Error('go_runtime_missing');
  }

  const git = gitEvidence(repositoryRoot || productRoot);
  const builtAt = new Date().toISOString();
  writeBuildProvenance(runtimeRoot, { commit: git.commit, builtAt });

  const tests = dryRun ? { ok: true, skipped: true } : runGoTests(runtimeRoot);
  if (!tests.ok) {
    const err = new Error('go_test_failed');
    err.detail = tests;
    throw err;
  }

  const vet = dryRun ? { ok: true, skipped: true } : runGoVet(runtimeRoot);
  if (!vet.ok) {
    const err = new Error('go_vet_failed');
    err.detail = vet;
    throw err;
  }

  const build = dryRun
    ? { ok: true, skipped: true, binary: null }
    : runGoBuild(runtimeRoot, { commit: git.commit, builtAt });
  if (!build.ok) {
    const err = new Error('go_build_failed');
    err.detail = build;
    throw err;
  }

  const probe = dryRun
    ? { ok: true, skipped: true, results: {} }
    : runNativeRuntimeProbe(build.binary, { expectedCommit: git.commit });
  if (!probe.ok) {
    const err = new Error('go_runtime_probe_failed');
    err.detail = probe;
    throw err;
  }

  let goVersion = null;
  try {
    goVersion = spawnSync('go', ['env', 'GOVERSION'], { encoding: 'utf8' }).stdout?.trim() || null;
  } catch {}

  const receipt = {
    schema: 'agentsam.go-build-receipt.v1',
    product: path.basename(productRoot),
    runtime: { language: 'go', version: goVersion, module_root: runtimeRoot },
    source: {
      repository_id: path.basename(repositoryRoot || productRoot),
      commit: git.commit,
      branch: git.branch,
      dirty: git.dirty,
    },
    artifact: {
      type: build.binary ? 'binary' : 'none',
      path: build.binary,
      digest: build.binary ? sha256File(build.binary) : null,
    },
    tests: {
      go_test: Boolean(tests.ok),
      go_vet: Boolean(vet.ok),
      runtime_probe: Boolean(probe.ok),
    },
    probe,
    target: { provider: 'local', kind: 'build' },
    built_at: builtAt,
  };

  const receiptPath = writeGoBuildReceipt(productRoot, receipt);
  return { receipt, receiptPath, tests, vet, build, probe };
}
