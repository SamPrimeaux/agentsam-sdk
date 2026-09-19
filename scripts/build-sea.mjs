#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);

function valueAfter(flag, fallback) {
  const index = args.indexOf(flag);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
  return value;
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function usage() {
  console.log(`
Build or prepare an AgentSam Node Single Executable Application (SEA).

  node scripts/build-sea.mjs [--entry <bundle.cjs>] [--out-dir <dir>] [--output <file>]
  node scripts/build-sea.mjs --build [same options]

The entry must be a self-contained CommonJS bundle. Without --build this writes
sea-config.json and build-commands.sh so a release job can perform the build.
`.trim());
}

if (args.includes('--help') || args.includes('-h')) {
  usage();
  process.exit(0);
}

const outDir = path.resolve(root, valueAfter('--out-dir', 'dist/sea'));
const entry = path.resolve(root, valueAfter('--entry', path.join('dist', 'sea', 'agentsam.cjs')));
const executableName = valueAfter(
  '--output',
  `agentsam-${process.platform}-${process.arch}${process.platform === 'win32' ? '.exe' : ''}`,
);
const executable = path.resolve(outDir, executableName);
const blob = path.resolve(outDir, 'agentsam.blob');
const configPath = path.resolve(outDir, 'sea-config.json');
const commandsPath = path.resolve(outDir, 'build-commands.sh');
const sentinel = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  configPath,
  `${JSON.stringify({
    main: entry,
    output: blob,
    disableExperimentalSEAWarning: true,
    useSnapshot: false,
    useCodeCache: true,
  }, null, 2)}\n`,
);

const postjectArgs = [
  '--yes',
  'postject',
  executable,
  'NODE_SEA_BLOB',
  blob,
  '--sentinel-fuse',
  sentinel,
];
if (process.platform === 'darwin') {
  postjectArgs.push('--macho-segment-name', 'NODE_SEA');
}

const commands = [
  `${shellQuote(process.execPath)} --experimental-sea-config ${shellQuote(configPath)}`,
  `cp ${shellQuote(process.execPath)} ${shellQuote(executable)}`,
  ...(process.platform === 'darwin'
    ? [`codesign --remove-signature ${shellQuote(executable)} 2>/dev/null || true`]
    : []),
  `npx ${postjectArgs.map(shellQuote).join(' ')}`,
  ...(process.platform === 'darwin' ? [`codesign --sign - ${shellQuote(executable)}`] : []),
];
fs.writeFileSync(commandsPath, `#!/usr/bin/env bash\nset -euo pipefail\n${commands.join('\n')}\n`);
fs.chmodSync(commandsPath, 0o755);

console.log(`SEA config:   ${configPath}`);
console.log(`Build script: ${commandsPath}`);
console.log(`Executable:   ${executable}`);

if (!args.includes('--build')) {
  if (!fs.existsSync(entry)) {
    console.log(`\nBundle the CLI as CommonJS at ${entry}, then run:\n  ${commandsPath}`);
  }
  process.exit(0);
}

if (!fs.existsSync(entry)) {
  throw new Error(`SEA entry bundle does not exist: ${entry}`);
}

function run(command, commandArgs, { allowFailure = false } = {}) {
  const result = spawnSync(command, commandArgs, { stdio: 'inherit' });
  if (!allowFailure && (result.error || result.status !== 0)) {
    throw result.error || new Error(`${command} exited with status ${result.status}`);
  }
}

run(process.execPath, ['--experimental-sea-config', configPath]);
fs.copyFileSync(process.execPath, executable);
fs.chmodSync(executable, 0o755);
if (process.platform === 'darwin') {
  run('codesign', ['--remove-signature', executable], { allowFailure: true });
}
run(process.platform === 'win32' ? 'npx.cmd' : 'npx', postjectArgs);
if (process.platform === 'darwin') {
  run('codesign', ['--sign', '-', executable]);
}
console.log(`Built ${executable}`);
