#!/usr/bin/env node
/**
 * Ensure apps/client-cms-editor/dist exists for CLI/scaffold proofs.
 * dist is gitignored; clean checkouts (incl. GitHub Actions) must build it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cmsRoot = path.join(root, 'apps/client-cms-editor');
const marker = path.join(cmsRoot, 'dist/sqlite-adapter.js');

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', env: process.env });
  if (result.status) process.exit(result.status ?? 1);
}

if (fs.existsSync(marker)) {
  process.stdout.write('ensure-cms-dist: dist already present\n');
  process.exit(0);
}

process.stdout.write('ensure-cms-dist: building client-cms-editor dist for clean checkout\n');
run('npm', ['ci', '--prefix', 'apps/client-cms-editor']);
run('npm', ['run', 'build', '--prefix', 'apps/client-cms-editor']);

if (!fs.existsSync(marker)) {
  console.error('ensure-cms-dist: build finished but missing', marker);
  process.exit(1);
}
