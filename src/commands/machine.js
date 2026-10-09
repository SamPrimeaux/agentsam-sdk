/**
 * agentsam machine — deterministic native Machine lifecycle + perception.
 */

import os from 'node:os';
import path from 'node:path';
import pc from 'picocolors';
import fs from 'node:fs';
import { usageError, processError } from '../../packages/agentsam-errors/src/cli.js';
import { resolveMachineBinary, spawnMachine } from './machine-binary.js';
import {
  installManagedMachine,
  machineBinaryVersion,
  machineRuntimeStatus,
  updateManagedMachine,
} from './machine-runtime.js';

function usage() {
  return [
    `${pc.bold('agentsam machine')} — deterministic local perception (native engine)`,
    '',
    pc.bold('Usage'),
    `  ${pc.cyan('agentsam machine status')}                         Show the active runtime`,
    `  ${pc.cyan('agentsam machine doctor')}                         Diagnose runtime resolution`,
    `  ${pc.cyan('agentsam machine install')} [--version <semver>]   Install the managed runtime`,
    `  ${pc.cyan('agentsam machine update')}                        Update the managed runtime`,
    `  ${pc.cyan('agentsam machine inspect <path>')}                Inspect a repository or directory`,
    `  ${pc.cyan('agentsam machine crawl <path> --json')}           Normalize Machine evidence into a repository graph`,
    `  ${pc.cyan('agentsam machine mine <path> --against <path>')}   Compare repository implementations safely`,
    '',
    pc.bold('Options'),
    `  ${pc.dim('--json')}                  Machine-readable output`,
    `  ${pc.dim('--force')}                 Replace an existing managed version`,
    `  ${pc.dim('--run-id <id>')}           Reuse an externalized inspection run`,
    `  ${pc.dim('--include-generated')}    Include generated and cache trees`,
    `  ${pc.dim('--against <path>')}        Second repository for mine`,
    `  ${pc.dim('--limit <n>')}             Limit displayed proposals`,
    `  ${pc.dim('--help')}                 Show this help`,
    '',
    pc.bold('Runtime authority'),
    '  AgentSam manages one user-level Machine runtime under ~/.agentsam/runtimes/machine/.',
    '  Resolution order: managed runtime → explicit override → PATH → SDK source.',
    '  Install and update are explicit; entering a repository never changes the host.',
    '',
    pc.bold('Behavior'),
    '  Inspect is read-only and network-free by default.',
    '  Large detail is externalized under <target>/.agentsam/machine/runs/<run_id>/.',
    '  Generated and cache trees are summarized unless --include-generated is set.',
    '  Install/update use the crates.io distribution and require Cargo.',
    '',
  ].join('\n');
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
    against: [],
    limit: 50,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') out.help = true;
    else if (arg === '--json') out.json = true;
    else if (arg === '--force') out.force = true;
    else if (arg === '--include-generated') out.includeGenerated = true;
    else if (arg === '--against') {
      const value = argv[++i];
      if (!value || value.startsWith('--')) throw usageError('--against requires a path',{command:'agentsam machine',hints:{example:'agentsam machine mine . --against ../other-repo'}});
      out.against.push(value);
    } else if (arg === '--limit') {
      const value = Number(argv[++i]);
      if (!Number.isInteger(value) || value < 1 || value > 500) throw usageError('--limit must be 1..500',{command:'agentsam machine'});
      out.limit = value;
    } else if (arg === '--run-id') {
      const value = argv[++i];
      if (value == null || value.startsWith('--')) throw usageError('--run-id requires a value',{command:'agentsam machine'});
      out.runId = value;
    } else if (arg === '--version') {
      const value = argv[++i];
      if (value == null || value.startsWith('--')) throw usageError('--version requires a value',{command:'agentsam machine'});
      out.version = value;
    } else if (arg.startsWith('-')) {
      throw usageError('unknown machine option: ' + arg,{command:'agentsam machine'});
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

function compactPath(value) {
  const raw = String(value || '—');
  const home = os.homedir();
  return home && (raw === home || raw.startsWith(home + path.sep))
    ? '~' + raw.slice(home.length)
    : raw;
}

function stateLabel(installed) {
  return installed ? pc.green('installed') : pc.yellow('not installed');
}

function printTextStatus(payload) {
  const managed = payload.managed;
  const effective = payload.effective;
  console.log(pc.bold('AgentSam Machine'));
  console.log(pc.dim('Deterministic local perception · native runtime'));
  console.log('');
  console.log(pc.bold('Managed runtime'));
  console.log(`  status       ${stateLabel(managed.installed)}`);
  console.log(`  version      ${managed.current_version || pc.dim('—')}`);
  console.log(`  runtime      ${compactPath(managed.runtime_root)}`);
  console.log(`  binary       ${compactPath(managed.binary)}`);
  console.log('');
  console.log(pc.bold('Active resolution'));
  console.log(`  source       ${effective.source || pc.dim('unavailable')}`);
  console.log(`  version      ${effective.version || pc.dim('unknown')}`);
  console.log(`  cargo        ${managed.cargo.available ? compactPath(managed.cargo.path) : pc.dim('not found')}`);
  if (!managed.installed) {
    console.log('');
    console.log(`  ${pc.yellow('Next step')}  agentsam machine install`);
  }
}

function printTextDoctor(payload) {
  printTextStatus(payload);
  console.log('');
  console.log(pc.bold('Doctor'));
  if (payload.effective.kind === 'missing') {
    console.log(`  ${pc.red('✕')} Machine unavailable`);
    console.log(`    tried      ${(payload.effective.tried || []).map(compactPath).join(', ') || pc.dim('none')}`);
  } else if (payload.managed.installed) {
    console.log(`  ${pc.green('✓')} Managed Machine runtime is available`);
  } else {
    console.log(`  ${pc.yellow('○')} Fallback runtime is active: ${payload.effective.source}`);
    console.log('    install the managed runtime for consistent resolution across repositories');
  }
}

function printInstallResult(action, result) {
  console.log(pc.bold(`AgentSam Machine · ${action}`));
  console.log('');
  console.log(`  ${pc.green('✓')} Runtime ${result.changed ? 'installed' : 'already current'}`);
  console.log(`  version      ${result.version}`);
  console.log(`  source       ${result.source}`);
  console.log(`  binary       ${compactPath(result.binary)}`);
  console.log(`  alias        ${compactPath(result.alias)}`);
}

export async function runMachine(argv = []) {
  if (argv.includes('--help') || argv.includes('-h')) { console.log(usage()); return 0; }
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

  if (args.subcommand === 'crawl' || args.subcommand === 'mine') {
    const { createRepositoryCrawl, findRefineryCandidates } = await import('../../packages/agentsam-repository/src/index.js');
    const resolution = resolveMachineBinary();
    const targets = [args.target || process.cwd(), ...(args.subcommand === 'mine' ? args.against : [])];
    if (args.subcommand === 'mine' && targets.length < 2) throw usageError('machine mine finds cross-repository code reuse; supply --against <second-repository>',{command:'agentsam machine',hints:{example:'agentsam machine mine . --against ../other-repo'}});
    const graphs = targets.map(target => {
      const abs = path.resolve(target);
      if (!fs.existsSync(abs)) throw usageError('Machine target not found: '+abs,{command:'agentsam machine',reason:'target_not_found'});
      const result = spawnMachine(resolution, ['inspect', abs, '--json'], {
        stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 128 * 1024 * 1024,
      });
      if (result.error) throw processError(result.error.message || 'Machine process spawn failed',{
      command:'agentsam machine',
      reason:['ENOBUFS','ERR_CHILD_PROCESS_STDIO_MAXBUFFER'].includes(result.error.code) ? 'process_output_limit' : 'process_spawn_failed',
      cause:result.error,hints:{example:'agentsam machine install'},
    });
      if (result.status !== 0) throw processError(String(result.stderr || `Machine inspection failed: ${abs}`).trim());
      let inspection;
      try { inspection = JSON.parse(String(result.stdout)); }
      catch (cause) { throw processError('Machine inspection output is not JSON',{command:'agentsam machine',reason:'upstream_invalid_response',cause}); }
      return createRepositoryCrawl(inspection, { root: abs });
    });
    const output = args.subcommand === 'mine' ? findRefineryCandidates(graphs, { limit: args.limit }) : graphs[0];
    if (args.json) console.log(JSON.stringify(output));
    else if (args.subcommand === 'crawl') console.log(`repository.crawl ${output.repository}: ${output.counts.files} files, ${output.counts.resources} resources, ${output.counts.edges} edges, ${output.errors.length} errors`);
    else {
      console.log(`repository.mine ${output.counts.compared_repositories} repositories: ${output.counts.candidate_pairs} candidate pairs`);
      for (const item of output.candidates) console.log(`  ${item.match.type} ${item.implementations.map(x=>x.repository + '/' + x.path).join(' <> ')} | owner: ${item.likely_owner?.package || 'unresolved'}`);
    }
    return 0;
  }

  if (args.subcommand === 'inspect') {
    const resolution = resolveMachineBinary();
    const target = args.target || process.cwd();
    const abs = path.resolve(target);
    if (!fs.existsSync(abs)) throw usageError('Machine target not found: '+abs,{command:'agentsam machine',reason:'target_not_found'});
    const machineArgv = ['inspect', abs];
    if (args.runId) machineArgv.push('--run-id', args.runId);
    if (args.includeGenerated) machineArgv.push('--include-generated');
    if (args.json) machineArgv.push('--json');

    const result = spawnMachine(resolution, machineArgv, {
      stdio: args.json ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      maxBuffer: 32 * 1024 * 1024,
    });

    if (result.error) throw processError(result.error.message || 'Machine process spawn failed',{
      command:'agentsam machine',
      reason:['ENOBUFS','ERR_CHILD_PROCESS_STDIO_MAXBUFFER'].includes(result.error.code) ? 'process_output_limit' : 'process_spawn_failed',
      cause:result.error,hints:{example:'agentsam machine install'},
    });
    if (args.json) {
      const stdout = String(result.stdout || '');
      const stderr = String(result.stderr || '');
      if (result.status && result.status !== 0) {
        const err = processError(stderr.trim() || 'agentsam-machine exited with code ' + result.status,{command:'agentsam machine',reason:'execution_failed',nativeExitCode:result.status,stderr_tail:stderr.slice(-500)});
        err.exitCode = 1;
        throw err;
      }
      try { console.log(JSON.stringify(JSON.parse(stdout))); }
      catch (cause) { throw processError('Machine inspection output is not JSON',{command:'agentsam machine',reason:'upstream_invalid_response',cause}); }
      if (stderr.trim()) process.stderr.write(stderr);
    }
    return result.status ? 1 : 0;
  }

  console.log(usage());
  const err = usageError('Unknown machine subcommand: ' + args.subcommand,{command:'agentsam machine'});
  err.exitCode = 2;
  throw err;
}
