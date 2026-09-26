/**
 * Google Cloud compute / IAM helpers with deterministic remediation.
 * Does not mint or print access tokens.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  remediateProviderFailure,
  renderRemediationCard,
  recommendedCommand,
} from '../lib/provider-command-remediation.js';

const execFileAsync = promisify(execFile);

function writeLine(write, value = '') {
  write(`${value}\n`);
}

function printHelp(write) {
  writeLine(write, '');
  writeLine(write, '  agentsam compute');
  writeLine(write, '  agentsam compute instances list [--project <id>]');
  writeLine(write, '  agentsam compute iam service-accounts list [--project <id>]');
  writeLine(write, '  agentsam compute remediate -- <gcloud argv…>');
  writeLine(write, '');
  writeLine(write, '  Never runs gcloud auth print-access-token.');
  writeLine(write, '  Wrong-family example:');
  writeLine(write, '    agentsam compute remediate -- gcloud edge-cloud service-accounts keys create');
  writeLine(write, '');
}

async function runGcloud(args, env) {
  try {
    const { stdout, stderr } = await execFileAsync('gcloud', args, {
      timeout: 30000,
      env,
      maxBuffer: 2 * 1024 * 1024,
    });
    return { ok: true, code: 0, stdout: String(stdout || ''), stderr: String(stderr || '') };
  } catch (error) {
    return {
      ok: false,
      code: Number(error?.code) || 1,
      stdout: String(error?.stdout || ''),
      stderr: String(error?.stderr || error?.message || ''),
    };
  }
}

function parseProject(argv) {
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--project') return argv[i + 1] || '';
    if (argv[i]?.startsWith('--project=')) return argv[i].slice('--project='.length);
  }
  return '';
}

export async function runCompute(argv = [], options = {}) {
  const write = options.write || ((s) => process.stdout.write(s));
  const env = options.env || process.env;
  const json = argv.includes('--json');
  const args = argv.filter((a) => a !== '--json');

  if (!args.length || args[0] === 'help' || args[0] === '--help' || args[0] === '-h') {
    printHelp(write);
    return 0;
  }

  if (args[0] === 'remediate') {
    const rest = args.slice(1);
    if (rest[0] === '--') rest.shift();
    const card = remediateProviderFailure({ argv: rest, env });
    if (!card) {
      writeLine(write, '  No remediation matched.');
      return 1;
    }
    if (json) {
      write(JSON.stringify({ ...card, recommended_command: recommendedCommand(card) }, null, 2) + '\n');
    } else {
      write(renderRemediationCard(card));
    }
    return 0;
  }

  // Compatibility: agentsam compute iam service-accounts list
  if (args[0] === 'iam' && args[1] === 'service-accounts' && args[2] === 'list') {
    let project = parseProject(args);
    if (!project) {
      const cfg = await runGcloud(['config', 'get-value', 'project'], env);
      project = cfg.stdout.trim();
    }
    if (!project || project === '(unset)') {
      writeLine(write, '  ✕ No active gcloud project. Set one or pass --project.');
      writeLine(write, '    gcloud config set project gen-lang-client-0684066529');
      return 1;
    }
    const result = await runGcloud(
      ['iam', 'service-accounts', 'list', '--project', project, '--format=table(email,displayName,disabled)'],
      env,
    );
    if (!result.ok) {
      const card = remediateProviderFailure({
        argv: ['gcloud', 'iam', 'service-accounts', 'list'],
        stderr: result.stderr,
        projectId: project,
        env,
      });
      if (card && !json) write(renderRemediationCard(card));
      else write(result.stderr || result.stdout);
      return result.code || 1;
    }
    if (json) {
      write(JSON.stringify({ ok: true, project, stdout: result.stdout }, null, 2) + '\n');
    } else {
      write(result.stdout.endsWith('\n') ? result.stdout : `${result.stdout}\n`);
    }
    return 0;
  }

  if (args[0] === 'instances' && args[1] === 'list') {
    let project = parseProject(args);
    if (!project) {
      const cfg = await runGcloud(['config', 'get-value', 'project'], env);
      project = cfg.stdout.trim();
    }
    const gcloudArgs = ['compute', 'instances', 'list', '--format=table(name,zone,status,machineType)'];
    if (project && project !== '(unset)') gcloudArgs.push('--project', project);
    const result = await runGcloud(gcloudArgs, env);
    if (!result.ok) {
      const card = remediateProviderFailure({
        argv: ['gcloud', ...gcloudArgs],
        stderr: result.stderr,
        projectId: project,
        env,
      });
      if (card && !json) write(renderRemediationCard(card));
      else write(result.stderr || result.stdout);
      return result.code || 1;
    }
    write(result.stdout.endsWith('\n') ? result.stdout : `${result.stdout}\n`);
    return 0;
  }

  // Catch-all: if user pasted a wrong edge-cloud command under compute
  const card = remediateProviderFailure({ argv: ['gcloud', ...args], env });
  if (card) {
    if (json) write(JSON.stringify(card, null, 2) + '\n');
    else write(renderRemediationCard(card));
    return 1;
  }

  printHelp(write);
  writeLine(write, `  Unknown compute subcommand: ${args.join(' ')}`);
  return 1;
}
