#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanProjectSecurity, reportExitCode } from '../src/security/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-release-security-'));
const artifacts = path.join(temp, 'artifacts');
const consumer = path.join(temp, 'consumer');
fs.mkdirSync(artifacts, { recursive: true });
fs.mkdirSync(consumer, { recursive: true });

const npmUserConfig = path.join(temp, 'npmrc');
const npmGlobalConfig = path.join(temp, 'global-npmrc');
const npmCache = path.join(temp, 'npm-cache');
fs.writeFileSync(npmUserConfig, 'registry=https://registry.npmjs.org/\nignore-scripts=true\n');
fs.writeFileSync(npmGlobalConfig, '');
const cleanNpmEnv = { ...process.env };
for (const key of Object.keys(cleanNpmEnv)) {
  if (/^npm_config_/i.test(key) || /^(npm_token|node_auth_token)$/i.test(key)) delete cleanNpmEnv[key];
}
cleanNpmEnv.NPM_CONFIG_USERCONFIG = npmUserConfig;
cleanNpmEnv.NPM_CONFIG_GLOBALCONFIG = npmGlobalConfig;
cleanNpmEnv.NPM_CONFIG_CACHE = npmCache;

function run(command, args, options = {}) {
  const env = command === 'npm' ? { ...cleanNpmEnv, ...(options.env || {}) } : options.env;
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...options, env });
  if (result.status !== 0) {
    const error = new Error(`release_security_command_failed: ${command} ${args.join(' ')}`);
    error.stdout = result.stdout;
    error.stderr = result.stderr;
    throw error;
  }
  return result;
}

try {
  const packed = JSON.parse(run('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', artifacts], { cwd: ROOT }).stdout)[0];
  assert.equal(packed.name, pkg.name);
  assert.equal(packed.version, pkg.version);
  run('npm', ['init', '-y'], { cwd: consumer });
  run('npm', ['install', '--no-audit', '--no-fund', path.join(artifacts, packed.filename)], { cwd: consumer });

  const installed = JSON.parse(fs.readFileSync(path.join(consumer, 'node_modules', '@inneranimalmedia', 'agentsam-sdk', 'package.json'), 'utf8'));
  assert.equal(installed.name, pkg.name);
  assert.equal(installed.version, pkg.version);

  const report = await scanProjectSecurity({
    projectRoot: consumer,
    releaseCandidate: {
      name: pkg.name,
      version: pkg.version,
      location: 'node_modules/@inneranimalmedia/agentsam-sdk',
    },
  });
  const code = reportExitCode(report);
  if (code !== 0) {
    process.stderr.write(JSON.stringify({
      ok: report.ok, status: report.status, complete: report.complete,
      issues: report.issues, findings: report.findings,
    }, null, 2) + '\n');
    process.exit(code);
  }
  process.stdout.write(`verify-release-security OK ${pkg.name}@${pkg.version} · ${report.checked_count}/${report.dependency_count} dependencies checked · clean consumer artifact\n`);
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
