/**
 * agentsam machine — graduate the native Machine engine to the product CLI.
 *
 * Graduation rule: capability is complete when reachable through
 * `agentsam machine …`, emits bounded deterministic receipts, and preserves evidence.
 *
 * Asset perception rule: discovery is read-only and network-free by default.
 */

import path from 'node:path';
import { resolveMachineBinary, spawnMachine } from '../lib/machine-binary.js';

function usage() {
  return `agentsam machine — deterministic local perception (native engine)

Usage:
  agentsam machine inspect <path> [--json] [--run-id <id>] [--include-generated]
  agentsam machine doctor [--json]
  agentsam machine --help

Notes:
  Default inspect is read-only and network-free.
  Large detail is externalized under <target>/.agentsam/machine/runs/<run_id>/.
  Generated/cache trees are summarized unless --include-generated is set.
  Remote fetch/probe, optimization, storage, and reference rewriting are separate explicit actions.
  Set AGENTSAM_MACHINE_BIN to force a specific agentsam-machine binary.`;
}

function parseArgs(argv = []) {
  const out = {
    help: false,
    json: false,
    includeGenerated: false,
    runId: null,
    subcommand: null,
    target: null,
    positionals: [],
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') out.help = true;
    else if (arg === '--json') out.json = true;
    else if (arg === '--include-generated') out.includeGenerated = true;
    else if (arg === '--run-id') {
      const value = argv[++i];
      if (value == null || value.startsWith('--')) {
        throw new Error('--run-id requires a value');
      }
      out.runId = value;
    } else if (arg.startsWith('-')) {
      throw new Error(`unknown machine option: ${arg}`);
    } else {
      out.positionals.push(arg);
    }
  }
  out.subcommand = out.positionals[0] || null;
  out.target = out.positionals[1] || null;
  return out;
}

function printTextDoctor(resolution) {
  if (resolution.kind === 'binary') {
    console.log(`agentsam-machine available (${resolution.source}): ${resolution.path}`);
    console.log('capability: machine.inspect');
    return;
  }
  if (resolution.kind === 'cargo') {
    console.log(`agentsam-machine via cargo run (${resolution.source}): ${resolution.manifest}`);
    console.log('capability: machine.inspect (dev fallback)');
    return;
  }
  console.log('agentsam-machine unavailable');
  console.log(`tried: ${(resolution.tried || []).join(', ')}`);
}

/**
 * @param {string[]} argv
 */
export async function runMachine(argv = []) {
  const args = parseArgs(argv);
  if (args.help || !args.subcommand) {
    console.log(usage());
    return 0;
  }

  const resolution = resolveMachineBinary();

  if (args.subcommand === 'doctor') {
    const payload = {
      capability: 'machine.doctor',
      available: resolution.kind !== 'missing',
      resolution,
    };
    if (args.json) console.log(JSON.stringify(payload));
    else printTextDoctor(resolution);
    return resolution.kind === 'missing' ? 1 : 0;
  }

  if (args.subcommand === 'inspect') {
    const target = args.target || process.cwd();
    const abs = path.resolve(target);
    const machineArgv = ['inspect', abs];
    if (args.runId) machineArgv.push('--run-id', args.runId);
    if (args.includeGenerated) machineArgv.push('--include-generated');
    if (args.json) machineArgv.push('--json');

    const result = spawnMachine(resolution, machineArgv, {
      stdio: args.json ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      // Large donors still emit bounded compact JSON; raise buffer for safety.
      maxBuffer: 32 * 1024 * 1024,
    });

    if (result.error) throw result.error;
    if (args.json) {
      const stdout = String(result.stdout || '');
      const stderr = String(result.stderr || '');
      if (result.status && result.status !== 0) {
        const err = new Error(stderr.trim() || `agentsam-machine exited with code ${result.status}`);
        err.exitCode = result.status;
        throw err;
      }
      try {
        const parsed = JSON.parse(stdout);
        console.log(JSON.stringify(parsed));
      } catch {
        process.stdout.write(stdout);
      }
      if (stderr.trim()) process.stderr.write(stderr);
    }
    return result.status ?? 0;
  }

  console.log(usage());
  const err = new Error(`Unknown machine subcommand: ${args.subcommand}`);
  err.exitCode = 1;
  throw err;
}
