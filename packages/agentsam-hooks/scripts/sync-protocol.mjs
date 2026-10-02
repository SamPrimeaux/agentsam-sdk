import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(packageRoot, '../..');
const source = path.join(repositoryRoot, 'protocol', 'hooks');
const target = path.join(packageRoot, 'protocol');
const files = [
  'agentsam.hook.v1.schema.json',
  'agentsam.hook.output.v1.schema.json',
  'agentsam.hook.receipt.v1.schema.json',
  'agentsam.hooks.config.v1.schema.json',
];
fs.mkdirSync(target, { recursive: true });
for (const filename of files) {
  const sourceFile = path.join(source, filename);
  const targetFile = path.join(target, filename);
  if (fs.existsSync(sourceFile)) fs.copyFileSync(sourceFile, targetFile);
  else if (!fs.existsSync(targetFile)) throw new Error(`Canonical hook protocol is unavailable: ${sourceFile}`);
}
