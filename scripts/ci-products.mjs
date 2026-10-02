import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appsRoot = path.join(root, 'apps');
const productRoots = fs.readdirSync(appsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => path.join(appsRoot, entry.name))
  .filter((dir) => fs.existsSync(path.join(dir, 'package.json')) && fs.existsSync(path.join(dir, 'package-lock.json')))
  .sort();

for (const dir of productRoots) {
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  console.log(`ci:product ${pkg.name || path.basename(dir)} · ${path.relative(root, dir)}`);
  const result = spawnSync('npm', ['ci', '--ignore-scripts'], { cwd: dir, stdio: 'inherit', env: process.env });
  if (result.status !== 0) process.exit(result.status || 1);
}
