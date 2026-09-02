import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { CONFIG_PATH, repositoryRoot, initRepository, readConfig, scopeKey, cacheNamespace } from '../knowledge/config.js';
import { openSqliteStore } from '../knowledge/stores/sqlite.js';
import { openPostgresStore } from '../knowledge/stores/postgres.js';
import { planIndex, runIndex, retrieve } from '../knowledge/engine.js';
import { createGeminiEmbedder } from '../knowledge/providers/gemini.js';
import { compareObservations } from '../knowledge/evolution.js';

const execute = promisify(execFile);
const split = text => text.split(',').map(s => s.trim()).filter(Boolean);
const flags = (argv, extra = {}) => parseArgs({ args: argv, allowPositionals: true, options: { cwd: { type: 'string' }, json: { type: 'boolean' }, help: { type: 'boolean', short: 'h' }, ...extra } });
const show = value => console.log(JSON.stringify(value, null, 2));
const localPath = root => path.join(root, '.agentsam', 'knowledge', 'index.sqlite');
async function openStore(root, config, readOnly = false) {
  return config.storage.driver === 'sqlite' ? openSqliteStore(localPath(root), { readOnly }) : openPostgresStore(process.env[config.storage.connection_env]);
}
function provider() { return createGeminiEmbedder({ apiKey: process.env.GEMINI_API_KEY }); }

export async function runRepositoryInit(argv) {
  const { values: opts, positionals } = flags(argv, { existing: { type: 'boolean' }, yes: { type: 'boolean', short: 'y' }, include: { type: 'string' }, exclude: { type: 'string' }, scope: { type: 'string' }, workspace: { type: 'string' }, target: { type: 'string' }, dimensions: { type: 'string' } });
  if (opts.help) { console.log('agentsam init [.] [--cwd PATH] [--yes] [--include src,docs] [--exclude src/generated] [--scope NAME] [--target local|production] [--workspace ID] [--dimensions 768]'); return; }
  if (positionals.length > 1 || (positionals[0] && positionals[0] !== '.')) throw new Error('Use init . --cwd PATH to adopt an existing repository, or init --name NAME to scaffold.');
  const root = repositoryRoot(opts.cwd);
  if (fs.existsSync(path.join(root, CONFIG_PATH))) throw new Error(`${CONFIG_PATH} already exists; edit it to change scope/profile. Existing configuration was preserved.`);
  let include = opts.include, exclude = opts.exclude, target = opts.target, workspace = opts.workspace, dimensions = opts.dimensions;
  if (!opts.yes) {
    if (!process.stdin.isTTY) throw new Error('Existing-repository setup needs a terminal or --yes with explicit options.');
    const prompt = createInterface({ input: process.stdin, output: process.stdout });
    try {
      console.log(`Agent Sam knowledge setup\nRepository: ${root}\nAST/text indexing is local and costs no embedding tokens. Embeddings require a later --embed run.`);
      include ??= await prompt.question('1) Include files/directories, comma-separated [.]: ') || '.';
      exclude ??= await prompt.question('2) Exclude files/directories [none]: ') || '';
      target ??= await prompt.question('3) Storage: local or production [local]: ') || 'local';
      if (target === 'production') workspace ??= await prompt.question('4) Workspace identifier: ');
      dimensions ??= await prompt.question('5) Gemini Embedding 2 dimensions [768]: ') || '768';
    } finally { prompt.close(); }
  }
  const config = initRepository(root, { include: split(include || '.'), exclude: split(exclude || ''), scope: opts.scope || 'default', target: target || 'local', workspace: workspace || 'local', dimensions: Number(dimensions || 768) });
  show({ root, config: CONFIG_PATH, storage: config.storage.driver, next: config.storage.driver === 'postgres' ? ['agentsam index setup-store', 'agentsam index plan', 'agentsam index run'] : ['agentsam index plan', 'agentsam index run', 'agentsam search "your symbol"'], note: 'No indexing, credentials, network calls, or source-file changes during setup.' });
}

export async function runKnowledge(argv) {
  const { values: opts, positionals } = flags(argv, { embed: { type: 'boolean' }, 'max-inputs': { type: 'string' }, 'max-characters': { type: 'string' }, generation: { type: 'string' } });
  const command = positionals[0] || 'plan';
  if (opts.help) { console.log('agentsam index plan|run|status|history|show|setup-store [--cwd PATH] [--embed] [--max-inputs 100] [--max-characters 200000] [--generation ID] [--json]\nplan is read-only; run defaults to AST/text only; --embed sends selected chunks to the configured provider.'); return; }
  if (positionals.length > 1 || !['plan', 'run', 'status', 'history', 'show', 'setup-store'].includes(command)) throw new Error('Unknown index command; use agentsam index --help.');
  const root = repositoryRoot(opts.cwd), config = readConfig(root);
  const store = await openStore(root, config, !['run', 'setup-store'].includes(command));
  try {
    if (command === 'setup-store') {
      if (!store?.setup) throw new Error('SQLite initializes on index run; setup-store is for the configured Postgres database.');
      await store.setup(); show({ ready: true, driver: config.storage.driver });
    } else if (command === 'plan') show((await planIndex({ root, config, store, embed: opts.embed })).receipt);
    else if (command === 'run') {
      // Lazy adapter creation means a fully cached --embed run needs no API key.
      let adapter;
      const embedder = { embed: (...args) => (adapter ??= provider()).embed(...args) };
      show(await runIndex({ root, config, store, embed: opts.embed, embedder, maxInputs: Number(opts['max-inputs'] ?? 100), maxCharacters: Number(opts['max-characters'] ?? 200000) }));
    } else if (command === 'history') show((await store?.history(scopeKey(config)) || []).map(g => ({ id: g.id, created_at: g.created_at, git: g.git, ...g.receipt })));
    else {
      const generation = opts.generation ? await store?.getGeneration(scopeKey(config), opts.generation) : await store?.active(scopeKey(config));
      if (command === 'show') show(generation || null);
      else show(generation ? { id: generation.id, created_at: generation.created_at, git: generation.git, ...generation.receipt } : { indexed: false });
    }
  } finally { await store?.close(); }
}

export async function runSearch(argv) {
  const { values: opts, positionals } = flags(argv, { semantic: { type: 'boolean' }, 'top-k': { type: 'string' }, 'token-budget': { type: 'string' }, generation: { type: 'string' } });
  if (opts.help) { console.log('agentsam search "query" [--cwd PATH] [--semantic] [--top-k 8] [--token-budget 8000] [--generation ID]'); return; }
  const root = repositoryRoot(opts.cwd), config = readConfig(root), store = await openStore(root, config, true);
  try { show(await retrieve({ store, config, text: positionals.join(' '), semantic: opts.semantic, embedder: opts.semantic ? provider() : null, topK: Number(opts['top-k'] || 8), tokenBudget: Number(opts['token-budget'] || 8000), generationId: opts.generation })); }
  finally { await store?.close(); }
}

export async function runRepository(argv) {
  const { values: opts, positionals } = flags(argv, { save: { type: 'boolean' }, 'churn-days': { type: 'string' } });
  const command = positionals[0] || 'snapshot';
  if (opts.help) { console.log('agentsam repo snapshot [--cwd PATH] [--churn-days 30] [--save] [--json]\nagentsam repo history|compare [--cwd PATH]\nUses the bundled Python repository intelligence; --save retains observations for comparisons.'); return; }
  if (positionals.length > 1 || !['snapshot', 'history', 'compare'].includes(command)) throw new Error('Use agentsam repo snapshot|history|compare.');
  const root = repositoryRoot(opts.cwd);
  let store;
  try {
    if (command !== 'snapshot' || opts.save) store = await openStore(root, readConfig(root), command !== 'snapshot');
    if (command !== 'snapshot') {
      const observations = await store?.observations(cacheNamespace(readConfig(root))) || [];
      show(command === 'history' ? observations : compareObservations(observations.at(-2), observations.at(-1))); return;
    }
    const days = Number(opts['churn-days'] || 30);
    if (!Number.isInteger(days) || days < 1 || days > 3650) throw new Error('churn-days must be 1..3650.');
    const pythonRoot = fileURLToPath(new URL('../../python', import.meta.url));
    const result = await execute(process.platform === 'win32' ? 'python' : 'python3', ['-B', '-m', 'agentsam_sdk.repository.intelligence', '--repo-root', root, '--churn-days', String(days), '--json'], {
      env: { ...process.env, PYTHONPATH: [pythonRoot, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter) }, maxBuffer: 64 * 1024 * 1024,
    });
    const observation = { id: randomUUID(), created_at: new Date().toISOString(), kind: 'repository-intelligence', data: JSON.parse(result.stdout) };
    if (store) await store.observe(cacheNamespace(readConfig(root)), observation);
    show(observation);
  } finally { await store?.close(); }
}
