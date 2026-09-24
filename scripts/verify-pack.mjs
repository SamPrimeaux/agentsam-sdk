import { spawnSync } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const result = spawnSync(
  npm,
  ['pack', '--dry-run', '--json'],
  {
    cwd: process.cwd(),
    encoding: 'utf8',
  },
);

if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout);
  process.exit(result.status || 1);
}

const payload = JSON.parse(result.stdout);
const pack = payload[0];

const nestedNodeModules = (pack.files || [])
  .map((entry) => entry.path)
  .filter((path) => path.split('/').includes('node_modules'));

if (nestedNodeModules.length) {
  console.error('pack-check failed: nested node_modules would be published');
  for (const path of nestedNodeModules.slice(0, 40)) {
    console.error(`- ${path}`);
  }
  process.exit(1);
}

console.log(
  `pack-check OK ${pack.name}@${pack.version} · ${pack.files.length} files · no nested node_modules`
);
