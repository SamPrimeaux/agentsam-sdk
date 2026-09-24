import { collectRuntimeStatus } from './runtime-status.js';
import { renderRuntimeStatus } from '../ui/ansi.js';
import { buildStatusActionPlan } from '../status/actions.js';
import { openExternalUrl } from '../lib/open-url.js';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

function parseStatusArgs(argv = []) {
  const opts = {
    json: false,
    offline: false,
    discoverModels: true,
    interactive: false,
  };
  for (const arg of argv) {
    if (arg === '--json') opts.json = true;
    else if (arg === '--offline') opts.offline = true;
    else if (arg === '--no-discover') opts.discoverModels = false;
    else if (arg === '--interactive' || arg === '-i') opts.interactive = true;
    else throw new Error(`unknown status option: ${arg}`);
  }
  return opts;
}

async function runInteractiveMenu(status, write) {
  const plan = buildStatusActionPlan(status);
  write(`\n  ${plan.headline}\n`);
  if (plan.tips.length) {
    for (const tip of plan.tips) write(`  • ${tip}\n`);
    write('\n');
  }
  plan.actions.forEach((action, index) => {
    write(`  ${String(index + 1).padStart(2)}. ${action.label}\n`);
    write(`      ${action.why}\n`);
  });
  write(`   0. Done\n\n`);

  if (!input.isTTY || !output.isTTY) {
    write('  (non-TTY — pick a command from the list above)\n\n');
    return;
  }

  const rl = readline.createInterface({ input, output });
  try {
    while (true) {
      const answer = (await rl.question('  Select [0-n]: ')).trim();
      if (!answer || answer === '0' || /^q(uit)?$/i.test(answer)) break;
      const index = Number(answer) - 1;
      const action = plan.actions[index];
      if (!action) {
        write('  Invalid choice.\n');
        continue;
      }
      if (action.id === 'open_health' && /^https?:\/\//i.test(action.command)) {
        write(`  Opening ${action.command}\n`);
        openExternalUrl(action.command);
        continue;
      }
      write(`\n  → ${action.command}\n`);
      write(`    ${action.why}\n\n`);
      write('  Copy/run that in this project root (awareness stays in-repo).\n');
      write('  Or press Enter for another action, 0 to exit.\n\n');
    }
  } finally {
    rl.close();
  }
}

export async function runStatus(argv = [], opts = {}) {
  const parsed = parseStatusArgs(argv);
  const status = await (opts.collectRuntime || collectRuntimeStatus)({
    ...opts,
    cwd: opts.cwd || process.cwd(),
    offline: parsed.offline,
    discoverModels: parsed.discoverModels,
  });
  const write = opts.write || ((value) => process.stdout.write(value));
  if (parsed.json) {
    const plan = buildStatusActionPlan(status);
    write(`${JSON.stringify({ ...status, next: plan }, null, 2)}\n`);
  } else {
    write(`\n${renderRuntimeStatus(status)}\n\n`);
    if (parsed.interactive || opts.interactive) {
      await runInteractiveMenu(status, write);
    }
  }
  return status;
}
