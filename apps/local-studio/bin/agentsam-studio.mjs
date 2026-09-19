#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(packageRoot, 'agentsam.app.json');

function usage() {
  console.log(`
AgentSam Local Studio

  agentsam-studio [preview]
  agentsam-studio info
  agentsam-studio doctor

preview
  Start the local Studio Vite/Nitro preview (npm run preview in the app root).

info
  Print the AgentSam app manifest.

doctor
  Check package scripts and required workspace layout.
`.trim());
}

function info() {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  console.log(JSON.stringify(manifest, null, 2));
}

function doctor() {
  const required = ['frontend', 'backend', 'shared', 'package.json', 'agentsam.app.json'];
  const missing = required.filter((rel) => !fs.existsSync(path.join(packageRoot, rel)));
  if (missing.length) {
    console.error('doctor failed; missing:', missing.join(', '));
    process.exit(1);
  }
  console.log('✓ local-studio layout ok');
  console.log(`  root ${packageRoot}`);
}

function preview(args) {
  const result = spawnSync('npm', ['run', 'preview', '--', ...args], {
    cwd: packageRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  process.exit(result.status ?? 1);
}

const [cmd = 'preview', ...rest] = process.argv.slice(2);
if (cmd === '--help' || cmd === '-h' || cmd === 'help') usage();
else if (cmd === 'info') info();
else if (cmd === 'doctor') doctor();
else if (cmd === 'preview') preview(rest);
else {
  console.error(`unknown command: ${cmd}`);
  usage();
  process.exit(1);
}
