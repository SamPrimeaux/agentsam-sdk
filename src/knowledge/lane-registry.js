function clean(value) { return value == null ? '' : String(value).trim(); }
function json(value, fallback = {}) { try { return JSON.parse(String(value || '')); } catch { return fallback; } }

export function normalizeRetrievalLane(row = {}) {
  return Object.freeze({
    id: clean(row.id),
    account_id: clean(row.account_id) || null,
    repository_id: clean(row.repository_id) || null,
    database_id: clean(row.database_id) || null,
    backend_kind: clean(row.backend_kind || 'pgvector'),
    provider_key: clean(row.provider_key) || null,
    resource_id: clean(row.resource_id) || null,
    binding_name: clean(row.binding_name) || null,
    index_name: clean(row.index_name) || null,
    // Namespace is provider/project-owned. Never silently force the shared
    // `agentsam` schema onto a new application's retrieval lane.
    schema_name: clean(row.schema_name) || null,
    table_name: clean(row.table_name),
    purpose: clean(row.purpose),
    dimensions: Number(row.dimensions) || null,
    metric: clean(row.metric || 'cosine'),
    embedding_model: clean(row.embedding_model) || null,
    metadata: json(row.metadata_json, {}),
    is_active: Number(row.is_active) === 1,
  });
}

/** Project selection is explicit; no global preferred vector store exists. */
export function selectProjectRetrievalLanes(rows, { accountId, repositoryId, purpose } = {}) {
  const account = clean(accountId);
  const repository = clean(repositoryId);
  if (!account || !repository) throw new Error('project_retrieval_identity_required');
  return (Array.isArray(rows) ? rows : [])
    .map(normalizeRetrievalLane)
    .filter((lane) => lane.is_active && lane.account_id === account && lane.repository_id === repository && (!purpose || lane.purpose === purpose));
}

export async function loadProjectRetrievalLanes(db, identity = {}) {
  if (!db?.prepare) throw new TypeError('database_required');
  const result = await db.prepare(`
    SELECT * FROM agentsam_pgvector_lane_registry
    WHERE account_id = ? AND repository_id = ? AND is_active = 1
    ORDER BY purpose, id
  `).bind(clean(identity.accountId), clean(identity.repositoryId)).all();
  return selectProjectRetrievalLanes(result?.results || [], identity);
}
