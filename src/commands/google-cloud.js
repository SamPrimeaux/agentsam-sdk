/**
 * Canonical Google Cloud provider CLI surface for Local Studio / AgentSam.
 * `agentsam compute` remains a compatibility alias into this module.
 */
import {
  collectGoogleCloudDoctor,
  collectGoogleCloudServiceAccountInventory,
  inspectGoogleCloudServiceAccount,
  renderServiceAccountInspect,
  renderServiceAccountTable,
  resolveActiveProject,
  runGcloudJson,
} from '../lib/google-cloud-inventory.js';
import {
  remediateProviderFailure,
  renderRemediationCard,
  recommendedCommand,
} from '../lib/provider-command-remediation.js';
import { runGcloudAuth } from './gcloud-auth.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function writeLine(write, value = '') {
  write(`${value}\n`);
}

function printHelp(write) {
  writeLine(write, '');
  writeLine(write, '  Agent Sam · Google Cloud');
  writeLine(write, '');
  writeLine(write, '  agentsam gcloud auth login');
  writeLine(write, '  agentsam gcloud auth list');
  writeLine(write, '  agentsam google-cloud projects list');
  writeLine(write, '  agentsam google-cloud compute instances list [--project <id>]');
  writeLine(write, '  agentsam google-cloud iam service-accounts list [--project <id>]');
  writeLine(write, '  agentsam google-cloud iam service-accounts inspect <name-or-email>');
  writeLine(write, '  agentsam google-cloud billing projects list');
  writeLine(write, '  agentsam google-cloud billing describe [PROJECT_ID]');
  writeLine(write, '  agentsam google-cloud doctor [--project <id>]');
  writeLine(write, '  agentsam google-cloud remediate -- <gcloud argv…>');
  writeLine(write, '');
  writeLine(write, '  Alias: agentsam compute … · agentsam gcloud …');
  writeLine(write, '  Auth setup: docs/contracts/google-cloud-oauth-setup.md');
  writeLine(write, '  Never prints private keys or access tokens.');
  writeLine(write, '');
}

function parseProject(argv) {
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--project') return argv[i + 1] || '';
    if (argv[i]?.startsWith('--project=')) return argv[i].slice('--project='.length);
  }
  return '';
}

async function runGcloudText(args, env) {
  try {
    const { stdout, stderr } = await execFileAsync('gcloud', args, {
      timeout: 45000,
      env,
      maxBuffer: 4 * 1024 * 1024,
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

/**
 * Normalize legacy `compute …` argv into google-cloud argv.
 */
export function normalizeGoogleCloudArgv(argv = []) {
  const args = [...argv];
  // agentsam compute iam service-accounts list → iam service-accounts list
  // agentsam compute instances list → compute instances list
  // agentsam gcloud auth login → auth login (via google-cloud / gcloud alias)
  if (args[0] === 'iam' || args[0] === 'remediate' || args[0] === 'doctor' || args[0] === 'auth') return args;
  if (args[0] === 'gcloud' && args[1] === 'auth') return args.slice(1);
  if (args[0] === 'instances') return ['compute', ...args];
  return args;
}

export async function runGoogleCloud(argv = [], options = {}) {
  const write = options.write || ((s) => process.stdout.write(s));
  const env = options.env || process.env;
  const json = argv.includes('--json');
  const args = normalizeGoogleCloudArgv(argv.filter((a) => a !== '--json'));

  if (!args.length || args[0] === 'help' || args[0] === '--help' || args[0] === '-h') {
    printHelp(write);
    return 0;
  }

  if (args[0] === 'auth') {
    return runGcloudAuth(args.slice(1), { write, env, json });
  }

  if (args[0] === 'remediate') {
    const rest = args.slice(1);
    if (rest[0] === '--') rest.shift();
    const card = remediateProviderFailure({ argv: rest, env, projectId: parseProject(rest) });
    if (!card) {
      writeLine(write, '  No remediation matched.');
      return 1;
    }
    if (json) write(JSON.stringify({ ...card, recommended_command: recommendedCommand(card) }, null, 2) + '\n');
    else write(renderRemediationCard(card));
    return 0;
  }

  if (args[0] === 'doctor') {
    const doctor = await collectGoogleCloudDoctor({ env, projectId: parseProject(args) });
    if (json) write(JSON.stringify(doctor, null, 2) + '\n');
    else {
      writeLine(write, '');
      writeLine(write, '  Agent Sam · Google Cloud · doctor');
      writeLine(write, '');
      writeLine(write, `  project          ${doctor.project_id || '(unset)'}`);
      writeLine(write, `  auth             ${doctor.auth_active ? 'active' : 'missing'}`);
      writeLine(write, `  billing enabled  ${doctor.billing.enabled == null ? 'unknown' : doctor.billing.enabled}`);
      writeLine(write, `  billing account  ${doctor.billing.account_name || doctor.billing.error || '—'}`);
      writeLine(write, `  service accounts ${doctor.service_accounts}`);
      writeLine(write, `  user-managed keys ${doctor.user_managed_keys}`);
      writeLine(write, '');
      writeLine(write, '  Credential lanes');
      writeLine(write, `    AGENTSAM_API_KEY     ${doctor.credential_lanes.agentsam_api_key}`);
      writeLine(write, `    AGENTSAM_BRIDGE_KEY  ${doctor.credential_lanes.agentsam_bridge_key}`);
      writeLine(write, `    Google user OAuth    ${doctor.credential_lanes.google_user_oauth}`);
      writeLine(write, `    Google SA workload   ${doctor.credential_lanes.google_sa}`);
      writeLine(write, '');
      if (doctor.issues.length) {
        writeLine(write, '  Issues');
        for (const issue of doctor.issues) {
          writeLine(write, `    ✕ [${issue.severity}] ${issue.code}${issue.note ? ` — ${issue.note}` : ''}`);
        }
        writeLine(write, '');
      } else {
        writeLine(write, '  ✓ no high-severity issues in this pass');
        writeLine(write, '');
      }
    }
    return doctor.ok ? 0 : 2;
  }

  if (args[0] === 'projects' && args[1] === 'list') {
    const result = await runGcloudText(
      ['projects', 'list', '--format=table(projectId,name,lifecycleState)'],
      env,
    );
    if (!result.ok) {
      write(result.stderr || result.stdout);
      return 1;
    }
    if (json) {
      const parsed = await runGcloudJson(['projects', 'list', '--format=json'], env);
      write(JSON.stringify(parsed.data || [], null, 2) + '\n');
    } else write(result.stdout.endsWith('\n') ? result.stdout : `${result.stdout}\n`);
    return 0;
  }

  if (args[0] === 'compute' && args[1] === 'instances' && args[2] === 'list') {
    const project = parseProject(args) || (await resolveActiveProject(env));
    const gcloudArgs = ['compute', 'instances', 'list', '--format=table(name,zone,status,machineType)'];
    if (project) gcloudArgs.push(`--project=${project}`);
    const result = await runGcloudText(gcloudArgs, env);
    if (!result.ok) {
      const card = remediateProviderFailure({ argv: ['gcloud', ...gcloudArgs], stderr: result.stderr, projectId: project, env });
      if (card && !json) write(renderRemediationCard(card));
      else write(result.stderr || result.stdout);
      return result.code || 1;
    }
    write(result.stdout.endsWith('\n') ? result.stdout : `${result.stdout}\n`);
    return 0;
  }

  if (args[0] === 'iam' && args[1] === 'service-accounts' && args[2] === 'list') {
    const inventory = await collectGoogleCloudServiceAccountInventory({
      env,
      projectId: parseProject(args),
    });
    if (!inventory.ok) {
      writeLine(write, `  ✕ ${inventory.error || 'inventory_failed'}`);
      if (inventory.detail) writeLine(write, `    ${inventory.detail}`);
      return 1;
    }
    if (json) write(JSON.stringify(inventory, null, 2) + '\n');
    else write(renderServiceAccountTable(inventory));
    return 0;
  }

  if (args[0] === 'iam' && args[1] === 'service-accounts' && args[2] === 'inspect') {
    const account = args[3] || '';
    if (!account) {
      writeLine(write, '  ✕ Pass a service account name or email.');
      writeLine(write, '    agentsam google-cloud iam service-accounts inspect agent-sam-vertex');
      return 1;
    }
    const result = await inspectGoogleCloudServiceAccount({
      env,
      projectId: parseProject(args),
      account,
    });
    if (json) write(JSON.stringify(result, null, 2) + '\n');
    else write(renderServiceAccountInspect(result));
    return result.ok ? 0 : 1;
  }

  if (args[0] === 'billing' && args[1] === 'projects' && args[2] === 'list') {
    // gcloud has no global "billing projects list" across all projects; compose from projects list + describe.
    const projects = await runGcloudJson(['projects', 'list', '--format=json'], env);
    if (!projects.ok) {
      write(projects.stderr || '');
      return 1;
    }
    const rows = [];
    for (const project of Array.isArray(projects.data) ? projects.data : []) {
      const id = project.projectId;
      if (!id) continue;
      const billing = await runGcloudJson(['billing', 'projects', 'describe', id, '--format=json'], env, 20000);
      rows.push({
        projectId: id,
        name: project.name,
        lifecycleState: project.lifecycleState,
        billingEnabled: billing.ok ? Boolean(billing.data?.billingEnabled) : null,
        billingAccountName: billing.ok ? billing.data?.billingAccountName || null : null,
        billing_error: billing.ok ? null : billing.stderr || 'describe_failed',
      });
    }
    if (json) write(JSON.stringify(rows, null, 2) + '\n');
    else {
      writeLine(write, '');
      writeLine(write, '  Agent Sam · Google Cloud · billing projects');
      writeLine(write, '');
      writeLine(write, '  PROJECT_ID                       BILLING_ACCOUNT                 ENABLED  NOTE');
      for (const row of rows) {
        const acct = (row.billingAccountName || row.billing_error || '—').replace(/^billingAccounts\//, '');
        writeLine(
          write,
          `  ${String(row.projectId).padEnd(32)}  ${String(acct).slice(0, 30).padEnd(30)}  ${String(row.billingEnabled).padEnd(7)}  ${row.name || ''}`,
        );
      }
      writeLine(write, '');
      writeLine(write, '  Note: account-level describe may fail even when project billing linkage is visible.');
      writeLine(write, '');
    }
    return 0;
  }

  if (args[0] === 'billing' && (args[1] === 'describe' || args[1] === 'project')) {
    const project = args[2] || parseProject(args) || (await resolveActiveProject(env));
    if (!project) {
      writeLine(write, '  ✕ Pass a project id.');
      return 1;
    }
    const result = await runGcloudText(
      ['billing', 'projects', 'describe', project, '--format=yaml(projectId,name,billingAccountName,billingEnabled)'],
      env,
    );
    if (!result.ok) {
      write(result.stderr || result.stdout);
      return 1;
    }
    write(result.stdout.endsWith('\n') ? result.stdout : `${result.stdout}\n`);
    return 0;
  }

  // Wrong-family passthrough remediation
  const card = remediateProviderFailure({ argv: ['gcloud', ...args], env });
  if (card) {
    if (json) write(JSON.stringify(card, null, 2) + '\n');
    else write(renderRemediationCard(card));
    return 1;
  }

  printHelp(write);
  writeLine(write, `  Unknown google-cloud subcommand: ${args.join(' ')}`);
  return 1;
}

/** Compatibility entry used by `agentsam compute`. */
export async function runCompute(argv = [], options = {}) {
  return runGoogleCloud(normalizeGoogleCloudArgv(argv), options);
}
