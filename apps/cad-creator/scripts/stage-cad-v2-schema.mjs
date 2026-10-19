import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const appRoot = path.resolve(import.meta.dirname, '..');
const source = path.resolve(appRoot, '..', '..', 'protocol', 'cad', 'cad.project.v2.schema.json');
const destination = path.join(appRoot, 'schemas', 'cad.project.v2.schema.json');
const expectedId = 'https://schemas.inneranimalmedia.com/apps/cad-creator/schemas/cad.project.v2.schema.json';

// The SDK protocol is authoritative. CAD Creator packages the exact same
// artifact so customers can validate locally or fetch it from the public R2 URL.
if (!fs.existsSync(source)) {
  throw new Error('Missing SDK-owned CAD v2 protocol schema: ' + source);
}
const body = fs.readFileSync(source, 'utf8');
const schema = JSON.parse(body);
if (schema.$id !== expectedId || schema.properties?.schema?.const !== 'cad.project.v2') {
  throw new Error('CAD v2 canonical schema URL or contract does not match release authority');
}
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.writeFileSync(destination, body, 'utf8');
console.log('CAD v2 schema staged from SDK protocol:', destination);

// Versioned opt-in schema pack: preserve the SDK tree exactly in the CAD npm
// application. The root project v2 schema is not silently rewritten here.
const moduleRoot = path.resolve(appRoot, '..', '..', 'protocol', 'cad', 'v2');
const manifestFile = path.join(moduleRoot, 'schema-pack.manifest.json');
if (!fs.existsSync(manifestFile)) throw new Error('Missing CAD v2 modular schema manifest');
const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
if (manifest.schema !== 'cad.schema-pack.v1' || manifest.projectContract !== 'cad.project.v2') {
  throw new Error('Unexpected CAD schema pack authority or project family');
}
const targetRoot = path.join(appRoot, 'schemas', 'v2');
for (const item of manifest.modules) {
  const rel = item.path;
  if (!/^[a-z0-9-]+\/[a-z0-9.-]+\.schema\.json$/.test(rel) || rel.includes('..')) {
    throw new Error('Unsafe CAD schema module path: ' + rel);
  }
  const file = path.join(moduleRoot, rel);
  if (!fs.existsSync(file)) throw new Error('Unpublished CAD schema module: ' + rel);
  const bytes = fs.readFileSync(file);
  const json = JSON.parse(bytes.toString('utf8'));
  const actualSha = createHash('sha256').update(bytes).digest('hex');
  if (actualSha !== item.sha256 || bytes.length !== item.byteSize) {
    throw new Error('CAD schema changed since manifest approval: ' + rel);
  }
  if (json.$schema !== 'https://json-schema.org/draft/2020-12/schema' || json.$id !== item.uri) {
    throw new Error('Invalid CAD schema module identity: ' + rel);
  }
  const output = path.join(targetRoot, rel);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, bytes);
}
fs.copyFileSync(manifestFile, path.join(targetRoot, 'schema-pack.manifest.json'));
console.log('CAD v2 modular schemas staged:', manifest.modules.length);

