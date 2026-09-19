#!/usr/bin/env node

import pkg from '../package.json' with { type: 'json' };
import { cancel, intro, isCancel, outro, select, text } from '@clack/prompts';
import path from 'node:path';
import { buildLocalScaffoldMeta } from './lib/local-scaffold.js';
import { writeScaffoldFiles } from './lib/write-files.js';
import { initializeGitRepository } from './lib/init-git.js';
import { initializeLocalSqlite } from './local/sqlite.js';
import { printContextSummary } from './lib/detect-context.js';
import { runStartLocal } from './commands/start-local.js';
import { runOllama } from './commands/ollama.js';
import { runModels } from './commands/models.js';
import { runProviders } from './commands/providers.js';
import { runEnv } from './commands/env.js';
import { runTunnel } from './commands/tunnel.js';
import { runDeploy } from './commands/deploy.js';
import { runConnections } from './commands/connections.js';
import { runIdentityPreview } from './commands/identity-preview.js';
import { runIdentityInit } from './commands/identity-init.js';
import { runContext } from './commands/context.js';
import { runDb } from './commands/db.js';
import { runStatus } from './commands/status.js';
import { runInteractive } from './commands/interactive.js';
import { runShell } from './commands/shell.js';
import { runDockerize } from './commands/dockerize.js';
import { runMini } from './commands/mini.js';
import { runMerkle } from './commands/merkle.js';
import { runDeployReceipt } from './commands/deploy-receipt.js';
import { runSecurity } from './commands/security.js';
import { runRecon } from './commands/recon.js';
import { runCad } from './commands/cad.js';
import { runSkills } from './commands/skills.js';
import { runEval } from './commands/eval.js';
import { runCloudflare } from './commands/cloudflare.js';
import { runWhoami } from './commands/whoami.js';
import { runResume } from './commands/resume.js';
import { runLogin, runLogout } from './commands/account-auth.js';
import { applyPresetSelection, runAdd, runCapabilities, runDev, runInspect } from './commands/product.js';
import { listPresets, resolvePreset } from './presets/index.js';
import fs from 'node:fs';
import { repositoryRoot } from './knowledge/config.js';
import { resolveAccountAuth } from './lib/account-session.js';
import { renderDiagnosticError } from './errors/index.js';
import { renderHelpOverview, runHelp } from './ui/cli/help.js';

const VERSION = pkg.version;

function reportCliError(error) {
  if (error?.reported) return;
  const rendered = renderDiagnosticError(error).split('\n').map((line) => `  ${line}`).join('\n');
  console.error(`\n${rendered}\n`);
}


function printHelp() {
  console.log(renderHelpOverview(VERSION));
}

function printLegacyHelp() {
  console.log(`
  Agent Sam SDK — CLI v${VERSION}

  Product UX:
    agentsam                     Enter the interactive Agent Sam experience
    agentsam create <name> --preset <fullstack|cms|prototype|data>
    agentsam add <auth|cms|knowledge|agent|deploy-cloudflare>
    agentsam dev               Run this project's existing npm dev script
    agentsam inspect [--json]  Bounded repository index by default; use --view full for authority envelope
    agentsam deploy            Graduate an AgentSam project intentionally

  Capability discovery:
    agentsam capabilities [capability-id] [--json]
    agentsam skills [skill-id-or-alias] [--references] [--json]

  Power-user UX:
    agentsam context [--json]  Git repo/revision + bridge configuration from any repo
    agentsam init              Configure knowledge in this repo; --name scaffolds a new project
    agentsam index             Plan/run incremental AST and optional embeddings (--help)
    agentsam search "query"    Retrieve indexed code/text; --semantic enables embeddings
    agentsam repo snapshot     Git composition/churn; --save retains observations
    agentsam cad blender       Programmatic Blender inspect/build/render/export (--help)
    agentsam mini <name>       Create and preview a small local gadget (--help for options)
    agentsam merkle            File integrity, snapshots, comparisons, and interactive explorer (--help)
    agentsam deploy-receipt    Merkle deploy/checkpoint capture + promote/failure receipts (--help)
    agentsam recon             Bounded-worker task packets + finding-report validation (--help)
    agentsam security          Dependency scan, log triage, and verified repair (--help)
    agentsam status [--json]   Live account + models + terminal + Worker/binding status
    agentsam db init|status    Manage the project-local SQLite database
    agentsam models            Verify configured providers and selectable hosted/local models
    agentsam providers         Configure, verify, and remove machine provider credentials
    agentsam env init <name>   Create a secure provider profile + reusable shell loader
    agentsam login             Sign in to Inner Animal Media and persist a secure machine-local session
    agentsam logout            Sign out locally; provider credentials stay untouched
    agentsam whoami [--json]   Authenticated account identity + safe credential status
    agentsam resume [session]  Resume a saved Agent Sam session; omit id for picker
    agentsam eval context      Offline context-strategy/economics fixtures (--help)
    agentsam cloudflare        Native Wrangler reads + Worker CPU profile analysis (--help)
    agentsam start-local       Local PTY on ws://127.0.0.1:3099 (no tunnel, no Cloudflare)
    agentsam ollama            Opt-in local Ollama setup/status/model management
    agentsam shell             Interactive Agent Sam slash-command shell
    agentsam tunnel            Explicitly expose local PTY when remote access is wanted
    agentsam deploy            Graduate to Cloudflare / GCP when ready
    agentsam dockerize         Build/run app, knowledge, or CAD containers (--help)
    agentsam identity preview  Preview the reusable local auth portal (not production login)
    agentsam identity init     Add reusable identity package surfaces
    agentsam help
    agentsam --version
    agentsam --help

  Context options:
    --json                     Machine-readable output
    --cwd <path>               Resolve a different working directory

  Inspect options:
    --view <full|index|files>  Full authority envelope, facet index, or bounded matching files (default index)
    --full                     Explicitly request the full authority envelope
    --system/--package <name>  Filter semantic ownership
    --category/--tag <value>   Filter semantic classification
    --layer/--role <value>     Filter architecture role
    --path <prefix|glob>       Filter repository paths (supports * and **)
    --symbol/--import <value>  Filter AST symbols or imports
    --match <text>             Lexical AND-match across semantic routing metadata
    --limit <1..500>           Bound files view (default 50)
    --facet-limit <1..200>     Bound each facet list (default 48)
    --snapshot-file <file>     Reuse a saved canonical repository.snapshot; skips Merkle/AST rescan
    --save-snapshot <file>     Save the canonical full snapshot while emitting the selected view
    --pretty                   Pretty-print JSON; machine JSON is compact by default
    --remote <name>            Preferred Git remote (default origin; falls back to first remote)

  Run agentsam from any project to enter the account-aware interactive experience.
  Account, model-provider, terminal, and deploy permissions are requested only when the related capability needs them.

  Tunnel options:
    --quick                    Quick tunnel (default) — trycloudflare.com URL
    --named                    Named CF tunnel (needs --tunnel-name --hostname --zone-id)
    --port <n>                 Local PTY port (default 3099)
    --token <aak_…>            Use AGENTSAM_API_KEY-compatible account credential

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
  const opts = { target: '', accountId: '', dryRun: false, plan: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--target') opts.target = argv[++i] || '';
    else if (arg === '--account-id') opts.accountId = argv[++i] || '';
    else if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--plan') opts.plan = true;
  }
  return opts;
}

function parseCreateArgs(argv) {
  const opts = { projectName: '', preset: 'fullstack', runTarget: 'local', help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg === '--preset') opts.preset = argv[++i] || 'fullstack';
    else if (arg === '--run-target' || arg === '--target') opts.runTarget = argv[++i] || 'local';
    else if (arg === '--yes' || arg === '-y') continue;
    else if (arg.startsWith('-')) throw new Error(`unknown create option: ${arg}`);
    else if (!opts.projectName) opts.projectName = arg;
    else throw new Error(`unexpected create argument: ${arg}`);
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
  ┌──────────────────────────────────────┐
  │  Agent Sam — local-first scaffold   │
  ├──────────────────────────────────────┤
  │  Name:     ${meta.projectName.padEnd(25)}│
  │  Lane:     ${meta.laneKey.padEnd(25)}│
  │  Run:      ${meta.runTarget.padEnd(25)}│
  └──────────────────────────────────────┘
  `);

  const dir = writeScaffoldFiles(meta.projectName, meta.files);
  const git = initializeGitRepository(dir);
  const db = await initializeLocalSqlite({
    dbPath: path.join(dir, '.agentsam', 'data', 'agentsam.sqlite'),
    schemaPath: path.join(dir, 'db', 'schema.sql'),
  });

  console.log(`
  ✓ Project      ${dir}
  ${git.ok ? '✓' : '⚠'} Git          ${git.ok ? 'initialized' : 'git not found; initialize it when available'}
  ✓ Environment  ${path.join(dir, '.env')}
  ✓ SQLite       ${db.dbPath} (${db.tables.length} tables)
  ✓ Local API    Node · http://127.0.0.1:8787
  ✓ Agent Sam     interactive CLI ready

  Next:`);
  console.log(`    cd ${meta.projectName}`);
  for (const step of meta.next_steps) {
    console.log(`    ${step}`);
  }


  console.log(`
  Local means local: no Worker, tunnel, IAM login, or cloud database is required.
  `);
  return { dir, meta };
}

async function initInteractive(partial = {}) {
  const pick = (value) => {
    if (!isCancel(value)) return value;
    cancel('Agent Sam init cancelled.');
    const error = new Error('init_cancelled');
    error.code = 'AGENTSAM_INIT_CANCELLED';
    throw error;
  };

  intro('Create an Agent Sam project');

  const projectName = partial.projectName || pick(await text({
    message: 'Project name',
    placeholder: 'my-agent',
    validate(value) {
      if (!String(value || '').trim()) return 'Project name is required';
    },
  }));

  const laneKey = partial.lane || pick(await select({
    message: 'Project type',
    initialValue: 'fullstack',
    options: [
      { value: 'fullstack', label: 'Full Stack' },
      { value: 'cms', label: 'CMS' },
      { value: 'data', label: 'Data Solutions' },
      { value: 'crm', label: 'Customer Management' },
      { value: 'creative', label: 'Creative & Design' },
    ],
  }));

  const runTarget = partial.runTarget || pick(await select({
    message: 'Future deploy target',
    initialValue: 'local',
    options: [
      { value: 'local', label: 'Local only / decide later' },
      { value: 'cloudflare', label: 'Cloudflare later' },
      { value: 'gcp', label: 'GCP later' },
    ],
  }));

  if (runTarget !== 'local') {
    const { detectContext, missingForInit } = await import('./lib/detect-context.js');
    const ctx = await detectContext();
    if (missingForInit(ctx, resolveAccountAuth({ env: process.env }).value, { runTarget }).length) {
      printContextSummary(ctx);
    }
  }

  await runLocalInit({ projectName, lane: laneKey, runTarget, prompt: null });
  outro(`Created ${projectName}`);
}

async function initFromArgs(argv) {
  const opts = parseInitArgs(argv);
  if (!opts.projectName) {
    console.error('\n  ✗ --name is required for non-interactive init.\n');
    process.exit(1);
  }
  await runLocalInit({ ...opts, prompt: null });
}

const command = process.argv[2];
const rest = process.argv.slice(3);

if (command === '--version' || command === '-v') {
  console.log(VERSION);
} else if (command === 'help') {
  await runHelp(rest, { version: VERSION });
} else if (command === '--help' || command === '-h') {
  printHelp();
} else if (!command) {
  if (process.stdin.isTTY && process.stdout.isTTY) {
    try { await runInteractive(); }
    catch (e) {
      if (e?.code !== 'AGENTSAM_SETUP_CANCELLED') {
        reportCliError(e);
        process.exitCode = 1;
      }
    }
  } else {
    printHelp();
  }
} else if (command === 'create') {
  try {
    const opts = parseCreateArgs(rest);
    if (opts.help || !opts.projectName) {
      console.log(`agentsam create <name> --preset <${listPresets().map((row) => row.id).join('|')}> [--target local|cloudflare|gcp]`);
    } else {
      const preset = resolvePreset(opts.preset);
      const created = await runLocalInit({ projectName: opts.projectName, lane: preset.lane, runTarget: opts.runTarget, prompt: null });
      applyPresetSelection(created.dir, preset);
      console.log(`  ✓ Preset      ${preset.id}\n  ✓ Features    ${preset.features.join(', ') || 'none'}\n  ✓ Capabilities ${preset.capabilities.length}\n`);
    }
  } catch (e) { reportCliError(e); process.exitCode = 1; }
} else if (command === 'add') {
  try { await runAdd(rest); }
  catch (e) { reportCliError(e); process.exitCode = 1; }
} else if (command === 'dev') {
  try { await runDev(rest); }
  catch (e) { reportCliError(e); process.exitCode = 1; }
} else if (command === 'inspect') {
  try { await runInspect(rest); }
  catch (e) { reportCliError(e); process.exitCode = 1; }
} else if (command === 'capabilities') {
  try { await runCapabilities(rest); }
  catch (e) { reportCliError(e); process.exitCode = 1; }
} else if (command === 'context') {
  try {
    await runContext(rest);
  } catch (e) {
    reportCliError(e);
    process.exit(1);
  }
} else if (command === 'status') {
  try {
    await runStatus(rest);
  } catch (e) {
    reportCliError(e);
    process.exit(1);
  }
} else if (command === 'db') {
  try {
    await runDb(rest);
  } catch (e) {
    reportCliError(e);
    process.exit(1);
  }
} else if (command === 'models') {
  try {
    await runModels(rest);
  } catch (e) {
    reportCliError(e);
    process.exit(1);
  }
} else if (command === 'providers') {
  try {
    await runProviders(rest);
  } catch (e) {
    reportCliError(e);
    process.exit(1);
  }
} else if (command === 'env') {
  try {
    await runEnv(rest);
  } catch (e) {
    reportCliError(e);
    process.exit(1);
  }
} else if (command === 'eval') {
  try {
    await runEval(rest);
  } catch (e) {
    reportCliError(e);
    process.exit(1);
  }
} else if (command === 'cloudflare' || command === 'cf') {
  try {
    await runCloudflare(rest);
  } catch (e) {
    if (!e?.reported) reportCliError(e);
    process.exitCode = 1;
  }
} else if (command === 'login') {
  try {
    await runLogin(rest);
  } catch (e) {
    reportCliError(e);
    process.exitCode = 1;
  }
} else if (command === 'logout') {
  try {
    runLogout(rest);
  } catch (e) {
    reportCliError(e);
    process.exitCode = 1;
  }
} else if (command === 'whoami') {
  try {
    await runWhoami(rest);
  } catch (e) {
    reportCliError(e);
    process.exitCode = 1;
  }
} else if (command === 'resume') {
  try {
    await runResume(rest);
  } catch (e) {
    reportCliError(e);
    process.exitCode = 1;
  }
} else if (command === 'shell') {
  try {
    await runShell(rest);
  } catch (e) {
    reportCliError(e);
    process.exit(1);
  }
} else if (command === 'start-local') {
  await runStartLocal({});
} else if (command === 'ollama') {
  try {
    await runOllama(rest);
  } catch (e) {
    reportCliError(e);
    process.exitCode = 1;
  }
} else if (command === 'tunnel') {
  try {
    await runTunnel(rest);
  } catch (e) {
    reportCliError(e);
    process.exit(1);
  }
} else if (command === 'connections' || command === 'connection') {
  try {
    await runConnections(rest);
  } catch (e) {
    reportCliError(e);
    process.exit(1);
  }
} else if (command === 'deploy') {
  try {
    await runDeploy(parseDeployArgs(rest));
  } catch (e) {
    reportCliError(e);
    process.exit(1);
  }
} else if (command === 'dockerize') {
  try {
    await runDockerize(rest);
  } catch (e) {
    reportCliError(e);
    process.exit(1);
  }
} else if (command === 'cad') {
  try {
    await runCad(rest);
  } catch (e) {
    reportCliError(e);
    process.exitCode = 1;
  }
} else if (command === 'security' || command === 'sca') {
  await runSecurity(rest);
} else if (command === 'skills' || command === 'skill') {
  try {
    runSkills(rest);
  } catch (e) {
    reportCliError(e);
    process.exitCode = 1;
  }
} else if (command === 'merkle') {
  await runMerkle(rest);
} else if (command === 'deploy-receipt') {
  await runDeployReceipt(rest);
} else if (command === 'recon') {
  await runRecon(rest);
} else if (command === 'mini') {
  try {
    await runMini(rest);
  } catch (e) {
    reportCliError(e);
    process.exitCode = 1;
  }
} else if (['index', 'search', 'repo'].includes(command)) {
  try {
    const commands = await import('./commands/knowledge.js');
    await ({ index: commands.runKnowledge, search: commands.runSearch, repo: commands.runRepository })[command](rest);
  } catch (e) { reportCliError(e); process.exitCode = 1; }
} else if (command === 'init') {
  try {
    const existing = !rest.includes('--name') && (rest.includes('.') || rest.includes('--existing') || rest.includes('--cwd') || fs.existsSync(path.join(repositoryRoot(), '.git')));
    if (existing) await (await import('./commands/knowledge.js')).runRepositoryInit(rest);
    else if (rest.includes('--help') || rest.includes('-h')) printHelp();
    else if (rest.some((a) => a.startsWith('--'))) await initFromArgs(rest);
    else await initInteractive({});
  } catch (e) { reportCliError(e); process.exitCode = 1; }
} else if (command === 'identity') {
  const sub = rest[0];
  if (sub === 'preview') {
    try {
      await runIdentityPreview(rest.slice(1));
    } catch (e) {
      reportCliError(e);
      process.exit(1);
    }
  } else if (sub === 'init') {
    try {
      await runIdentityInit(rest);
    } catch (e) {
      reportCliError(e);
      process.exit(1);
    }
  } else {
    console.error('\n  Usage:\n    agentsam identity preview [--open] [--port 8791]\n    agentsam identity init --name <project> [--brand "Name"]\n');
    process.exit(1);
  }
} else if (command === 'scaffold') {
  try {
    const { runScaffold } = await import('./lib/scaffold/index.js');
    await runScaffold(rest[0] ?? null);
  } catch (e) {
    reportCliError(e);
    process.exit(1);
  }
} else {
  console.error(`\n  Unknown command: ${command}\n`);
  printHelp();
  process.exit(1);
}
