import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createProviderRegistry } from '../providers/index.js';
import { createBackendRegistry } from '../backends/index.js';

const clean = value => String(value || '').trim();
const unique = values => [...new Set(values.filter(Boolean))];
function git(root, args) { try { return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null; } catch { return null; } }
function findScopes(root) {
  const candidates = ['packages', 'src', 'services', 'apps', 'docs', 'README.md', 'schema', 'migrations'];
  return candidates.filter(candidate => fs.existsSync(path.join(root, candidate)));
}
export async function discoverAutoRag({ root = process.cwd(), env = process.env, companyAdapter = null, fetchImpl } = {}) {
  const isGit = Boolean(git(root, ['rev-parse', '--is-inside-work-tree']));
  const providerRegistry = createProviderRegistry({ gemini: { apiKey: env.GEMINI_API_KEY, fetchImpl }, openai: { apiKey: env.OPENAI_API_KEY, fetchImpl }, ollama: { endpoint: env.OLLAMA_HOST || 'http://127.0.0.1:11434', fetchImpl } });
  const providers = await providerRegistry.capabilities();
  const docker = git(root, ['--version']) && (() => { try { return Boolean(execFileSync('docker', ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })); } catch { return false; } })();
  const repositoryId = git(root, ['config', '--get', 'remote.origin.url']) || `local:${path.basename(root)}`;
  return Object.freeze({
    repository: { root, name: path.basename(root), identity: repositoryId, branch: git(root, ['branch', '--show-current']), revision: git(root, ['rev-parse', 'HEAD']), git: isGit, merkle: fs.existsSync(path.join(root, '.agentsam', 'merkle.json')), semantic_merkle: fs.existsSync(path.join(root, '.agentsam', 'merkle.json')) },
    scopes: findScopes(root),
    capabilities: { sqlite: true, git: isGit, merkle: isGit, structural_indexing: true, local_knowledge_engine: true, repository_intelligence: fs.existsSync(path.join(root, 'packages', 'agentsam-repository')), docker, providers, backends: createBackendRegistry().capabilities(), company_graph: Boolean(companyAdapter?.discover) ? await companyAdapter.discover() : { available: false } },
  });
}
export function recommendAutoRag({ discovery, purpose = 'code', include, provider = 'none', backend = 'local_exact', semantic = false } = {}) {
  const scopes = include?.length ? unique(include) : purpose === 'code' ? discovery.scopes.filter(scope => ['packages', 'src'].includes(scope)).slice(0, 2) : discovery.scopes.filter(scope => /^(docs|README\.md|schema|migrations)$/.test(scope)).slice(0, 3);
  return Object.freeze({ purpose, repositories: [discovery.repository.identity], scope: scopes.length ? scopes : ['.'], evidence: purpose === 'code' ? ['git', 'merkle', 'semantic-metadata', 'ast', 'lexical'] : ['git', 'merkle', 'lexical'], embedding: semantic ? provider : 'none', control_plane: 'local_sqlite', backend, probe: { max_files: 25, max_chunks: 100, max_semantic_queries: 1, paid_embeddings: false }, company_registration: 'disabled' });
}
export function safeAutoRagConfig({ existing = {}, recommendation, repositoryId, projectKey } = {}) {
  const config = structuredClone(existing);
  config.version = Math.max(Number(config.version || 1), 2);
  config.repository_id = config.repository_id || repositoryId;
  config.project_key = config.project_key || projectKey || config.repository_id;
  config.scope = { name: config.scope?.name || recommendation.purpose, include: recommendation.scope, exclude: config.scope?.exclude || [] };
  config.chunking = config.chunking || { max_chars: 4000 };
  config.embedding = recommendation.embedding === 'none' ? { provider: 'none', model: 'none', revision: '1', dimensions: 0, parameters: {} } : (config.embedding || { provider: recommendation.embedding, model: recommendation.embedding === 'ollama' ? 'nomic-embed-text' : recommendation.embedding === 'openai' ? 'text-embedding-3-small' : 'gemini-embedding-2', revision: '1', dimensions: 768, parameters: { task: 'code retrieval' } });
  config.storage = config.storage || { driver: 'sqlite' };
  config.lane = { id: config.lane?.id || `${recommendation.purpose}-local`, backend: recommendation.backend, resource: config.lane?.resource || null, binding: config.lane?.binding || null, index: config.lane?.index || null, metric: config.lane?.metric || 'cosine' };
  return config;
}
export async function runAutoRagProbe({ root, config, engine, store, embedder = null, semantic = false, maxFiles = 25, maxChunks = 100, query = 'repository overview' } = {}) {
  if (!engine?.planIndex || !engine?.runIndex || !engine?.retrieve) throw new TypeError('autorag_probe_engine_required');
  if (semantic && !embedder) throw new Error('autorag_probe_semantic_adapter_required');
  // Probes are isolated to a dedicated generation scope. A failed or successful
  // probe therefore cannot replace a healthy normal indexing generation.
  const probeConfig = structuredClone(config);
  probeConfig.scope.name = `${config.scope.name}--probe`;
  const plan = await engine.planIndex({ root, config: probeConfig, store, embed: semantic, limits: { maxFiles, maxChunks } });
  if (plan.receipt.files > maxFiles || plan.receipt.chunks > maxChunks) throw new Error('autorag_probe_limits_not_enforced');
  const result = await engine.runIndex({ root, config: probeConfig, store, embed: semantic, embedder, maxInputs: semantic ? maxChunks : 0, maxCharacters: 200000, limits: { maxFiles, maxChunks }, probe: true });
  const contextPack = await engine.retrieve({ store, config: probeConfig, text: query, semantic, embedder, topK: 3, tokenBudget: 1200, generationId: result.generation_id });
  return Object.freeze({ type: 'agentsam_autorag_probe_receipt', stages: ['discovery', 'source_read', 'chunk', 'structural_index', ...(semantic ? ['embed', 'vector_upsert'] : []), 'verify', 'query'], repository: config.repository_id, scope: config.scope, provider: config.embedding.provider, model: config.embedding.model, dimensions: config.embedding.dimensions, backend: config.lane?.backend || 'local_exact', files: result.files, chunks: result.chunks, generation: result.generation_id, git: result.git, merkle_root: result.merkle_root || null, published: result.published, query_result: contextPack.hits.slice(0, 1), paid_embeddings: false });
}
export function selectIntentRoute(routes, { repositoryId, accountId, intent } = {}) {
  const matches = (routes || []).filter(route => route?.is_active !== false && route.intent_key === intent);
  return matches.find(route => clean(route.repository_id) === clean(repositoryId) && clean(repositoryId)) || matches.find(route => clean(route.account_id) === clean(accountId) && !clean(route.repository_id)) || matches.find(route => !clean(route.account_id) && !clean(route.repository_id)) || null;
}
export async function routeCompanyQuestion({ question, companyAdapter, accountId, repositoryId, intent = 'code_question', limits = { repositories: 5, lanes: 3 } } = {}) {
  if (!companyAdapter?.candidateRepositories) return { mode: 'local', repositories: repositoryId ? [repositoryId] : [], reason: 'company_graph_unavailable' };
  const route = await companyAdapter.route?.({ accountId, repositoryId, intent }) || null;
  const repositories = (await companyAdapter.candidateRepositories({ question, accountId, repositoryId, intent, route })).slice(0, limits.repositories);
  return { mode: 'company_graph', intent, route, repositories, lane_limit: limits.lanes };
}
