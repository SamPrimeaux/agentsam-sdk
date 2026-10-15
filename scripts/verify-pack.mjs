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

const packedPaths = new Set((pack.files || []).map((entry) => entry.path));
const requiredPortableRuntimeFiles = [
  'native/agentsam-machine/Cargo.toml',
  'native/agentsam-machine/cli/src/main.rs',
  'native/agentsam-machine/core/src/frontend.rs',
  'contracts/source-types.v1.json',
  'packages/agentsam-cms/package.json',
  'packages/agentsam-cms/src/index.js',
  'packages/agentsam-cms/src/node.js',
  'packages/agentsam-cms/src/machine.js',
  'packages/agentsam-ide/src/lsp/host.mjs',
  'packages/agentsam-ide/src/lsp/host.d.mts',
];
const missingPortableRuntimeFiles = requiredPortableRuntimeFiles.filter((path) => !packedPaths.has(path));
if (missingPortableRuntimeFiles.length) {
  console.error('pack-check failed: portable AgentSam runtime archive would be incomplete');
  for (const path of missingPortableRuntimeFiles) console.error(`- ${path}`);
  process.exit(1);
}

console.log(
  `pack-check OK ${pack.name}@${pack.version} · ${pack.files.length} files · no nested node_modules`
);
