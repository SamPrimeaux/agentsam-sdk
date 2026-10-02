/**
 * agentsam machine — deterministic native Machine lifecycle + perception.
 */

import path from 'node:path';
import { resolveMachineBinary, spawnMachine } from './machine-binary.js';
import {
  installManagedMachine,
  machineBinaryVersion,
  machineRuntimeStatus,
  updateManagedMachine,
} from './machine-runtime.js';

function usage() {
  return 'agentsam machine — deterministic local perception (native engine)\n\n' +
    'Usage:\n' +
    '  agentsam machine status [--json]\n' +
    '  agentsam machine doctor [--json]\n' +
    '  agentsam machine install [--version <semver>] [--force] [--json]\n' +
    '  agentsam machine update [--force] [--json]\n' +
    '  agentsam machine inspect <path> [--json] [--run-id <id>] [--include-generated]\n' +
    '  agentsam machine --help\n\n' +
    'Runtime authority:\n' +
    '  AgentSam manages one user-level Machine runtime under ~/.agentsam/runtimes/machine/.\n' +
    '  Every repository uses that managed runtime first; PATH and SDK source are fallbacks only.\n' +
    '  Install/update are explicit and never run merely because you entered a repository.\n\n' +
    'Notes:\n' +
    '  Default inspect is read-only and network-free.\n' +
    '  Large detail is externalized under <target>/.agentsam/machine/runs/<run_id>/.\n' +
    '  Generated/cache trees are summarized unless --include-generated is set.\n' +
    '  Current registry distribution uses crates.io and therefore requires Cargo for install/update.\n';
}

function parseArgs(argv = []) {
  const out = {
    help: false,
    json: false,
    force: false,
    includeGenerated: false,
    runId: null,
    version: null,
    subcommand: null,
    target: null,
    positionals: [],
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') out.help = true;
    else if (arg === '--json') out.json = true;
    else if (arg === '--force') out.force = true;
    else if (arg === '--include-generated') out.includeGenerated = true;
    else if (arg === '--run-id') {
      const value = argv[++i];
      if (value == null || value.startsWith('--')) throw new Error('--run-id requires a value');
      out.runId = value;
    } else if (arg === '--version') {
      const value = argv[++i];
      if (value == null || value.startsWith('--')) throw new Error('--version requires a value');
      out.version = value;
    } else if (arg.startsWith('-')) {
      throw new Error('unknown machine option: ' + arg);
    } else {
      out.positionals.push(arg);
    }
  }

  out.subcommand = out.positionals[0] || null;
  out.target = out.positionals[1] || null;
  return out;
}

function statusPayload() {
  const managed = machineRuntimeStatus();
  const resolution = resolveMachineBinary();
  let effectiveVersion = null;
  if (resolution.kind === 'binary') effectiveVersion = machineBinaryVersion(resolution.path);

  return {
    capability: 'machine.status',
    managed,
    effective: {
      ...resolution,
      version: resolution.version || effectiveVersion,
    },
  };
}

function printTextStatus(payload) {
  console.log('AgentSam Machine');
  console.log('');
  console.log('  managed      ' + (payload.managed.installed ? 'installed' : 'not installed'));
  console.log('  version      ' + (payload.managed.current_version || '—'));
  console.log('  binary       ' + (payload.managed.binary || '—'));
  console.log('  runtime      ' + payload.managed.runtime_root);
  console.log('  effective    ' + payload.effective.source);
  console.log('  effective v  ' + (payload.effective.version || 'unknown'));
  console.log('  cargo        ' + (payload.managed.cargo.available ? payload.managed.cargo.path : 'not found'));
  if (!payload.managed.installed) {
    console.log('');
    console.log('  Run agentsam machine install to adopt the user-managed runtime.');
  }
}

function printTextDoctor(payload) {
  printTextStatus(payload);
  console.log('');
  if (payload.effective.kind === 'missing') {
    console.log('  ✕ Machine unavailable');
    console.log('  tried        ' + (payload.effective.tried || []).join(', '));
  } else if (payload.managed.installed) {
    console.log('  ✓ managed Machine runtime is available');
  } else {
    console.log('  ○ Machine works through fallback source: ' + payload.effective.source);
    console.log('  ○ install the managed runtime to make resolution consistent across repositories');
  }
}

function printInstallResult(action, result) {
  console.log('AgentSam Machine ' + action);
  console.log('');
  console.log('  version      ' + result.version);
  console.log('  binary       ' + result.binary);
  console.log('  alias        ' + result.alias);
  console.log('  source       ' + result.source);
  console.log('  changed      ' + (result.changed ? 'yes' : 'no'));
}

export async function runMachine(argv = []) {
  const args = parseArgs(argv);
  if (args.help || !args.subcommand) {
    console.log(usage());
    return 0;
  }

  if (args.subcommand === 'status') {
    const payload = statusPayload();
    if (args.json) console.log(JSON.stringify(payload));
    else printTextStatus(payload);
    return 0;
  }

  if (args.subcommand === 'doctor') {
    const payload = statusPayload();
    if (args.json) console.log(JSON.stringify({ ...payload, capability: 'machine.doctor' }));
    else printTextDoctor(payload);
    return payload.effective.kind === 'missing' ? 1 : 0;
  }

  if (args.subcommand === 'install') {
    const result = installManagedMachine({
      version: args.version,
      force: args.force,
      write: args.json ? () => {} : (value) => process.stdout.write(value),
    });
    if (args.json) console.log(JSON.stringify({ capability: 'machine.install', ...result }));
    else printInstallResult('install', result);
    return 0;
  }

  if (args.subcommand === 'update') {
    const result = updateManagedMachine({
      force: args.force,
      write: args.json ? () => {} : (value) => process.stdout.write(value),
    });
    if (args.json) console.log(JSON.stringify({ capability: 'machine.update', ...result }));
    else printInstallResult('update', result);
    return 0;
  }

  if (args.subcommand === 'inspect') {
    const resolution = resolveMachineBinary();
    const target = args.target || process.cwd();
    const abs = path.resolve(target);
    const machineArgv = ['inspect', abs];
    if (args.runId) machineArgv.push('--run-id', args.runId);
    if (args.includeGenerated) machineArgv.push('--include-generated');
    if (args.json) machineArgv.push('--json');

    const result = spawnMachine(resolution, machineArgv, {
      stdio: args.json ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      maxBuffer: 32 * 1024 * 1024,
    });

    if (result.error) throw result.error;
    if (args.json) {
      const stdout = String(result.stdout || '');
      const stderr = String(result.stderr || '');
      if (result.status && result.status !== 0) {
        const err = new Error(stderr.trim() || 'agentsam-machine exited with code ' + result.status);
        err.exitCode = result.status;
        throw err;
      }
      try {
        console.log(JSON.stringify(JSON.parse(stdout)));
      } catch {
        process.stdout.write(stdout);
      }
      if (stderr.trim()) process.stderr.write(stderr);
    }
    return result.status ?? 0;
  }

  console.log(usage());
  const err = new Error('Unknown machine subcommand: ' + args.subcommand);
  err.exitCode = 1;
  throw err;
}
