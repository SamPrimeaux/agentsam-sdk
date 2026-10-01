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

// npm run can export user-level allow-scripts config as npm_config_*.
// npm 11 rejects that inherited option for a nested project-scoped install
// (npm ci --prefix ...). Preserve the user's npm config on disk, but do not
// forward this parent-process option into the nested CMS install.
const childEnv = { ...process.env };
for (const key of Object.keys(childEnv)) {
  if (/^npm_config_allow[_-]?scripts$/i.test(key)) delete childEnv[key];
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', env: childEnv });
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
