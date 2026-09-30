import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline/promises';
import { repositoryRoot, readConfig, validateConfig, defaultConfig, scopeKey, CONFIG_PATH } from '../knowledge/config.js';
import { openSqliteStore } from '../knowledge/stores/sqlite.js';
import { openPostgresStore } from '../knowledge/stores/postgres.js';
import { planIndex, runIndex, retrieve } from '../knowledge/engine.js';
import { discoverKnowledgeRuntime } from '../knowledge/runtime-discovery.js';
import { getRepositoryId, portableRepositoryIdFromGit, tryReadProjectConfig } from '../lib/project-config.js';
import { discoverAutoRag, recommendAutoRag, safeAutoRagConfig, runAutoRagProbe, createProviderRegistry, createBackendRegistry } from '../../packages/agentsam-knowledge/src/index.js';

const show = value => console.log(JSON.stringify(value, null, 2));
const split = value => String(value || '').split(',').map(item => item.trim()).filter(Boolean);
const localPath = root => path.join(root, '.agentsam', 'knowledge', 'index.sqlite');
const parse = argv => parseArgs({ args: argv, allowPositionals: true, options: {
  cwd: { type: 'string' }, json: { type: 'boolean' }, yes: { type: 'boolean', short: 'y' }, help: { type: 'boolean', short: 'h' },
  kind: { type: 'string' }, scope: { type: 'string' }, provider: { type: 'string' }, backend: { type: 'string' }, model: { type: 'string' }, dimensions: { type: 'string' }, semantic: { type: 'boolean' }, 'allow-paid': { type: 'boolean' }, query: { type: 'string' },
} });
function readExisting(root) { try { return readConfig(root); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } }
function generationConfig(root, existing) {
  if (existing) return existing;
  const project = tryReadProjectConfig(root);
  const repositoryId = getRepositoryId(project) || portableRepositoryIdFromGit(root);
  return repositoryId ? defaultConfig({ repositoryId }) : null;
}
function writeConfig(root, config) {
  const filename = path.join(root, CONFIG_PATH); fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  const safe = JSON.stringify(validateConfig(config), null, 2) + '\n';
  if (/api[_-]?key|secret|token|password/i.test(safe)) throw new Error('autorag_config_must_not_contain_credentials');
  fs.writeFileSync(filename, safe, { mode: 0o600 });
}
function adapterFor(config) {
  if (config.embedding.provider === 'none') return null;
  const adapter = createProviderRegistry().get(config.embedding.provider);
  return { validate: profile => adapter.validate(profile), async embed(text, profile, context) { return context?.kind === 'query' ? adapter.embedQuery(text, profile, context) : (await adapter.embedDocuments([text], profile, context))[0]; } };
}
async function storeFor(root, config, readOnly = false) { return config.storage.driver === 'sqlite' ? openSqliteStore(localPath(root), { readOnly }) : openPostgresStore(process.env[config.storage.connection_env]); }
function defaults(discovery, opts, existing) {
  const purpose = opts.kind || existing?.scope?.name || 'code';
  const recommendation = recommendAutoRag({ discovery, purpose, include: opts.scope ? split(opts.scope) : existing?.scope?.include, provider: opts.provider || 'none', backend: opts.backend || existing?.lane?.backend || 'local_exact', semantic: Boolean(opts.semantic) });
  const config = safeAutoRagConfig({ existing: existing || {}, recommendation, repositoryId: existing?.repository_id || discovery.repository.identity, projectKey: existing?.project_key || discovery.repository.identity });
  if (opts.provider) {
    const models = { fixture: 'deterministic', gemini: 'gemini-embedding-2', openai: 'text-embedding-3-small', 'workers-ai': '@cf/baai/bge-base-en-v1.5', ollama: 'nomic-embed-text' };
    config.embedding = opts.provider === 'none' ? { provider: 'none', model: 'none', revision: '1', dimensions: 0, parameters: {} } : { provider: opts.provider, model: opts.model || models[opts.provider] || '', revision: '1', dimensions: Number(opts.dimensions || (opts.provider === 'fixture' ? 3 : 768)), parameters: { task: 'code retrieval' } };
  }
  if (opts.backend) config.lane.backend = opts.backend;
  return { recommendation, config };
}
async function interactiveOptions(discovery, opts) {
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const kind = opts.kind || await prompt.question('What kind of knowledge? code, documents, schema, media, memory, mixed [code]: ') || 'code';
    const suggested = kind === 'code' ? discovery.scopes.filter(scope => ['packages', 'src'].includes(scope)).join(',') : discovery.scopes.filter(scope => /docs|README|schema|migrations/.test(scope)).join(',');
    const scope = opts.scope || await prompt.question(`Sources (literal paths, comma separated) [${suggested || '.'}]: `) || suggested || '.';
    const semantic = opts.semantic || (await prompt.question('Enable semantic embeddings for this setup? [no]: ')).toLowerCase() === 'yes';
    const provider = opts.provider || (semantic ? await prompt.question('Provider: fixture, gemini, openai, workers-ai, ollama [fixture]: ') || 'fixture' : 'none');
    return { ...opts, kind, scope, semantic, provider };
  } finally { prompt.close(); }
}
export async function runAutoRag(argv) {
  const { values: opts, positionals } = parse(argv); const command = positionals[0] || 'status';
  if (opts.help || !['setup', 'status', 'doctor', 'lanes', 'configure', 'probe', 'providers', 'backends', 'scope'].includes(command)) {
    console.log('agentsam autorag setup|status|doctor|lanes|configure|probe|providers|backends|scope [--cwd PATH] [--yes] [--kind code|documents|schema|media|memory|mixed] [--scope a,b] [--provider none|fixture|gemini|openai|workers-ai|ollama] [--backend local_exact|postgres_pgvector|supabase_pgvector|cloudflare_vectorize] [--semantic]'); return;
  }
  const root = repositoryRoot(opts.cwd); const discovery = await discoverAutoRag({ root }); const existing = readExisting(root); const runtime = discoverKnowledgeRuntime(root);
  if (command === 'providers') {
    const providers = await createProviderRegistry().capabilities();
    return show(providers.map(item => item.id === 'workers-ai'
      ? { ...item, runtime_configured: Boolean(runtime.cloudflare.ai_binding), runtime_binding: runtime.cloudflare.ai_binding }
      : item));
  }
  if (command === 'backends') {
    const backends = createBackendRegistry().capabilities();
    return show(backends.map(item => item.id === 'cloudflare_vectorize'
      ? { ...item, declared_resources: runtime.cloudflare.vectorize }
      : item));
  }
  if (command === 'status') {
    const generationProfile = runtime.local_index.exists ? generationConfig(root, existing) : null;
    const generation = generationProfile ? await (async () => {
      const store = await storeFor(root, generationProfile, true);
      try { return await store?.active(scopeKey(generationProfile)); }
      finally { await store?.close(); }
    })() : null;
    return show({ discovery, config: existing || null, runtime, generation });
  }
  if (command === 'doctor') {
    const hasRuntimeLane = runtime.lanes.some(lane => lane.configured);
    const checks = [
      { check: 'knowledge_authority', ok: Boolean(existing) || hasRuntimeLane, detail: existing ? CONFIG_PATH : hasRuntimeLane ? 'Detected repository knowledge runtime.' : 'No local config or declared runtime lane found.' },
      { check: 'local_sqlite', ok: runtime.local_index.exists, detail: runtime.local_index.exists ? runtime.local_index.path : 'No local knowledge index.' },
      { check: 'git_merkle', ok: discovery.repository.merkle, detail: discovery.repository.merkle ? '.agentsam/merkle.json' : 'Run agentsam merkle root . --json.' },
    ];
    if (existing?.embedding && existing.embedding.provider !== 'none') {
      try { adapterFor(existing).validate(existing.embedding); checks.push({ check: 'provider:' + existing.embedding.provider, ok: true }); }
      catch (error) { checks.push({ check: 'provider:' + existing.embedding.provider, ok: false, detail: error.message }); }
    }
    if (runtime.cloudflare.vectorize.length) checks.push({ check: 'cloudflare_vectorize', ok: runtime.cloudflare.vectorize.every(row => row.binding && row.index), detail: runtime.cloudflare.vectorize });
    if (runtime.cloudflare.ai_binding) checks.push({ check: 'workers_ai_runtime', ok: true, detail: runtime.cloudflare.ai_binding });
    return show({ ok: checks.every(check => check.ok), checks, runtime });
  }
  if (command === 'lanes') {
    const configured = existing ? [existing.lane || { id: 'legacy-local', backend: existing.storage.driver === 'sqlite' ? 'local_exact' : 'postgres_pgvector', source: CONFIG_PATH }] : [];
    const laneKey = lane => [lane.backend, lane.binding || '', lane.index || ''].join(':');
    const seen = new Set(configured.map(laneKey));
    return show([...configured, ...runtime.lanes.filter(lane => !seen.has(laneKey(lane)))]);
  }
  if (command === 'setup' || command === 'configure' || command === 'scope') {
    const selected = opts.yes ? opts : await interactiveOptions(discovery, opts); const { recommendation, config } = defaults(discovery, selected, existing);
    writeConfig(root, config); return show({ action: command, config: CONFIG_PATH, recommendation, config, next: ['agentsam autorag probe', 'agentsam index plan', 'agentsam index run', 'agentsam search "symbol or phrase"'] });
  }
  if (!existing) throw new Error('AutoRAG is not configured. Run agentsam autorag setup first.');
  const semantic = Boolean(opts.semantic); if (semantic && !opts['allow-paid'] && !['fixture', 'ollama'].includes(existing.embedding.provider)) throw new Error('Paid embedding probes are disabled. Use --allow-paid only after reviewing the provider/profile.');
  const store = await storeFor(root, existing, false);
  try { return show(await runAutoRagProbe({ root, config: existing, store, semantic, embedder: semantic ? adapterFor(existing) : null, query: opts.query || 'repository overview', engine: { planIndex, runIndex, retrieve } })); }
  finally { await store.close(); }
}
