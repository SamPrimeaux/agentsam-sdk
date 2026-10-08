import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline/promises';
import { repositoryRoot, readConfig, validateConfig, defaultConfig, scopeKey, fingerprint, CONFIG_PATH } from '../knowledge/config.js';
import { openSqliteStore } from '../knowledge/stores/sqlite.js';
import { openPostgresStore } from '../knowledge/stores/postgres.js';
import { planIndex, runIndex, retrieve } from '../knowledge/engine.js';
import { discoverKnowledgeRuntime } from '../knowledge/runtime-discovery.js';
import { getRepositoryId, portableRepositoryIdFromGit, tryReadProjectConfig } from '../lib/project-config.js';
import { discoverAutoRag, recommendAutoRag, safeAutoRagConfig, runAutoRagProbe, createProviderRegistry, createBackendRegistry } from '../../packages/agentsam-knowledge/src/index.js';
import { createSupabaseNodeApiClient } from '../../packages/agentsam-knowledge/src/backends/supabase-node-api.js';
import { runNodeApiRemote } from './autorag-node-api.js';

const show = value => console.log(JSON.stringify(value, null, 2));
const split = value => String(value || '').split(',').map(item => item.trim()).filter(Boolean);
const localPath = root => path.join(root, '.agentsam', 'knowledge', 'index.sqlite');
const parse = argv => parseArgs({ args: argv, allowPositionals: true, options: {
  cwd: { type: 'string' }, json: { type: 'boolean' }, yes: { type: 'boolean', short: 'y' }, help: { type: 'boolean', short: 'h' },
  kind: { type: 'string' }, scope: { type: 'string' }, provider: { type: 'string' }, backend: { type: 'string' }, model: { type: 'string' }, dimensions: { type: 'string' }, semantic: { type: 'boolean' }, 'allow-paid': { type: 'boolean' }, query: { type: 'string' }, resource: { type: 'string' }, 'account-id': { type: 'string' }, 'repository-id': { type: 'string' }, corpus: { type: 'string' }, publish: { type: 'boolean' }, 'max-inputs': { type: 'string' },
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
function defaults(discovery, opts, existing, runtime) {
  const purpose = opts.kind || existing?.scope?.name || 'code';
  const declaredVectorize = (runtime?.cloudflare?.vectorize || []).filter(row => row.binding && row.index);
  const adoptVectorize = !opts.backend && !existing?.lane?.backend && declaredVectorize.length === 1;
  const backend = opts.backend || existing?.lane?.backend || (adoptVectorize ? 'cloudflare_vectorize' : 'local_exact');
  const recommendation = recommendAutoRag({ discovery, purpose, include: opts.scope ? split(opts.scope) : existing?.scope?.include || ['.'], provider: opts.provider || 'none', backend, semantic: Boolean(opts.semantic) });
  const config = safeAutoRagConfig({ existing: existing || {}, recommendation, repositoryId: existing?.repository_id || discovery.repository.identity, projectKey: existing?.project_key || discovery.repository.identity });
  if (adoptVectorize) {
    const resource = declaredVectorize[0];
    config.lane.id = `${purpose}-cloudflare-vectorize`;
    config.lane.backend = 'cloudflare_vectorize';
    config.lane.binding = resource.binding;
    config.lane.index = resource.index;
  }
  if (opts.provider) {
    const models = { fixture: 'deterministic', gemini: 'gemini-embedding-2', openai: 'text-embedding-3-small', 'workers-ai': '@cf/baai/bge-base-en-v1.5', ollama: 'nomic-embed-text' };
    config.embedding = opts.provider === 'none' ? { provider: 'none', model: 'none', revision: '1', dimensions: 0, parameters: {} } : { provider: opts.provider, model: opts.model || models[opts.provider] || '', revision: '1', dimensions: Number(opts.dimensions || (opts.provider === 'fixture' ? 3 : 768)), parameters: { task: 'code retrieval' } };
  }
  if (opts.backend) config.lane.backend = opts.backend;
  if (opts.resource) config.lane.resource = opts.resource;
  return { recommendation, config };
}
async function interactiveOptions(discovery, opts) {
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const kind = opts.kind || await prompt.question('What kind of knowledge? code, documents, schema, media, memory, mixed [code]: ') || 'code';
    const suggested = recommendAutoRag({ discovery, purpose: kind }).scope.join(',');
    const scope = opts.scope || await prompt.question(`Sources (literal paths, comma separated) [${suggested || '.'}]: `) || suggested || '.';
    const semantic = opts.semantic || (await prompt.question('Enable semantic embeddings for this setup? [no]: ')).toLowerCase() === 'yes';
    const provider = opts.provider || (semantic ? await prompt.question('Provider: fixture, gemini, openai, workers-ai, ollama [fixture]: ') || 'fixture' : 'none');
    return { ...opts, kind, scope, semantic, provider };
  } finally { prompt.close(); }
}
export async function runAutoRag(argv) {
  const { values: opts, positionals } = parse(argv); const command = positionals[0] || 'status';
  if (opts.help || !['setup', 'status', 'doctor', 'lanes', 'configure', 'probe', 'providers', 'backends', 'scope', 'remote'].includes(command)) {
    console.log('agentsam autorag setup|status|doctor|lanes|configure|probe|providers|backends|scope|remote [--cwd PATH] [--yes] [--kind code|documents|schema|media|memory|mixed] [--scope a,b] [--provider none|fixture|gemini|openai|workers-ai|ollama] [--backend local_exact|postgres_pgvector|supabase_pgvector|cloudflare_vectorize] [--semantic] [--resource ENDPOINT] [--account-id ID] [--query TEXT] [--allow-paid] [--publish] [--max-inputs N]'); return;
  }
  const root = repositoryRoot(opts.cwd); const discovery = await discoverAutoRag({ root }); const existing = readExisting(root); const runtime = discoverKnowledgeRuntime(root, { knowledgeConfig: existing });
  if (command === 'providers') {
    const providers = await createProviderRegistry().capabilities();
    const workersAi = runtime.resources.workers_ai;
    return show(providers.map(item => item.id === 'workers-ai'
      ? { ...item, runtime_configured: workersAi.configured, runtime_binding: workersAi.binding, locally_executable: workersAi.locally_executable, remotely_executable: workersAi.remotely_executable, credential_state: workersAi.credential_state }
      : item));
  }
  if (command === 'backends') {
    const backends = createBackendRegistry().capabilities();
    const vectorize = runtime.resources.vectorize;
    return show(backends.map(item => item.id === 'cloudflare_vectorize'
      ? { ...item, declared_resources: vectorize, locally_executable: vectorize.some(row => row.locally_executable), remotely_executable: vectorize.some(row => row.remotely_executable), conflicts: runtime.conflicts }
      : item));
  }
  if (command === 'status') {
    const generationProfile = runtime.local_index.exists ? generationConfig(root, existing) : null;
    const generation = generationProfile ? await (async () => {
      const store = await storeFor(root, generationProfile, true);
      try { return await store?.active(scopeKey(generationProfile)); }
      finally { await store?.close(); }
    })() : null;
    const generation_current = generation && existing ? fingerprint([generation.config?.scope, generation.config?.chunking]) === fingerprint([existing.scope, existing.chunking]) : false;
    return show({ discovery, config: existing || null, project_context: runtime, runtime, generation, generation_current, needs_reindex: Boolean(generation && !generation_current) });
  }
  if (command === 'doctor') {
    const hasRuntimeLane = runtime.lanes.some(lane => lane.configured);
    const checks = [
      { check: 'knowledge_authority', ok: Boolean(existing) || hasRuntimeLane, detail: existing ? CONFIG_PATH : hasRuntimeLane ? 'Detected repository knowledge runtime.' : 'No local config or declared runtime lane found.' },
      { check: 'local_sqlite', ok: runtime.local_index.exists, blocking: false, detail: runtime.local_index.exists ? runtime.local_index.path : 'Not indexed yet; run agentsam index run or agentsam autorag probe.' },
      { check: 'git_merkle', ok: discovery.repository.merkle, blocking: false, detail: discovery.repository.merkle ? '.agentsam/merkle.json' : 'No Merkle snapshot yet; run agentsam merkle root . --json when snapshot evidence is needed.' },
    ];
    if (existing && runtime.local_index.exists) {
      const store = await storeFor(root, existing, true);
      let generation;
      try { generation = await store?.active(scopeKey(existing)); }
      finally { await store?.close(); }
      const current = Boolean(generation && fingerprint([generation.config?.scope, generation.config?.chunking]) === fingerprint([existing.scope, existing.chunking]));
      checks.push({ check: 'active_generation_current', ok: current, detail: current ? generation.id : 'No matching current generation. Run index plan and index run.' });
    }
    if (existing?.lane?.backend === 'supabase_pgvector') {
      try {
        const probe = await runNodeApiRemote({ opts: { resource: existing.lane.resource }, config: existing, root, openStore: storeFor });
        checks.push({ check: 'supabase_edge_capabilities', ok: probe.accessible && probe.configured, detail: probe });
        checks.push({ check: 'supabase_edge_authorization', ok: probe.connected, detail: probe.connected ? 'Protected endpoint confirmed' : 'Authorized host connection unavailable.' });
        checks.push({ check: 'supabase_edge_generation', ok: probe.indexed_generation_verified, detail: 'No verified active remote generation receipt for the current source scope.' });
      } catch (error) { checks.push({ check: 'supabase_edge_connected', ok: false, detail: error.message }); }
    }
    if (existing?.embedding && existing.embedding.provider !== 'none' && existing.lane?.backend !== 'supabase_pgvector') {
      try { adapterFor(existing).validate(existing.embedding); checks.push({ check: 'provider:' + existing.embedding.provider, ok: true }); }
      catch (error) { checks.push({ check: 'provider:' + existing.embedding.provider, ok: false, detail: error.message }); }
    }
    if (runtime.resources.vectorize.length) checks.push({ check: 'cloudflare_vectorize', ok: runtime.conflicts.length === 0 && runtime.resources.vectorize.every(row => row.configured && (row.locally_executable || row.remotely_executable)), detail: runtime.resources.vectorize });
    if (runtime.resources.workers_ai.observed) checks.push({ check: 'workers_ai_runtime', ok: runtime.resources.workers_ai.remotely_executable || runtime.resources.workers_ai.locally_executable, detail: runtime.resources.workers_ai });
    if (runtime.conflicts.length) checks.push({ check: 'project_context_conflicts', ok: false, detail: runtime.conflicts });
    return show({ ok: checks.filter(check => check.blocking !== false).every(check => check.ok), checks, project_context: runtime, runtime });
  }
  if (command === 'lanes') {
    const configured = existing ? [existing.lane || { id: 'legacy-local', backend: existing.storage.driver === 'sqlite' ? 'local_exact' : 'postgres_pgvector', source: CONFIG_PATH }] : [];
    const laneKey = lane => [lane.backend, lane.binding || '', lane.index || ''].join(':');
    const seen = new Set(configured.map(laneKey));
    return show([...configured, ...runtime.lanes.filter(lane => !seen.has(laneKey(lane)))]);
  }
  if (command === 'setup' || command === 'configure' || command === 'scope') {
    const selected = opts.yes ? { ...opts } : await interactiveOptions(discovery, opts);
    if ((selected.backend || existing?.lane?.backend) === 'supabase_pgvector') {
      const endpoint = selected.resource || existing?.lane?.resource || process.env.AGENTSAM_NODE_API_URL || (process.env.SUPABASE_PROJECT_REF ? `https://${process.env.SUPABASE_PROJECT_REF}.supabase.co/functions/v1/node-api` : '');
      const client = createSupabaseNodeApiClient({ endpoint });
      const remote = (await client.capabilities()).embedding;
      if (!remote?.default_model || !Number.isInteger(remote.default_dimensions)) throw new Error('node_api_remote_embedding_capability_missing');
      if (selected.provider && !['gemini', 'none'].includes(selected.provider)) throw new Error('node_api_embedding_provider_mismatch');
      if (selected.model && selected.model !== remote.default_model) throw new Error('node_api_embedding_model_mismatch');
      if (selected.dimensions && Number(selected.dimensions) !== remote.default_dimensions) throw new Error('node_api_embedding_dimensions_mismatch');
      selected.resource = client.endpoint; selected.provider = 'gemini'; selected.model = remote.default_model; selected.dimensions = String(remote.default_dimensions);
    }
    const { recommendation, config } = defaults(discovery, selected, existing, runtime);
    writeConfig(root, config); return show({ action: command, config: CONFIG_PATH, recommendation, config, next: config.lane.backend === 'supabase_pgvector' ? ['agentsam index plan', 'agentsam index run', 'agentsam autorag remote', 'agentsam autorag remote --publish --allow-paid --account-id <authorized-account>'] : ['agentsam autorag probe', 'agentsam index plan', 'agentsam index run', 'agentsam search "symbol or phrase"'] });
  }
  if (command === 'remote') return show(await runNodeApiRemote({ opts, config: existing, root, openStore: storeFor }));
  if (!existing) throw new Error('AutoRAG is not configured. Run agentsam autorag setup first.');
  if (existing.lane?.backend === 'supabase_pgvector') throw new Error('node_api_remote_requires_remote_command: use autorag remote after index run. Local probe does not prove a remote backend.');
  const semantic = Boolean(opts.semantic); if (semantic && !opts['allow-paid'] && !['fixture', 'ollama'].includes(existing.embedding.provider)) throw new Error('Paid embedding probes are disabled. Use --allow-paid only after reviewing the provider/profile.');
  const store = await storeFor(root, existing, false);
  try { return show(await runAutoRagProbe({ root, config: existing, store, semantic, embedder: semantic ? adapterFor(existing) : null, query: opts.query || 'repository overview', engine: { planIndex, runIndex, retrieve } })); }
  finally { await store.close(); }
}
