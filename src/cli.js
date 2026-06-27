#!/usr/bin/env node

import readline from 'readline';
import { scaffoldProject } from './lib/scaffold.js';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(resolve => rl.question(q, resolve));

const LANES = {
  '1': 'Full Stack',
  '2': 'CMS',
  '3': 'Data Solutions',
  '4': 'Customer Management',
  '5': 'Creative & Design',
};

const PROVIDERS = {
  '1': 'Cloudflare Workers',
  '2': 'GitHub + Cloudflare',
  '3': 'Local / Self-hosted',
};

const AGENTS = {
  '1': 'orchestrator',
  '2': 'cms',
  '3': 'data',
  '4': 'crm',
  '5': 'creative',
};

async function init() {
  console.log(`
  ╔═══════════════════════════════════╗
  ║       Agent Sam SDK — Init        ║
  ╚═══════════════════════════════════╝
  `);

  const projectName = await ask('  Project name: ');

  console.log(`
  Select a lane:
    1) Full Stack
    2) CMS
    3) Data Solutions
    4) Customer Management
    5) Creative & Design
  `);
  const laneKey = await ask('  Lane [1-5]: ');
  const lane = LANES[laneKey] ?? 'Full Stack';

  console.log(`
  Select a provider:
    1) Cloudflare Workers
    2) GitHub + Cloudflare
    3) Local / Self-hosted
  `);
  const providerKey = await ask('  Provider [1-3]: ');
  const provider = PROVIDERS[providerKey] ?? 'Cloudflare Workers';

  console.log(`
  Select your default Agent Sam:
    1) Orchestrator    — general purpose, routes to all lanes
    2) CMS Agent       — pages, sections, assets, publishing workflows
    3) Data Agent      — database ops, migrations, queries
    4) CRM Agent       — customer management, contacts, billing
    5) Creative Agent  — design, 3D, media, content
  `);
  const agentKey = await ask('  Agent [1-5]: ');
  const agent = AGENTS[agentKey] ?? 'orchestrator';

  const cfAccountId = await ask('  Cloudflare Account ID (enter to skip): ');

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

  const confirm = await ask('  Scaffold project? (y/n): ');

  if (confirm.toLowerCase() === 'y') {
    try {
      const dir = scaffoldProject({ projectName, lane, provider, agent, cfAccountId });
      console.log(`
  ✓ Project created at ${dir}

  Next steps:
    cd ${projectName}
    cp .env.example .env
    npm install
    npm run smoke
    npm run dev
    `);
    } catch (error) {
      console.error(`\n  ✗ ${error.message}\n`);
      process.exitCode = 1;
    }
  } else {
    console.log('\n  Cancelled.\n');
  }

  rl.close();
}

const command = process.argv[2];

if (command === 'init') {
  init();
} else {
  console.log(`
  Agent Sam SDK — CLI

  Usage:
    agentsam init        Initialize a new Agent Sam project

  Version: 1.1.0
  `);
}
