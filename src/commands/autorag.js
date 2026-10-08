import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline/promises';
import { repositoryRoot, readConfig, validateConfig, defaultConfig, scopeKey, fingerprint, CONFIG_PATH } from '../knowledge/config.js';
import { openSqliteStore } from '../knowledge/stores/sqlite.js';
import { openPostgresStore } from '../knowledge/stores/postgres.js';
import { planIndex, runIndex, retrieve } from '../knowledge/engine.js';
import { inventory, readSource } from '../knowledge/source.js';
import { discoverKnowledgeRuntime } from '../knowledge/runtime-discovery.js';
import { getRepositoryId, portableRepositoryIdFromGit, tryReadProjectConfig } from '../lib/project-config.js';
import { discoverAutoRag, recommendAutoRag, safeAutoRagConfig, runAutoRagProbe, createProviderRegistry, createBackendRegistry } from '../../packages/agentsam-knowledge/src/index.js';
import { createSupabaseNodeApiClient } from '../../packages/agentsam-knowledge/src/backends/supabase-node-api.js';
import { runNodeApiRemote, sessionGatewayAuth } from './autorag-node-api.js';

const show = value => console.log(JSON.stringify(value, null, 2));
const split = value => String(value || '').split(',').map(item => item.trim()).filter(Boolean);
const localPath = root => path.join(root, '.agentsam', 'knowledge', 'index.sqlite');
const parse = argv => parseArgs({ args: argv, allowPositionals: true, options: {
  cwd: { type: 'string' }, json: { type: 'boolean' }, yes: { type: 'boolean', short: 'y' }, help: { type: 'boolean', short: 'h' },
  kind: { type: 'string' }, scope: { type: 'string' }, provider: { type: 'string' }, backend: { type: 'string' }, model: { type: 'string' }, dimensions: { type: 'string' }, semantic: { type: 'boolean' }, 'allow-paid': { type: 'boolean' }, query: { type: 'string' }, resource: { type: 'string' }, 'account-id': { type: 'string' }, 'repository-id': { type: 'string' }, corpus: { type: 'string' }, publish: { type: 'boolean' }, 'max-inputs': { type: 'string' }, 'session-auth': { type: 'boolean' }, 'trusted-origin': { type: 'string' },
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
  const adoptVectorize = declaredVectorize.length === 1 && !opts.resource && (opts.backend === 'cloudflare_vectorize' || (!opts.backend && !existing?.lane?.backend));
  const backend = opts.backend || existing?.lane?.backend || (adoptVectorize ? 'cloudflare_vectorize' : 'local_exact');
  const recommendation = recommendAutoRag({ discovery, purpose, include: opts.scope ? split(opts.scope) : existing?.scope?.include, provider: opts.provider || 'none', backend, semantic: Boolean(opts.semantic) });
  const config = safeAutoRagConfig({ existing: existing || {}, recommendation, repositoryId: existing?.repository_id || discovery.repository.identity, projectKey: existing?.project_key || discovery.repository.identity });
  if (adoptVectorize) {
    const resource = declaredVectorize[0];
    config.lane.id = `${purpose}-cloudflare-vectorize`;
    config.lane.backend = 'cloudflare_vectorize';
    config.lane.binding = resource.binding;
    config.lane.index = resource.index;
  }
  if (opts.provider) {
    const available = discovery.capabilities.providers.find(item => item.id === opts.provider);
    if (opts.provider !== 'none' && !available) throw new Error('autorag_provider_not_discovered');
    const model = String(opts.model || '').trim();
    const dimensions = Number(opts.dimensions);
    if (opts.provider !== 'none' && (!model || !available.models?.includes(model) || !Number.isInteger(dimensions) || dimensions < 1)) {
      throw new Error('autorag_explicit_provider_model_and_dimensions_required: select an advertised model and its real output dimension');
    }
    config.embedding = opts.provider === 'none' ? { provider: 'none', model: 'none', revision: '1', dimensions: 0, parameters: {} } : { provider: opts.provider, model, revision: '1', dimensions, parameters: { task: 'code retrieval' } };
  }
  if (opts.backend) config.lane.backend = opts.backend;
  if (opts.resource) config.lane.resource = opts.resource;
  return { recommendation, config };
}
/** Shared CLI and native-host workflow view: no indexing, network writes or implicit provider selection. */
export async function inspectAutoRagWorkflow({ root, discovery, existing, runtime }) {
  const effective = existing || generationConfig(root, null);
  const store = effective && runtime.local_index.exists ? await openSqliteStore(localPath(root), { readOnly: true }) : null;
  let active = null, historical = [], verification = null;
  try {
    if (store && effective) {
      active = await store.active(scopeKey(effective));
      historical = await store.historicalSummaries();
      const proofs = await store.observations('autorag-verified:' + scopeKey(effective));
      verification = active ? proofs.filter(row => row.generation_id === active.id && row.verified).at(-1) || null : null;
    }
  } finally { await store?.close(); }
  const selection = existing?.lane || null;
  const compatible = active && existing && fingerprint([active.config?.scope, active.config?.chunking]) === fingerprint([existing.scope, existing.chunking]);
  let sourceFreshness = 'unknown';
  if (active && compatible && active.receipt?.site_crawl_snapshot == null && active.receipt?.repository_crawl_snapshot == null) {
    // Same hash construction as planIndex: source content changes invalidate stored proofs.
    const now = inventory(root, existing.scope).map(file => {
      const source = readSource(root, file);
      return source ? [file, source.hash] : null;
    }).filter(Boolean);
    sourceFreshness = fingerprint(now) === active.source_hash ? 'current' : 'stale';
  }
  const detected = (runtime.lanes || []).filter(l => l.configured).map(l => ({
    backend: l.backend, binding: l.binding || null, index: l.index || null,
    locally_executable: Boolean(l.locally_executable), remotely_executable: Boolean(l.remotely_executable),
    selected: Boolean(selection && selection.backend === l.backend && (!l.binding || selection.binding === l.binding)),
  }));
  const recommendation = recommendAutoRag({ discovery, include: existing?.scope?.include, purpose: existing?.scope?.name || 'code' });
  const state = active ? (!compatible ? 'scope_changed' : sourceFreshness === 'stale' ? 'source_changed' : active.profile_id ? 'local_semantic_generation' : 'structural_generation') : historical.length ? 'historical_generation_only' : 'not_indexed';
  return {
    schema: 'agentsam.autorag.workflow.v1',
    project: { name: discovery.repository.name, repository_id: discovery.repository.identity, root, branch: discovery.repository.branch },
    status: state,
    selected: existing ? { scope: existing.scope, embedding: existing.embedding, storage: existing.storage, lane: existing.lane } : null,
    suggested: { scope: recommendation.scope, backend: 'local_exact', semantic: false, explanation: 'Non-paid local structural index; existing remote lanes are preserved until explicitly selected and verified.' },
    resources: detected,
    providers: discovery.capabilities.providers.map(p => ({ id: p.id, operational: Boolean(p.operational), models: p.models || [], credentials: p.credentials || null })),
    generation: active ? { id: active.id, files: active.files?.length || 0, chunks: active.chunks?.length || 0, embedded: Boolean(active.profile_id), current: Boolean(compatible && sourceFreshness !== 'stale'), source_freshness: sourceFreshness, created_at: active.created_at } : null,
    historical: historical.map(g => ({ ...g, selected_scope: effective ? g.scope_key === scopeKey(effective) : false })),
    verified: Boolean(verification && compatible && sourceFreshness === 'current'), verification: verification && compatible && sourceFreshness === 'current' ? { generation_id: verification.generation_id, kind: verification.kind, query: verification.query, checked_at: verification.created_at } : null,
    next: active && compatible && sourceFreshness === 'current' ? 'verify' : 'setup_or_index',
  };
}

async function executeAutoRagWorkflow({ root, existing, opts }) {
  if (!opts.yes) throw new Error('autorag_explicit_confirmation_required: review `agentsam autorag inspect`, then pass --yes');
  if (!existing) throw new Error('autorag_configuration_required: run autorag setup first');
  if (existing.lane.backend !== 'local_exact') throw new Error('autorag_selected_remote_lane_requires_authorized_host: do not silently index SQLite instead of the selected remote backend');
  if (opts.semantic && !opts['allow-paid']) throw new Error('autorag_semantic_paid_approval_required: use --allow-paid after reviewing the provider');
  const store = await storeFor(root, existing);
  try {
    const embed = Boolean(opts.semantic);
    const plan = await planIndex({ root, config: existing, store, embed });
    if (!plan.chunks.length) throw new Error('autorag_no_indexable_sources: check selected paths/exclusions');
    const embedder = embed ? adapterFor(existing) : null;
    const result = await runIndex({ root, config: existing, store, embed, embedder,
      maxInputs: Number(opts['max-inputs'] || 100), maxCharacters: 200000 });
    const evidence = plan.chunks[0];
    const query = opts.query || evidence.symbol || evidence.path;
    const retrieved = await retrieve({ store, config: existing, text: query, semantic: embed,
      embedder, topK: 3, tokenBudget: 1200, generationId: result.generation_id });
    if (!retrieved.hits?.length || !retrieved.hits.some(hit => hit.path)) throw new Error('autorag_verification_no_source_grounded_hits');
    await store.observe('autorag-verified:' + scopeKey(existing), { id: randomUUID(), generation_id: result.generation_id, verified: true, created_at: new Date().toISOString(), kind: embed ? 'semantic' : 'structural', query });
    return { schema: 'agentsam.autorag.execution.v1', ok: true, verified: true, backend: existing.lane.backend,
      kind: embed ? 'semantic' : 'structural', generation_id: result.generation_id, files: result.files,
      chunks: result.chunks, published: result.published, query, hits: retrieved.hits.slice(0, 3).map(hit => ({ path: hit.path, score: hit.score, lines: hit.lines || null })) };
  } finally { await store?.close(); }
}

async function interactiveOptions(discovery, opts, suppliedPrompt = null) {
  const prompt = suppliedPrompt || createInterface({ input: process.stdin, output: process.stdout });
  try {
    const kind = opts.kind || await prompt.question('What kind of knowledge? code, documents, schema, media, memory, mixed [code]: ') || 'code';
    const suggested = recommendAutoRag({ discovery, purpose: kind }).scope.join(',');
    const scope = opts.scope || await prompt.question(`Sources (literal paths, comma separated) [${suggested || '.'}]: `) || suggested || '.';
    const semantic = opts.semantic || (await prompt.question('Enable semantic embeddings for this setup? [no]: ')).toLowerCase() === 'yes';
    const installed = discovery.capabilities.providers.filter(item => item.operational && item.id !== 'fixture');
    if (semantic && !installed.length) throw new Error('autorag_semantic_provider_not_connected: configure a project provider first');
    const provider = opts.provider || (semantic ? await prompt.question(`Connected providers (${installed.map(item => item.id).join(', ')}): `) : 'none');
    if (semantic && !installed.some(item => item.id === provider)) throw new Error('autorag_selected_provider_not_connected');
    let model = opts.model, dimensions = opts.dimensions;
    if (semantic) {
      const options = installed.find(item => item.id === provider)?.models || [];
      if (!options.length) throw new Error('autorag_provider_has_no_discovered_models');
      model ||= await prompt.question(`Advertised model (${options.join(', ')}): `);
      dimensions ||= await prompt.question('Output dimensions (confirm from provider/index): ');
    }
    return { ...opts, kind, scope, semantic, provider, ...(model ? {model} : {}), ...(dimensions ? {dimensions} : {}) };
  } finally { if (!suppliedPrompt) prompt.close(); }
}
export async function runAutoRag(argv) {
  const { values: opts, positionals } = parse(argv); const command = positionals[0] || (opts.json || !process.stdin.isTTY ? 'inspect' : 'guide');
  if (opts.help || !['setup', 'status', 'doctor', 'lanes', 'configure', 'probe', 'providers', 'backends', 'scope', 'remote', 'guide', 'inspect', 'execute'].includes(command)) {
    console.log('agentsam autorag guide|inspect|execute|setup|status|doctor|lanes|configure|probe|providers|backends|scope|remote [--cwd PATH] [--yes] [--kind code|documents|schema|media|memory|mixed] [--scope a,b] [--provider none|fixture|gemini|openai|workers-ai|ollama] [--backend local_exact|postgres_pgvector|supabase_pgvector|cloudflare_vectorize] [--semantic] [--resource ENDPOINT] [--account-id ID] [--query TEXT] [--allow-paid] [--publish] [--max-inputs N] [--session-auth --trusted-origin URL]'); return;
  }
  const root = repositoryRoot(opts.cwd); const discovery = await discoverAutoRag({ root }); const existing = readExisting(root); const runtime = discoverKnowledgeRuntime(root, { knowledgeConfig: existing });
  if (command === 'inspect') return show(await inspectAutoRagWorkflow({ root, discovery, existing, runtime }));
  if (command === 'execute') return show(await executeAutoRagWorkflow({ root, existing, opts }));
  if (command === 'guide') {
    const view = await inspectAutoRagWorkflow({ root, discovery, existing, runtime });
    console.log(`\n  AgentSam AutoRAG · ${view.project.name}`);
    console.log(`  Repository   ${view.project.repository_id}`);
    console.log(`  Knowledge    ${view.status.replaceAll('_', ' ')}`);
    if (view.generation) console.log(`  Generation   ${view.generation.files} files / ${view.generation.chunks} chunks · ${view.generation.embedded ? 'embedded' : 'structural only'}`);
    if (view.historical.length && !view.generation) console.log(`  History      ${view.historical.length} previous generation(s); none matches selected scope`);
    for (const lane of view.resources) console.log(`  Discovered   ${lane.backend}${lane.binding ? ` (${lane.binding})` : ''} · ${lane.selected ? 'selected' : 'not selected'}`);
    console.log('\n  Suggested setup');
    console.log(`  Sources      ${view.selected?.scope.include.join(', ') || view.suggested.scope.join(', ')}`);
    console.log(`  Execution    ${view.selected?.lane.backend || 'local_exact'} · ${view.selected?.embedding.provider || 'none'} embeddings`);
    const prompt = createInterface({ input: process.stdin, output: process.stdout });
    try {
      const choice = (await prompt.question('\n  [1] Continue selected setup  [2] Edit sources/provider  [3] Inspect history  [4] Exit: ')).trim() || '1';
      if (choice === '3') return show(view.historical);
      if (choice === '4') return;
      if (!['1', '2'].includes(choice)) throw new Error('autorag_invalid_choice');
      if (choice === '2' || !existing) {
        const selected = await interactiveOptions(discovery, {}, prompt);
        const { config } = defaults(discovery, selected, existing, runtime);
        console.log(`\n  Plan: ${config.scope.include.join(', ')} · ${config.lane.backend} · ${config.embedding.provider}`);
        const approved = await prompt.question('  Save this setup? [y/N]: ');
        if (!/^y(es)?$/i.test(approved.trim())) return;
        writeConfig(root, config);
        console.log('  Setup saved.');
        if (config.lane.backend !== 'local_exact') { console.log('  Remote execution requires its authorized host. Run autorag doctor.'); return; }
      }
      const target = readExisting(root);
      if (target.lane.backend !== 'local_exact') { console.log('  Selected remote lane requires its authorized host; no fallback or silent overwrite.'); return; }
      const proceed = await prompt.question('  Index sources and verify retrieval now? [y/N]: ');
      if (!/^y(es)?$/i.test(proceed.trim())) return;
      const result = await executeAutoRagWorkflow({ root, existing: target, opts: { yes: true } });
      console.log(`  Verified ${result.files} files / ${result.chunks} chunks · ${result.generation_id}`);
      for (const hit of result.hits) console.log(`    → ${hit.path}`);
    } finally { prompt.close(); }
    return;
  }
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
      const client = createSupabaseNodeApiClient({ endpoint, ...await sessionGatewayAuth(endpoint, selected, process.env) });
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
