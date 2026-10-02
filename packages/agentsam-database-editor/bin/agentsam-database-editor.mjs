#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packagePath = path.join(packageRoot, 'package.json');
const manifestPath = path.join(packageRoot, 'agentsam.app.json');

function usage() {
  console.log(`AgentSam Database Editor

Usage:
  agentsam-database-editor info
  agentsam-database-editor doctor
  agentsam-database-editor preview [--host <host>] [--port <port>]

The database editor package owns portable database adapters + UI modules.
Local Studio is the first production host for the full /database UI.
`);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function info() {
  const pkg = readJson(packagePath);
  const manifest = readJson(manifestPath);
  console.log(JSON.stringify({
    package: pkg.name,
    version: pkg.version,
    app_id: manifest.id,
    display_name: manifest.display_name ?? manifest.name,
    capabilities: manifest.capabilities ?? [],
    providers: Object.keys(manifest.providers ?? {}),
    host_route: manifest.routes?.home ?? '/database',
  }, null, 2));
}

function doctor() {
  const required = [
    'package.json',
    'agentsam.app.json',
    'bin/agentsam-database-editor.mjs',
    'backend/index.js',
    'backend/sqlite.js',
    'dist/frontend/index.js',
    'dist/ui/index.js',
  ];

  const missing = required.filter((rel) => !fs.existsSync(path.join(packageRoot, rel)));

  if (missing.length) {
    console.error('Database Editor package is incomplete:');
    for (const rel of missing) console.error(`  - ${rel}`);
    process.exit(1);
  }

  const pkg = readJson(packagePath);
  if (pkg.bin?.['agentsam-database-editor'] !== 'bin/agentsam-database-editor.mjs') {
    console.error('Database Editor package bin contract is missing or incorrect.');
    process.exit(1);
  }

  console.log('✓ AgentSam Database Editor package OK');
  console.log('  adapters: D1, Postgres/Supabase/Hyperdrive, local SQLite');
  console.log('  vectors: optional');
  console.log('  UI host: AgentSam Local Studio /database');
}

function preview(args) {
  const result = spawnSync('agentsam-studio', ['preview', ...args], {
    stdio: 'inherit',
  });

  if (result.error?.code === 'ENOENT') {
    console.error('Database Editor UI requires a host.');
    console.error('Install AgentSam Local Studio, then run:');
    console.error('  agentsam-studio preview');
    console.error('and open /database.');
    process.exit(2);
  }

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  process.exit(result.status ?? 0);
}

const [cmd = 'help', ...args] = process.argv.slice(2);

if (cmd === 'info') info();
else if (cmd === 'doctor') doctor();
else if (cmd === 'preview') preview(args);
else if (cmd === 'help' || cmd === '--help' || cmd === '-h') usage();
else {
  console.error(`unknown command: ${cmd}`);
  usage();
  process.exit(2);
}
