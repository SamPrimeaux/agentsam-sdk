import fs from 'node:fs';
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
