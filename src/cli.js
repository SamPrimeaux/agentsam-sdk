#!/usr/bin/env node

import pkg from '../package.json' with { type: 'json' };
import readline from 'readline';
import { buildLocalScaffoldMeta, LANE_KEYS, RUN_TARGETS } from './lib/local-scaffold.js';
import { writeScaffoldFiles } from './lib/write-files.js';
import { printContextSummary } from './lib/detect-context.js';
import { promptOptionalByokKeys } from './lib/prompt-byok.js';
import { runStartLocal } from './commands/start-local.js';
import { runDeploy } from './commands/deploy.js';
import { SLASH_COMMANDS, SHELL_PHASES } from './lib/slash-commands.js';

const VERSION = pkg.version;

function createPrompt() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return {
    ask: (q) => new Promise((resolve) => rl.question(q, resolve)),
    close: () => rl.close(),
  };
}

function printHelp() {
  console.log(`
  Agent Sam SDK — CLI v${VERSION}

  Usage:
    agentsam init              Local-first project scaffold (default: localhost, no accounts)
    agentsam start-local       Local PTY on ws://127.0.0.1:3099 (no tunnel, no Cloudflare)
    agentsam deploy            Graduate to Cloudflare / GCP when ready
    agentsam shell             Slash commands + shell UX info
    agentsam --version
    agentsam --help

  Init is completable with Node only — no IAM login, no OAuth, no Cloudflare.
  Prove locally first; deploy prompts for accounts only when you choose to ship.

  Init options:
    --name <name>              Project directory name
    --lane <fullstack|cms|data|crm|creative>
    --run-target <local|cloudflare|gcp>   Default: local
    --yes                      Skip confirmation
  `);
}

function parseInitArgs(argv) {
  const opts = {
    projectName: '',
    lane: 'fullstack',
    runTarget: 'local',
    yes: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--yes' || arg === '-y') opts.yes = true;
    else if (arg === '--name') opts.projectName = argv[++i] || '';
    else if (arg === '--lane') opts.lane = argv[++i] || 'fullstack';
    else if (arg === '--run-target' || arg === '--target') opts.runTarget = argv[++i] || 'local';
  }
  return opts;
}

function parseDeployArgs(argv) {
  const opts = { target: '', accountId: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--target') opts.target = argv[++i] || '';
    else if (arg === '--account-id') opts.accountId = argv[++i] || '';
  }
  return opts;
}

async function runLocalInit(config) {
  const { projectName, lane, runTarget, prompt } = config;

  const meta = buildLocalScaffoldMeta(
    { projectName, lane, runTarget },
    VERSION,
  );

  console.log(`
  ┌─────────────────────────────────────┐
  │  Agent Sam — local-first scaffold   │
  ├─────────────────────────────────────┤
  │  Name:     ${meta.projectName.padEnd(25)}│
  │  Lane:     ${meta.laneKey.padEnd(25)}│
  │  Run:      ${meta.runTarget.padEnd(25)}│
  └─────────────────────────────────────┘
  `);

  const dir = writeScaffoldFiles(meta.projectName, meta.files);

  console.log(`
  ✓ Project ready: ${dir}

  Next steps:`);
  for (const step of meta.next_steps) {
    console.log(`    ${step}`);
  }

  if (prompt && process.env.AGENTSAM_SDK_TOKEN) {
    console.log('\n  Optional — BYOK keys for IAM dashboard Agent Sam (skip with Enter):\n');
    await promptOptionalByokKeys(process.env.AGENTSAM_SDK_TOKEN, prompt);
  }

  console.log(`
  Local in ~60 seconds:
    cd ${meta.projectName} && npm install && npm run smoke
    npx agentsam start-local
    npm run dev
  `);
}

async function initInteractive(partial = {}) {
  const prompt = createPrompt();

  console.log(`
  ╔═══════════════════════════════════╗
  ║   Agent Sam SDK — Init            ║
  ║   Local-first · Node only         ║
  ╚═══════════════════════════════════╝
  `);

  printContextSummary(await import('./lib/detect-context.js').then((m) => m.detectContext()));

  const projectName =
    partial.projectName ||
    (await prompt.ask('  1) Project name: '));

  if (!partial.lane) {
    console.log(`
  2) Lane:
    1) Full Stack   2) CMS   3) Data   4) CRM   5) Creative
  `);
  }
  const laneKey = partial.lane
    ? partial.lane
    : LANE_KEYS[await prompt.ask('  Pick lane [1-5]: ')]?.key || 'fullstack';

  if (!partial.runTarget) {
    console.log(`
  3) Where do you want to run your project?

    1) Local (localhost — start here, no accounts needed)
    2) Cloudflare (Workers, D1, R2 — deploy when ready)
    3) GCP (your own Google Cloud project)
  `);
  }
  const runTarget = partial.runTarget
    ? partial.runTarget
    : RUN_TARGETS[await prompt.ask('  Select [1]: ')] || 'local';

  await runLocalInit({ projectName, lane: laneKey, runTarget, prompt });
  prompt.close();
}

async function initFromArgs(argv) {
  const opts = parseInitArgs(argv);
  if (!opts.projectName) {
    console.error('\n  ✗ --name is required for non-interactive init.\n');
    process.exit(1);
  }
  await runLocalInit({ ...opts, prompt: null });
}

async function runShellInfo() {
  const next = SHELL_PHASES.find((p) => p.status === 'next');
  console.log(`
  ╔═══════════════════════════════════╗
  ║     Agent Sam Shell (Gorilla)     ║
  ╚═══════════════════════════════════╝

  Local PTY: agentsam start-local (ws://127.0.0.1:3099)
  Next milestone: ${next?.label ?? 'dashboard bridge after deploy'}

  Slash commands (${SLASH_COMMANDS.length} registered):
`);
  for (const row of SLASH_COMMANDS) {
    console.log(`    ${row.cmd.padEnd(14)} ${row.description}`);
  }
}

const command = process.argv[2];
const rest = process.argv.slice(3);

if (command === '--version' || command === '-v') {
  console.log(VERSION);
} else if (command === '--help' || command === '-h' || !command) {
  printHelp();
} else if (command === 'shell') {
  await runShellInfo();
} else if (command === 'start-local') {
  await runStartLocal({});
} else if (command === 'deploy') {
  try {
    await runDeploy(parseDeployArgs(rest));
  } catch (e) {
    console.error(`\n  ✗ ${e?.message || e}\n`);
    process.exit(1);
  }
} else if (command === 'init') {
  const hasFlags = rest.some((a) => a.startsWith('--'));
  if (hasFlags) {
    await initFromArgs(rest);
  } else {
    await initInteractive({});
  }
} else {
  console.error(`\n  Unknown command: ${command}\n`);
  printHelp();
  process.exit(1);
}
