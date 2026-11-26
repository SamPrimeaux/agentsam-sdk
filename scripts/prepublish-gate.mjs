#!/usr/bin/env node
// Keep npm publish fast: full verification is an explicit release/CI step.
// The release publisher independently checks package inventory, dependency graph,
// version alignment and dependency pins before publishing.
import { spawnSync } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
for (const script of ['release:train:check']) {
  const result = spawnSync(npm, ['run', script], { stdio: 'inherit', env: process.env, shell: process.platform === 'win32' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
