#!/usr/bin/env node
/** npm pack dry-run for client-cms-editor — no nested node_modules, no harvest payload. */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const cwd = join(dirname(fileURLToPath(import.meta.url)), '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const result = spawnSync(npm, ['pack', '--dry-run', '--json'], {
  cwd,
  encoding: 'utf8',
});

if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout || 'npm pack failed\n');
  process.exit(result.status || 1);
}

let pack;
try {
  const payload = JSON.parse(result.stdout);
  pack = payload[0];
} catch (error) {
  process.stderr.write(result.stdout || '');
  process.stderr.write(`\npack:check failed to parse npm pack JSON: ${error.message}\n`);
  process.exit(1);
}

const paths = (pack.files || []).map((entry) => entry.path);
const nested = paths.filter((path) => path.split('/').includes('node_modules'));
if (nested.length) {
  console.error('pack:check failed: nested node_modules would be published');
  for (const path of nested.slice(0, 40)) console.error(`- ${path}`);
  process.exit(1);
}

const harvest = paths.filter((path) => path.includes('reference/harvest'));
if (harvest.length) {
  console.error('pack:check failed: reference/harvest must not ship in the npm tarball');
  for (const path of harvest.slice(0, 20)) console.error(`- ${path}`);
  process.exit(1);
}

const required = [
  'package.json',
  'bin/agentsam-cms.js',
  'dist/index.js',
  'dist/index.d.ts',
  'dist/adapter.js',
  'dist/adapter.d.ts',
  'dist/sqlite-adapter.js',
  'dist/sqlite-adapter.d.ts',
  'dist/import/index.js',
  'dist/local/index.js',
  'dist/styles/studio.css',
  'acceptance/cms-parity.v1.json',
];
for (const hint of required) {
  if (!paths.some((p) => p === hint || p.startsWith(`${hint}/`))) {
    console.error(`pack:check failed: expected packed path ${hint}`);
    process.exit(1);
  }
}

// Bin must remain installable (npm previously warned about invalid bin entries).
const binPath = paths.find((p) => p === 'bin/agentsam-cms.js');
if (!binPath) {
  console.error('pack:check failed: agentsam-cms bin entry file missing from tarball');
  process.exit(1);
}

const forbidden = paths.filter(
  (path) =>
    path === 'dist/adapters/sqlite.d.ts' ||
    path.startsWith('dist/frontend/') ||
    path.startsWith('dist/shared/cms/') ||
    path.startsWith('dist/backend/src/') ||
    path.startsWith('dist/fixtures/') ||
    path.startsWith('fixtures/') ||
    path.startsWith('.dts-tmp/'),
);
if (forbidden.length) {
  console.error('pack:check failed: compiler-dump / internal declaration paths must not ship');
  for (const path of forbidden.slice(0, 40)) console.error(`- ${path}`);
  process.exit(1);
}

console.log(
  `pack:check OK ${pack.name}@${pack.version} · ${pack.files.length} files · bin=agentsam-cms.js · clean dist surface`,
);
