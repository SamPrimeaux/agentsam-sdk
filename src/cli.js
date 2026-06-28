#!/usr/bin/env node

import readline from 'readline';
import pkg from '../package.json' with { type: 'json' };
import { scaffoldProject } from './lib/scaffold.js';

const VERSION = pkg.version;

function createPrompt() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return {
    ask: (q) => new Promise((resolve) => rl.question(q, resolve)),
    close: () => rl.close(),
  };
}

const LANES = {
  '1': 'Full Stack',
  '2': 'Data Solutions',
  '3': 'Customer Management',
  '4': 'Creative & Design',
};

const LANE_BY_SLUG = {
  fullstack: 'Full Stack',
  data: 'Data Solutions',
  crm: 'Customer Management',
  creative: 'Creative & Design',
};

const PROVIDERS = {
  '1': 'Cloudflare Workers',
  '2': 'GitHub + Cloudflare',
  '3': 'Local / Self-hosted',
};

const PROVIDER_BY_SLUG = {
  cloudflare: 'Cloudflare Workers',
  github: 'GitHub + Cloudflare',
  local: 'Local / Self-hosted',
};

const AGENTS = {
  '1': 'orchestrator',
  '2': 'data',
  '3': 'crm',
  '4': 'creative',
};

function laneKeyFromSlug(slug) {
  const entry = Object.entries(LANES).find(([, label]) => label === slug);
  return entry?.[0] ?? '1';
}

function printHelp() {
  console.log(`
  Agent Sam SDK — CLI v${VERSION}

  Usage:
    agentsam init [options]     Scaffold a new Agent Sam project
    agentsam --version          Print version
    agentsam --help             Show this help

  Init options (non-interactive):
    --name <name>               Project directory name
    --lane <fullstack|data|crm|creative>
    --provider <cloudflare|github|local>
    --agent <orchestrator|data|crm|creative>
    --cf-account <id>           Cloudflare account ID
    --yes                       Skip confirmation prompt
  `);
}

function parseInitArgs(argv) {
  const opts = {
    projectName: '',
    lane: '',
    provider: '',
    agent: '',
    cfAccountId: '',
    yes: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--yes' || arg === '-y') opts.yes = true;
    else if (arg === '--name') opts.projectName = argv[++i] || '';
    else if (arg === '--lane') opts.lane = LANE_BY_SLUG[argv[++i]] || argv[i] || '';
    else if (arg === '--provider') opts.provider = PROVIDER_BY_SLUG[argv[++i]] || argv[i] || '';
    else if (arg === '--agent') opts.agent = argv[++i] || '';
    else if (arg === '--cf-account') opts.cfAccountId = argv[++i] || '';
  }

  return opts;
}

async function runInit(config) {
  const {
    projectName,
    lane,
    provider,
    agent,
    cfAccountId = '',
    yes = false,
    prompt = null,
  } = config;

  console.log(`
  ┌─────────────────────────────────────┐
  │  Agent Sam Project Config           │
  ├─────────────────────────────────────┤
  │  Project:   ${projectName.padEnd(25)}│
  │  Lane:      ${lane.padEnd(25)}│
  │  Provider:  ${provider.padEnd(25)}│
  │  Agent:     ${agent.padEnd(25)}│
  │  CF Acct:   ${(cfAccountId || 'not set').padEnd(25)}│
  └─────────────────────────────────────┘
  `);

  let confirm = 'y';
  if (!yes && prompt) {
    confirm = await prompt.ask('  Scaffold project? (y/n): ');
  }

  if (confirm.toLowerCase() === 'y') {
    const dir = scaffoldProject({ projectName, lane, provider, agent, cfAccountId, sdkVersion: VERSION });
    console.log(`
  ✓ Project created at ${dir}

  Next steps:
    cd ${projectName}
    cp .env.example .env
    npm install
    npm run dev
    curl http://localhost:8787/health
    `);
  } else {
    console.log('\n  Cancelled.\n');
  }
}

async function initInteractive(partial = {}) {
  const prompt = createPrompt();

  console.log(`
  ╔═══════════════════════════════════╗
  ║       Agent Sam SDK — Init        ║
  ╚═══════════════════════════════════╝
  `);

  const projectName = partial.projectName || (await prompt.ask('  Project name: '));

  if (!partial.lane) {
    console.log(`
  Select a lane:
    1) Full Stack
    2) Data Solutions
    3) Customer Management
    4) Creative & Design
  `);
  }
  const laneKey = partial.lane ? laneKeyFromSlug(partial.lane) : await prompt.ask('  Lane [1-4]: ');
  const lane = partial.lane || LANES[laneKey] || 'Full Stack';

  let provider = partial.provider || 'Cloudflare Workers';
  const laneNum = partial.lane ? laneKeyFromSlug(partial.lane) : laneKey;
  if (!partial.provider && laneNum === '1') {
    console.log(`
  Select a provider:
    1) Cloudflare Workers
    2) GitHub + Cloudflare
    3) Local / Self-hosted
    `);
    const providerKey = await prompt.ask('  Provider [1-3]: ');
    provider = PROVIDERS[providerKey] ?? 'Cloudflare Workers';
  }

  if (!partial.agent) {
    console.log(`
  Select your default Agent Sam:
    1) Orchestrator    — general purpose, routes to all lanes
    2) Data Agent      — database ops, migrations, queries
    3) CRM Agent       — customer management, contacts, billing
    4) Creative Agent  — design, 3D, media, content
  `);
  }
  const agentKey = partial.agent
    ? Object.entries(AGENTS).find(([, v]) => v === partial.agent)?.[0] || '1'
    : await prompt.ask('  Agent [1-4]: ');
  const agent = partial.agent || AGENTS[agentKey] || 'orchestrator';

  const cfAccountId =
    partial.cfAccountId !== undefined && partial.cfAccountId !== ''
      ? partial.cfAccountId
      : await prompt.ask('  Cloudflare Account ID (enter to skip): ');

  await runInit({
    projectName,
    lane,
    provider,
    agent,
    cfAccountId,
    yes: partial.yes,
    prompt,
  });

  prompt.close();
}

async function initFromArgs(argv) {
  const opts = parseInitArgs(argv);
  if (!opts.projectName) {
    console.error('\n  ✗ --name is required for non-interactive init.\n');
    process.exit(1);
  }
  await runInit({
    projectName: opts.projectName,
    lane: opts.lane || 'Full Stack',
    provider: opts.provider || 'Cloudflare Workers',
    agent: opts.agent || 'orchestrator',
    cfAccountId: opts.cfAccountId,
    yes: true,
    prompt: null,
  });
}

const command = process.argv[2];
const rest = process.argv.slice(3);

if (command === '--version' || command === '-v') {
  console.log(VERSION);
} else if (command === '--help' || command === '-h' || !command) {
  printHelp();
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
