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

function writeLine(write, value = '') {
  write(`${value}\n`);
}

function printHelp(write) {
  writeLine(write, '');
  writeLine(write, '  Agent Sam · setup');
  writeLine(write, '');
  writeLine(write, '  agentsam setup                      interactive discover + plan');
  writeLine(write, '  agentsam setup --yes                 approve plan non-interactively');
  writeLine(write, '  agentsam setup --dry-run             plan only');
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

export async function runSetup(argv = [], options = {}) {
  const write = options.write || ((s) => process.stdout.write(s));
  const env = options.env || process.env;
  const json = argv.includes('--json');
  const yes = argv.includes('--yes') || argv.includes('-y');
  const dryRun = argv.includes('--dry-run');
  const inventory = argv.includes('--inventory');
  const args = argv.filter(
    (a) => !['--json', '--yes', '-y', '--dry-run', '--inventory', '--list', 'help', '--help', '-h'].includes(a),
  );

  if (argv.includes('help') || argv.includes('--help') || argv.includes('-h')) {
    printHelp(write);
    return 0;
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
