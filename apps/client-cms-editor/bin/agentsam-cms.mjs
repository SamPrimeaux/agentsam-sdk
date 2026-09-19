#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(packageRoot, 'agentsam.app.json');

function usage() {
  console.log(`
AgentSam CMS Editor

  agentsam-cms [preview]
  agentsam-cms info
  agentsam-cms doctor
  agentsam-cms scaffold <directory>

preview
  Run the app preview script when present.

info
  Print the AgentSam app manifest.

doctor
  Verify frontend/backend/shared layout.

scaffold
  Copy editable source into a new directory (non-destructive if empty).
`.trim());
}

function info() {
  console.log(JSON.stringify(JSON.parse(fs.readFileSync(manifestPath, 'utf8')), null, 2));
}

function doctor() {
  const required = ['frontend', 'backend', 'shared', 'package.json', 'agentsam.app.json'];
  const missing = required.filter((rel) => !fs.existsSync(path.join(packageRoot, rel)));
  if (missing.length) {
    console.error('doctor failed; missing:', missing.join(', '));
    process.exit(1);
  }
  console.log('✓ client-cms-editor layout ok');
}

function scaffold(targetArg) {
  if (!targetArg) throw new Error('scaffold requires a target directory');
  const targetRoot = path.resolve(process.cwd(), targetArg);
  if (fs.existsSync(targetRoot) && fs.readdirSync(targetRoot).length) {
    throw new Error(`target directory is not empty: ${targetRoot}`);
  }
  fs.mkdirSync(targetRoot, { recursive: true });
  for (const relative of ['frontend', 'backend', 'shared', 'package.json', 'README.md', 'agentsam.app.json']) {
    const source = path.join(packageRoot, relative);
    if (!fs.existsSync(source)) continue;
    fs.cpSync(source, path.join(targetRoot, relative), { recursive: true });
  }
  console.log(`✓ scaffolded CMS editor into ${targetRoot}`);
}

function preview(args) {
  const pkg = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
  const script = pkg.scripts?.preview ? 'preview' : pkg.scripts?.dev ? 'dev' : null;
  if (!script) {
    console.error('no preview/dev script in package.json');
    process.exit(1);
  }
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npmCmd, ['run', script, '--', ...args], {
    cwd: packageRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  process.exit(result.status ?? 1);
}

const [cmd = 'preview', ...rest] = process.argv.slice(2);
try {
  if (cmd === '--help' || cmd === '-h' || cmd === 'help') usage();
  else if (cmd === 'info') info();
  else if (cmd === 'doctor') doctor();
  else if (cmd === 'scaffold') scaffold(rest[0]);
  else if (cmd === 'preview') preview(rest);
  else {
    console.error(`unknown command: ${cmd}`);
    usage();
    process.exit(1);
  }
} catch (err) {
  console.error(String(err?.message || err));
  process.exit(1);
}
