import { createBackendRegistry } from '../../packages/agentsam-knowledge/src/backends/index.js';
import { fingerprint, scopeKey } from '../knowledge/config.js';

function endpointFor(opts, config, env) {
  return opts.resource || config?.lane?.resource || env.AGENTSAM_NODE_API_URL || (env.SUPABASE_PROJECT_REF ? `https://${env.SUPABASE_PROJECT_REF}.supabase.co/functions/v1/node-api` : '');
}

/** No private bridge key belongs in .agentsam/knowledge.json or a browser bundle. */
export async function runNodeApiRemote({ opts = {}, config, root, openStore, env = process.env, fetchImpl } = {}) {
  const endpoint = endpointFor(opts, config, env);
  const backend = createBackendRegistry().get('supabase_pgvector');
  const client = backend.connect({ endpoint, bridgeKey: env.AGENTSAM_BRIDGE_KEY, principal: opts['account-id'], fetchImpl });
  const [health, capabilities] = await Promise.all([client.health(), client.capabilities()]);
  const remoteEmbedding = capabilities.embedding;
  if (!health.ok || !remoteEmbedding?.default_model || !Number.isInteger(remoteEmbedding?.default_dimensions)) throw new Error('node_api_remote_capabilities_unavailable');
  const configured = Boolean(config && config.lane?.backend === 'supabase_pgvector' && config.embedding?.model === remoteEmbedding.default_model && config.embedding?.dimensions === remoteEmbedding.default_dimensions);
  const summary = {
    endpoint: client.endpoint, backend: 'supabase_pgvector', edge_version: health.version,
    embedding: { model: remoteEmbedding.default_model, dimensions: remoteEmbedding.default_dimensions },
    accessible: true, configured, authorization: env.AGENTSAM_BRIDGE_KEY ? 'server_bridge_key' : 'authorized_host_required',
  };
  if (!opts.query && !opts.publish) {
    let connected = false;
    if (env.AGENTSAM_BRIDGE_KEY) {
      try { await client.status('codebase'); connected = true; } catch { connected = false; }
    }
    return { ...summary, connected, ready: false, indexed_generation_verified: false,
      note: 'Endpoint and authorization checks cannot establish corpus generation readiness. A scoped query after verified ingest is required.' };
  }
  if (!config || config.lane?.backend !== 'supabase_pgvector') throw new Error('node_api_remote_profile_required');
  if (config.embedding?.model !== remoteEmbedding.default_model || config.embedding?.dimensions !== remoteEmbedding.default_dimensions) throw new Error('node_api_remote_embedding_profile_mismatch');
  if (!opts['allow-paid']) throw new Error('node_api_paid_embedding_requires_allow_paid');
  const accountId = opts['account-id'] || env.AGENTSAM_ACCOUNT_ID;
  const repositoryId = opts['repository-id'] || config.repository_id;
  if (!accountId) throw new Error('node_api_account_required');
  if (opts.query && opts.publish) throw new Error('node_api_choose_query_or_publish');
  const corpus = opts.corpus || 'codebase';
  if (opts.query) {
    const filters = corpus === 'documents' ? { source_type: `repository:${repositoryId}` } : {};
    const result = await backend.queryText(opts.query, { accountId, repositoryId, corpus, ...filters }, { nodeApiClient: client });
    return { ...summary, ok: true, account_scoped: true, repository: repositoryId, corpus: result.corpus, result_count: result.result_count, results: result.results };
  }
  if (!['codebase', 'documents'].includes(corpus)) throw new Error('node_api_ingest_corpus_unsupported');
  if (typeof openStore !== 'function') throw new Error('node_api_generation_store_required');
  const store = await openStore(root, config, true);
  let generation;
  try { generation = await store?.active(scopeKey(config)); }
  finally { await store?.close(); }
  if (!generation) throw new Error('node_api_local_generation_missing: run agentsam index run first');
  if (fingerprint([generation.config?.scope, generation.config?.chunking]) !== fingerprint([config.scope, config.chunking])) throw new Error('knowledge_generation_config_mismatch: index current selected sources first');
  const items = generation.chunks.map(chunk => {
    const metadata = { repository_id: repositoryId, ordinal: chunk.ordinal, content_hash: chunk.content_hash,
      source_hash: generation.source_hash, git_commit: generation.git?.commit || null };
    return corpus === 'documents'
      ? { id: chunk.id, content: chunk.content, title: chunk.path, source_type: `repository:${repositoryId}`,
        source_path: chunk.path, chunk_index: chunk.ordinal, chunk_type: 'section', metadata }
      : { id: chunk.id, repository_id: repositoryId, file_path: chunk.path,
        node_type: 'code_chunk', node_name: `${chunk.path}#${chunk.ordinal}`,
        line_start: chunk.line_start ?? null, line_end: chunk.line_end ?? null,
        content: chunk.content, metadata };
  });
  if (!items.length) throw new Error('node_api_no_content_to_publish');
  const maxInputs = opts['max-inputs'] == null ? 100 : Number(opts['max-inputs']);
  if (!Number.isInteger(maxInputs) || maxInputs < 1) throw new Error('node_api_max_inputs_must_be_positive');
  if (items.length > maxInputs) throw new Error(`node_api_embedding_budget_exceeded: ${items.length} selected chunks exceed ${maxInputs}; review index plan and raise --max-inputs explicitly.`);
  const result = await backend.ingestGeneration({
    accountId, repositoryId, generationId: generation.id, corpus, items,
    sourceRef: repositoryId, embedding: { model: remoteEmbedding.default_model, dimensions: remoteEmbedding.default_dimensions },
  }, { nodeApiClient: client });
  return { ...summary, ok: result.ok, account_scoped: true, repository: repositoryId,
    generation_id: generation.id, local_source_hash: generation.source_hash,
    corpus, submitted_chunks: items.length, processed: result.processed, skipped: result.skipped,
    failed: result.failed, batches: result.batches, remote_job_ids: result.job_ids,
    batch_verified: result.ok && result.processed + result.skipped === items.length,
    generation_verified: false,
    note: 'Remote batches were accepted by node-api; generation activation and scoped read-after-write query are separate verification gates.',
  };
}
