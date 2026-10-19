import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

function must(relative) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) throw new Error(`required publish artifact missing: ${relative}`);
}

for (const relative of [
  'frontend/dist/index.html',
  'backend/dist/server.mjs',
  'bin/agentsam-cad-creator.mjs',
  'bin/freecad-bim-preview.py',
  'BIM_STARTERS.md',
  'agentsam.app.json',
  'backend/worker/index.js',
  'backend/wrangler.jsonc'
]) must(relative);

const schemaPath = path.join(root, 'schemas', 'cad.project.v2.schema.json');
const sourcePath = path.join(root, '..', '..', 'protocol', 'cad', 'cad.project.v2.schema.json');
must('schemas/cad.project.v2.schema.json');
if (!fs.existsSync(sourcePath) || fs.readFileSync(schemaPath, 'utf8') !== fs.readFileSync(sourcePath, 'utf8')) {
  throw new Error('CAD v2 npm schema differs from SDK canonical protocol');
}
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
if (schema.$id !== 'https://schemas.inneranimalmedia.com/apps/cad-creator/schemas/cad.project.v2.schema.json' ||
    schema.properties?.schema?.const !== 'cad.project.v2') {
  throw new Error('CAD v2 schema identity or contract mismatch');
}

const modularRoot = path.join(root, '..', '..', 'protocol', 'cad', 'v2');
const manifestSource = path.join(modularRoot, 'schema-pack.manifest.json');
const manifestTarget = path.join(root, 'schemas', 'v2', 'schema-pack.manifest.json');
if (!fs.existsSync(manifestTarget) || !fs.readFileSync(manifestTarget).equals(fs.readFileSync(manifestSource))) {
  throw new Error('CAD modular schema manifest missing or differs from SDK authority');
}
const pack = JSON.parse(fs.readFileSync(manifestSource, 'utf8'));
if (pack.modules.length < 20) throw new Error('CAD v2 modular schema pack incomplete');
for (const item of pack.modules) {
  const sdkFile = path.join(modularRoot, item.path);
  const npmFile = path.join(root, 'schemas', 'v2', item.path);
  if (!fs.existsSync(npmFile) || !fs.readFileSync(sdkFile).equals(fs.readFileSync(npmFile))) {
    throw new Error('CAD npm schema module missing or differs from canonical SDK: ' + item.path);
  }
}

const assetsDir = path.join(root, 'frontend', 'dist', 'assets');
const assets = fs.readdirSync(assetsDir);
if (!assets.some((name) => name.startsWith('RoboticsWorkspace-') && name.endsWith('.js'))) {
  throw new Error('robotics lazy chunk missing from production build');
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (pkg.private === true) throw new Error('publish package must not be private');
if (pkg.name !== '@inneranimalmedia/agentsam-cad-creator') {
  throw new Error(`unexpected package name: ${pkg.name}`);
}
if (!Array.isArray(pkg.files) || pkg.files.some((entry) => entry.startsWith('reference'))) {
  throw new Error('reference/donor files must never be part of the publish whitelist');
}

console.log('CAD Creator publish package verification OK');
