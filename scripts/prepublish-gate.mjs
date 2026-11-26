#!/usr/bin/env node
// prepublishOnly entry. `npm publish --dry-run` exports npm_config_dry_run to
// lifecycle scripts, and every child `npm pack` / `npm install` the release gates
// run would then print a tarball name without writing it (ENOENT in packed-consumer
// tests). Only the final publish step is a dry run; the gates must run for real.
import { spawnSync } from 'node:child_process';

const env = { ...process.env };
for (const key of Object.keys(env)) {
  if (/^npm_config_dry[_-]?run$/i.test(key)) delete env[key];
}

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
for (const script of ['release:train:check']) {
  const result = spawnSync(npm, ['run', script], { stdio: 'inherit', env, shell: process.platform === 'win32' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
