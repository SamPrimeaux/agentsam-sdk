import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

function must(relative) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) throw new Error(`required publish artifact missing: ${relative}`);
}

for (const relative of [
  'frontend/dist/index.html',
  'backend/dist/server.cjs',
  'bin/agentsam-cad-creator.mjs',
  'agentsam.app.json',
  'backend/worker/index.js',
  'backend/wrangler.jsonc'
]) must(relative);

const assetsDir = path.join(root, 'frontend', 'dist', 'assets');
const assets = fs.readdirSync(assetsDir);
if (!assets.some((name) => name.startsWith('RoboticsWorkspace-') && name.endsWith('.js'))) {
  throw new Error('robotics lazy chunk missing from production build');
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (pkg.private === true) throw new Error('publish package must not be private');
if (pkg.name !== '@inneranimalmedia/agentsam-sdk-cad-creator') {
  throw new Error(`unexpected package name: ${pkg.name}`);
}
if (!Array.isArray(pkg.files) || pkg.files.some((entry) => entry.startsWith('reference'))) {
  throw new Error('reference/donor files must never be part of the publish whitelist');
}

console.log('CAD Creator publish package verification OK');
