#!/usr/bin/env node

import readline from 'readline';
import pkg from '../package.json' with { type: 'json' };
import { authenticateViaBrowser } from './lib/auth.js';
import { getJson, streamScaffold } from './lib/core-client.js';
import { writeScaffoldFiles, writeExecosEnvSnippet } from './lib/write-files.js';
import { detectContext, printContextSummary, missingForInit } from './lib/detect-context.js';
import { SLASH_COMMANDS, SHELL_PHASES } from './lib/slash-commands.js';

const VERSION = pkg.version;

function createPrompt() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return {
    ask: (q) => new Promise((resolve) => rl.question(q, resolve)),
    close: () => rl.close(),
  };
}

const LANES = {
  '1': { key: 'fullstack', label: 'Full Stack' },
  '2': { key: 'cms', label: 'CMS' },
  '3': { key: 'data', label: 'Data Solutions' },
  '4': { key: 'crm', label: 'Customer Management' },
  '5': { key: 'creative', label: 'Creative & Design' },
};

const HOSTING = {
  '1': { key: 'local', label: 'Local machine (git init here)' },
  '2': { key: 'github', label: 'GitHub + Cloudflare (your repos)' },
  '3': { key: 'cloudflare', label: 'Cloudflare Workers only' },
};

function printHelp() {
  console.log(`
  Agent Sam SDK — CLI v${VERSION}

  Usage:
    agentsam init              Authenticate + scaffold YOUR project via Agent Sam (CORE)
    agentsam shell             CLI shell UX info + slash commands
    agentsam --version
    agentsam --help

  Init options (non-interactive — requires prior SDK bearer in AGENTSAM_SDK_TOKEN):
    --name <name>              Project directory name
    --lane <fullstack|cms|data|crm|creative>
    --hosting <local|github|cloudflare>
    --account-id <cf_id>       When multiple CF accounts on token
    --token <sdk_bearer>       Skip browser auth
    --yes                      Skip confirmation
  `);
}

function parseInitArgs(argv) {
  const opts = {
    projectName: '',
    lane: 'fullstack',
    hosting: 'local',
    accountId: '',
    token: process.env.AGENTSAM_SDK_TOKEN || '',
    yes: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--yes' || arg === '-y') opts.yes = true;
    else if (arg === '--name') opts.projectName = argv[++i] || '';
    else if (arg === '--lane') opts.lane = argv[++i] || 'fullstack';
    else if (arg === '--hosting') opts.hosting = argv[++i] || 'local';
    else if (arg === '--account-id') opts.accountId = argv[++i] || '';
    else if (arg === '--token') opts.token = argv[++i] || '';
  }
  return opts;
}

async function runScaffoldStream(token, body) {
  let complete = null;
  await streamScaffold(body, token, async (evt) => {
    if (evt.type === 'log') console.log(`  · ${evt.message}`);
    else if (evt.type === 'warn') console.log(`  ⚠ ${evt.message}`);
    else if (evt.type === 'account_selection_required') {
      console.log('\n  Multiple Cloudflare accounts — re-run with --account-id:\n');
      for (const a of evt.accounts || []) {
        console.log(`    ${a.id}  ${a.name || ''}`);
      }
      throw new Error('cloudflare_account_selection_required');
    } else if (evt.type === 'error') {
      throw new Error(evt.error || 'scaffold failed');
    } else if (evt.type === 'complete') {
      complete = evt;
    }
  });
  if (!complete) throw new Error('scaffold incomplete');
  return complete;
}

async function runInit(config) {
  const {
    projectName,
    lane,
    hosting,
    accountId,
    token: presetToken,
    yes,
    prompt,
    detectedCtx,
    summaryShown = false,
  } = config;

  const detected = detectedCtx || (await detectContext());
  if (!summaryShown) printContextSummary(detected);

  const missing = missingForInit(detected, presetToken);
  if (!yes && prompt) {
    const msg = missing.includes('iam')
      ? '  Proceed? IAM sign-in will open in browser for missing credentials. (y/n): '
      : '  Proceed with detected credentials? (y/n): ';
    const proceed = await prompt.ask(msg);
    if (proceed.toLowerCase() !== 'y') {
      console.log('\n  Cancelled.\n');
      return;
    }
  }

  console.log(`
  ┌─────────────────────────────────────┐
  │  Agent Sam — your project           │
  ├─────────────────────────────────────┤
  │  Name:     ${projectName.padEnd(25)}│
  │  Lane:     ${lane.padEnd(25)}│
  │  Hosting:  ${hosting.padEnd(25)}│
  └─────────────────────────────────────┘
  `);

  let token = presetToken || process.env.AGENTSAM_SDK_TOKEN || '';
  if (!token && missing.includes('iam')) {
    const session = await authenticateViaBrowser();
    token = session.access_token;
    console.log(`\n  ✓ Signed in (${session.user_id})\n`);
  } else if (token) {
    console.log('\n  ✓ Using existing IAM SDK token\n');
  }

  const ctx = await getJson('/api/sdk/context', token);
  if (!ctx?.cloudflare?.ok) {
    console.error('\n  ✗ Connect Cloudflare in IAM (Integrations) during browser sign-in.\n');
    process.exitCode = 1;
    return;
  }

  if (ctx.cloudflare.accounts?.length > 1 && !accountId) {
    console.log('\n  Multiple Cloudflare accounts — pick one with --account-id:\n');
    for (const a of ctx.cloudflare.accounts) {
      console.log(`    ${a.id}  ${a.name || ''}`);
    }
    console.log('');
    process.exitCode = 1;
    return;
  }

  console.log('  Agent Sam is working (D1, R2, KV, migration, files)…\n');

  const result = await runScaffoldStream(token, {
    project_name: projectName,
    lane,
    hosting,
    account_id: accountId || undefined,
    workspace_id: ctx.workspace_id,
  });

  const dir = writeScaffoldFiles(projectName, result.files || []);
  const envPath = writeExecosEnvSnippet(dir, result.pty?.execos_env, projectName);

  console.log(`
  ✓ Your project is ready: ${dir}
  ✓ Cloudflare account: ${result.cloudflare?.account_id || '—'}
  ✓ D1: ${result.cloudflare?.d1_database_id || '—'}

  Next steps:`);
  for (const step of result.next_steps || ['npm install', 'npm run smoke']) {
    console.log(`    ${step}`);
  }
  if (envPath) {
    console.log(`\n  ExecOS env snippet: ${envPath}`);
    console.log('  Paste into ExecOS .env → Start local in IAM dashboard works on YOUR machine.');
  }
  console.log('\n  This repo is yours. IAM built it; you can ship without us anytime.\n');
}

async function initInteractive(partial = {}) {
  const prompt = createPrompt();

  console.log(`
  ╔═══════════════════════════════════╗
  ║   Agent Sam SDK — Init            ║
  ║   One command. Your CF account.   ║
  ╚═══════════════════════════════════╝
  `);

  const detectedCtx = await detectContext();
  printContextSummary(detectedCtx);

  if (!partial.yes) {
    const missing = missingForInit(detectedCtx, partial.token || '');
    const msg = missing.includes('iam')
      ? '  Proceed? IAM sign-in will open in browser for missing credentials. (y/n): '
      : '  Proceed with detected credentials? (y/n): ';
    const proceed = await prompt.ask(msg);
    if (proceed.toLowerCase() !== 'y') {
      console.log('\n  Cancelled.\n');
      prompt.close();
      return;
    }
  }

  const projectName = partial.projectName || (await prompt.ask('  1) Project name: '));

  if (!partial.lane) {
    console.log(`
  2) Lane:
    1) Full Stack   2) CMS   3) Data   4) CRM   5) Creative
  `);
  }
  const laneKey = partial.lane
    ? Object.values(LANES).find((l) => l.key === partial.lane)?.key || partial.lane
    : LANES[await prompt.ask('  Pick lane [1-5]: ')]?.key || 'fullstack';

  if (!partial.hosting) {
    console.log(`
  3) Where does the repo live?
    1) Local machine   2) GitHub + CF   3) Cloudflare only
  `);
  }
  const hostingKey = partial.hosting
    ? Object.values(HOSTING).find((h) => h.key === partial.hosting)?.key || partial.hosting
    : HOSTING[await prompt.ask('  Pick hosting [1-3]: ')]?.key || 'local';

  await runInit({
    projectName,
    lane: laneKey,
    hosting: hostingKey,
    accountId: partial.accountId || '',
    token: partial.token || '',
    yes: true,
    prompt,
    detectedCtx,
    summaryShown: true,
  });

  prompt.close();
}

async function initFromArgs(argv) {
  const opts = parseInitArgs(argv);
  if (!opts.projectName) {
    console.error('\n  ✗ --name is required for non-interactive init.\n');
    process.exit(1);
  }
  const detectedCtx = await detectContext();
  printContextSummary(detectedCtx);
  await runInit({ ...opts, prompt: null, detectedCtx, summaryShown: true });
}

async function runShellInfo() {
  const next = SHELL_PHASES.find((p) => p.status === 'next');
  console.log(`
  ╔═══════════════════════════════════╗
  ║     Agent Sam Shell (Gorilla)     ║
  ╚═══════════════════════════════════╝

  Next milestone: ${next?.label ?? 'PTY connection'}

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
