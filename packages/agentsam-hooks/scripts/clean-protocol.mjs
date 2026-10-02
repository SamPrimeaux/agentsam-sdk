import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const canonical = path.resolve(packageRoot, '../..', 'protocol', 'hooks');
if (!fs.existsSync(canonical)) process.exit(0);
const target = path.join(packageRoot, 'protocol');
for (const filename of [
  'agentsam.hook.v1.schema.json',
  'agentsam.hook.output.v1.schema.json',
  'agentsam.hook.receipt.v1.schema.json',
  'agentsam.hooks.config.v1.schema.json',
]) {
  fs.rmSync(path.join(target, filename), { force: true });
}
