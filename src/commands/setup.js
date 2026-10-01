/**
 * Interactive Agent Sam setup — discover → plan → approve → execute → verify + receipt.
 */
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { discoverEnvironment, renderEnvironment } from '../lib/setup/discover.js';
import { buildSetupPlan, renderSetupPlan } from '../lib/setup/planner.js';
import {
  collectGooglePermissionInventory,
  executeSetupPlan,
} from '../lib/setup/execute.js';
import { listCapabilityRecipes } from '../lib/setup/recipes.js';
import {
  planRuntimeSetup,
  renderRuntimePlan,
  writeRuntimePlanReceipt,
  writeRuntimeInstallReceipt,
  RUNTIME_PROFILES,
} from '../lib/setup/runtime.js';
import { runRuntime } from './runtime.js';
import { getCliCommand } from '../cli/command-catalog.js';

function writeLine(write, value = '') {
  write(`${value}\n`);
}

function catalogCommand(id, args = '') {
  const entry = getCliCommand(id);
  if (!entry) throw new Error(`setup_next_command_not_catalogued: ${id}`);
  return `agentsam ${entry.id}${args ? ` ${args}` : ''}`;
}

export function setupNextCommands(capabilityIds = []) {
  const commands = [
    catalogCommand('status'),
    catalogCommand('capabilities'),
    catalogCommand('google-cloud', 'doctor'),
  ];
  if (capabilityIds.includes('google.cloud')) {
    commands.push(catalogCommand('setup', 'google.cloud --inventory'));
  }
  if (capabilityIds.includes('image.vectorize')) {
    commands.push(catalogCommand('capabilities', 'image.vectorize'));
  }
  return [...new Set(commands)];
}

function writeSetupNext(write, capabilityIds = []) {
  writeLine(write, '  Next');
  for (const command of setupNextCommands(capabilityIds)) writeLine(write, `    ${command}`);
  writeLine(write, '');
}

function printHelp(write) {
  writeLine(write, '');
  writeLine(write, '  Agent Sam · setup');
  writeLine(write, '');
  writeLine(write, '  agentsam setup                      interactive discover + plan');
  writeLine(write, '  agentsam setup --yes                 approve plan non-interactively');
  writeLine(write, '  agentsam setup --dry-run             plan only');
  writeLine(write, '  agentsam setup runtime               Discover → profiles → GOAP → receipts');
  writeLine(write, '  agentsam setup runtime --profile my_computer --yes');
  writeLine(write, '  agentsam setup image.vectorize       specific capability');
  writeLine(write, '  agentsam setup google.cloud');
  writeLine(write, '  agentsam setup google.cloud --inventory');
  writeLine(write, '  agentsam setup --list');
  writeLine(write, '  agentsam setup --json');
  writeLine(write, '');
  writeLine(write, '  Stages: discover → plan → explain → approve → execute → verify + receipt');
  writeLine(write, '  Native installers: Homebrew / apt / winget / npm — Agent Sam does not replace them.');
  writeLine(write, '');
}

async function confirmProceed(write, { yes = false } = {}) {
  if (yes) return true;
  if (!input.isTTY || !output.isTTY) {
    writeLine(write, '  Non-interactive shell — pass --yes to execute, or --dry-run to plan only.');
    return false;
  }
  const rl = readline.createInterface({ input, output });
  try {
    const answer = String(await rl.question('  Proceed? [y/N] ')).trim().toLowerCase();
    return answer === 'y' || answer === 'yes';
  } finally {
    rl.close();
  }
}

async function runSetupRuntime(argv = [], options = {}) {
  const write = options.write || ((s) => process.stdout.write(s));
  const home = options.home;
  const json = argv.includes('--json');
  const yes = argv.includes('--yes') || argv.includes('-y');
  const dryRun = argv.includes('--dry-run');
  const profileIdx = argv.findIndex((a) => a === '--profile' || a === '-p');
  const profileId =
    profileIdx >= 0 && argv[profileIdx + 1]
      ? argv[profileIdx + 1]
      : argv.find((a) => a.startsWith('--profile='))?.slice('--profile='.length) || null;

  if (argv.includes('help') || argv.includes('--help') || argv.includes('-h')) {
    writeLine(write, '');
    writeLine(write, '  agentsam setup runtime');
    writeLine(write, '  Profiles:');
    for (const p of RUNTIME_PROFILES) {
      writeLine(write, `    ${p.id.padEnd(18)} ${p.label} — ${p.description}`);
    }
    writeLine(write, '');
    writeLine(write, '  agentsam setup runtime --dry-run');
    writeLine(write, '  agentsam setup runtime --profile my_computer --yes');
    writeLine(write, '  Receipts under ~/.agentsam/runtime/');
    writeLine(write, '');
    return 0;
  }

  if (argv.includes('--list')) {
    if (json) {
      write(`${JSON.stringify(RUNTIME_PROFILES, null, 2)}\n`);
    } else {
      writeLine(write, '');
      writeLine(write, '  Runtime profiles');
      for (const p of RUNTIME_PROFILES) {
        writeLine(write, `    ${p.id.padEnd(18)} ${p.label} — ${p.description}`);
      }
      writeLine(write, '');
    }
    return 0;
  }

  const plan = await planRuntimeSetup({ home, profileId });
  const planPath = writeRuntimePlanReceipt(plan, home);
  write(renderRuntimePlan(plan));

  if (json && (dryRun || !yes)) {
    write(JSON.stringify({ plan, plan_receipt: planPath, executed: false }, null, 2) + '\n');
    return plan.recommended?.eligible ? 0 : 2;
  }

  if (dryRun || !yes) {
    writeLine(write, `  Plan receipt  ${planPath}`);
    if (!yes) {
      writeLine(write, '  Pass --yes to install agentsamd (when profile needs it) and write install receipt.');
    }
    writeLine(write, '');
    return 0;
  }

  const recommended = plan.recommended;
  if (!recommended?.eligible) {
    writeLine(write, '  ✕ No eligible profile — resolve missing tools/capabilities first.');
    writeLine(write, '');
    return 2;
  }

  let installResult = null;
  if (recommended.target.runtime_adapter === 'agentsamd') {
    const code = await runRuntime(['install', '--yes'], { write, home });
    installResult = { code, adapter: 'agentsamd' };
    if (code !== 0) return code;
  }

  const receiptPath = writeRuntimeInstallReceipt({
    product: 'agentsam-setup-runtime',
    profile_id: recommended.profile.id,
    target: recommended.target,
    goap: recommended.goap,
    install: installResult,
    plan_receipt: planPath,
  }, home);

  writeLine(write, `  ✓ Runtime setup receipt  ${receiptPath}`);
  writeLine(write, '');
  if (json) {
    write(JSON.stringify({
      plan,
      plan_receipt: planPath,
      install_receipt: receiptPath,
      executed: true,
    }, null, 2) + '\n');
  }
  return 0;
}

export async function runSetup(argv = [], options = {}) {
  const write = options.write || ((s) => process.stdout.write(s));
  const env = options.env || process.env;
  const json = argv.includes('--json');
  const yes = argv.includes('--yes') || argv.includes('-y');
  const dryRun = argv.includes('--dry-run');
  const inventory = argv.includes('--inventory');
  const args = argv.filter(
    (a) => !['--json', '--yes', '-y', '--dry-run', '--inventory', '--list', 'help', '--help', '-h', '--profile', '-p'].includes(a)
      && !String(a).startsWith('--profile='),
  );

  if (argv.includes('help') || argv.includes('--help') || argv.includes('-h')) {
    printHelp(write);
    return 0;
  }

  if (args[0] === 'runtime') {
    return runSetupRuntime(argv.filter((a) => a !== 'runtime'), options);
  }

  if (argv.includes('--list')) {
    const recipes = listCapabilityRecipes();
    if (json) {
      write(JSON.stringify(recipes.map((r) => ({
        id: r.id,
        displayName: r.displayName,
        description: r.description,
        risk: r.risk,
      })), null, 2) + '\n');
    } else {
      writeLine(write, '');
      writeLine(write, '  Installable capabilities');
      for (const r of recipes) {
        writeLine(write, `    ${r.id.padEnd(22)} ${r.displayName}`);
      }
      writeLine(write, '');
    }
    return 0;
  }

  if (args[0] === 'google.cloud' && inventory) {
    const inv = await collectGooglePermissionInventory({ env });
    if (json) write(JSON.stringify(inv, null, 2) + '\n');
    else {
      writeLine(write, '');
      writeLine(write, '  Agent Sam · Google Cloud permission inventory');
      writeLine(write, '');
      const active = inv.config?.core?.account || '(unset)';
      const project = inv.config?.core?.project || '(unset)';
      writeLine(write, `  active account   ${active}`);
      writeLine(write, `  project          ${project}`);
      writeLine(write, `  auth accounts    ${(inv.auth_list || []).length}`);
      const scopes = String(inv.user_token_scopes?.scope || '').split(/\s+/).filter(Boolean);
      writeLine(write, `  token scopes     ${scopes.length ? scopes.length : 'unknown'}`);
      for (const s of scopes.slice(0, 12)) writeLine(write, `    • ${s}`);
      const roles = inv.iam_roles_for_active_user?.roles || [];
      writeLine(write, `  IAM roles        ${roles.length ? roles.join(', ') : '—'}`);
      writeLine(write, `  projects visible ${(inv.projects || []).length}`);
      writeLine(write, `  billing accts    ${(inv.billing_accounts || []).length}`);
      if (inv.errors?.length) {
        writeLine(write, '');
        writeLine(write, '  Errors');
        for (const e of inv.errors) writeLine(write, `    ✕ ${e}`);
      }
      writeLine(write, '');
      writeLine(write, '  Next');
      writeLine(write, '    agentsam gcloud auth login');
      writeLine(write, '    agentsam google-cloud connection set --identity EMAIL --project PROJECT');
      writeLine(write, '    agentsam google-cloud doctor');
      writeLine(write, '');
    }
    return inv.errors?.length ? 2 : 0;
  }

  const capabilityIds = args.length ? args : listCapabilityRecipes().map((r) => r.id);
  const environment = await discoverEnvironment({ env });
  const plan = await buildSetupPlan({ environment, capabilityIds });

  if (json && dryRun) {
    write(JSON.stringify({ environment, plan }, null, 2) + '\n');
    return 0;
  }

  write(renderEnvironment(environment));
  write(renderSetupPlan(plan));

  if (dryRun || !plan.would_install.length) {
    if (!plan.would_install.length) {
      writeLine(write, '  ✓ setup complete — requested capabilities already satisfied');
      writeLine(write, '  Next: agentsam doctor · agentsam capabilities · agentsam google-cloud doctor');
      writeLine(write, '');
    }
    if (json) write(JSON.stringify({ environment, plan, executed: false }, null, 2) + '\n');
    return 0;
  }

  const approved = await confirmProceed(write, { yes });
  if (!approved) {
    writeLine(write, '  Cancelled. Re-run with --yes to install, or --dry-run to plan only.');
    writeLine(write, '');
    return 1;
  }

  const receipt = await executeSetupPlan(plan, { env, write, home: options.home });
  writeLine(write, '');
  writeLine(write, receipt.ok ? '  ✓ Agent Sam setup complete' : '  ✕ Setup finished with failures');
  writeLine(write, `  Receipt  ${receipt.path}`);
  writeLine(write, '');
  writeLine(write, '  Next');
  writeLine(write, '    agentsam doctor');
  writeLine(write, '    agentsam capabilities');
  if (capabilityIds.includes('google.cloud')) {
    writeLine(write, '    agentsam setup google.cloud --inventory');
    writeLine(write, '    agentsam gcloud auth login');
  }
  if (capabilityIds.includes('image.vectorize')) {
    writeLine(write, '    agentsam image optimize ./logo.png   # when image command ships');
  }
  writeLine(write, '');

  if (json) write(JSON.stringify({ environment, plan, receipt }, null, 2) + '\n');
  return receipt.ok ? 0 : 2;
}
