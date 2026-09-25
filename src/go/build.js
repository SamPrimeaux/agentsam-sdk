import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { gitEvidence } from '../knowledge/config.js';
import { writeGoBuildReceipt } from './receipts.js';

export function runGoTests(runtimeRoot, { spawn = spawnSync } = {}) {
  const res = spawn('go', ['test', './...'], { cwd: runtimeRoot, encoding: 'utf8' });
  return {
    ok: res.status === 0,
    status: res.status,
    stdout: res.stdout || '',
    stderr: res.stderr || '',
  };
}

export function runGoVet(runtimeRoot, { spawn = spawnSync } = {}) {
  const res = spawn('go', ['vet', './...'], { cwd: runtimeRoot, encoding: 'utf8' });
  return {
    ok: res.status === 0,
    status: res.status,
    stdout: res.stdout || '',
    stderr: res.stderr || '',
  };
}

export function runGoBuild(runtimeRoot, { outDir = null, spawn = spawnSync } = {}) {
  const binDir = outDir || path.join(runtimeRoot, '..', '.agentsam', 'go-build');
  fs.mkdirSync(binDir, { recursive: true });
  const out = path.join(binDir, 'agentsam-go-worker');
  const res = spawn('go', ['build', '-o', out, './cmd/server'], { cwd: runtimeRoot, encoding: 'utf8' });
  return {
    ok: res.status === 0,
    status: res.status,
    binary: res.status === 0 ? out : null,
    stdout: res.stdout || '',
    stderr: res.stderr || '',
  };
}

/**
 * Build + test the discovered Go runtime and emit a build receipt.
 */
export function buildGoProduct({ productRoot, runtimeRoot, repositoryRoot, dryRun = false } = {}) {
  if (!runtimeRoot || !fs.existsSync(path.join(runtimeRoot, 'go.mod'))) {
    throw new Error('go_runtime_missing');
  }
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
  const build = dryRun ? { ok: true, skipped: true, binary: null } : runGoBuild(runtimeRoot);
  if (!build.ok) {
    const err = new Error('go_build_failed');
    err.detail = build;
    throw err;
  }

  const git = gitEvidence(repositoryRoot || productRoot);
  let goVersion = null;
  try {
    goVersion = spawnSync('go', ['env', 'GOVERSION'], { encoding: 'utf8' }).stdout?.trim() || null;
  } catch {
    goVersion = null;
  }

  const receipt = {
    schema: 'agentsam.go-build-receipt.v1',
    product: path.basename(productRoot),
    runtime: {
      language: 'go',
      version: goVersion,
      module_root: runtimeRoot,
    },
    source: {
      repository_id: path.basename(repositoryRoot || productRoot),
      commit: git.commit,
      branch: git.branch,
      dirty: git.dirty,
    },
    artifact: {
      type: build.binary ? 'binary' : 'none',
      path: build.binary,
      digest: null,
    },
    tests: {
      go_test: Boolean(tests.ok),
      go_vet: Boolean(vet.ok),
      runtime_probe: false,
    },
    target: {
      provider: 'local',
      kind: 'build',
    },
    built_at: new Date().toISOString(),
  };

  const receiptPath = writeGoBuildReceipt(productRoot, receipt);
  return { receipt, receiptPath, tests, vet, build };
}
