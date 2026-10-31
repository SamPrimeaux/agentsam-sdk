#!/usr/bin/env node
/**
 * Reproducible source-checkout build shared by Workers Builds and release CI.
 * Registry-consumer publication checks remain a separate release gate.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const studio = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(studio, '../..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const steps = [
  ['Install root dependencies', npm, ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], repo],
  ['Install Ecommerce dependencies', npm, ['run', 'install:studio'], path.join(repo, 'apps/ecommerce-cms-agentsam')],
  ['Verify Ecommerce installer', process.execPath, ['--test', 'apps/ecommerce-cms-agentsam/tests/install-studio-deps.test.mjs'], repo],
  ['Install Studio dependencies', npm, ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], studio],
  ['Build and verify complete hosted application', npm, ['run', 'cf:build'], studio],
];
if (process.argv.includes('--plan')) {
  console.log(JSON.stringify(steps.map(([name, command, args, cwd]) => ({
    name, command: command === process.execPath ? 'node' : command, args, cwd: path.relative(repo, cwd) || '.',
  })), null, 2));
} else {
  for (const cwd of [repo, studio, path.join(repo, 'apps/ecommerce-cms-agentsam')]) {
    if (!existsSync(path.join(cwd, 'package-lock.json'))) throw new Error('Required lockfile missing: ' + path.relative(repo, cwd));
  }
  for (const [name, command, args, cwd] of steps) {
    console.log('[source-build] ' + name);
    execFileSync(command, args, { cwd, stdio: 'inherit', env: process.env });
  }
}
