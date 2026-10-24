/**
 * Canonical Campaign D1 repository v1.
 * Data contract for each installation. Auth MUST resolve the allowed scope
 * and database before constructing this repository; never use a browser-supplied scope.
 * Lifecycle approval and channel publishing belong to authorized services.
 */
export const CAMPAIGN_STORE_VERSION = 1;
export const CAMPAIGN_KINDS = Object.freeze(['marketing','fundraising','event','email','community','other']);
const EDIT_FIELDS = Object.freeze({
  name: 'name', objective: 'objective', audience: 'audience', brief: 'brief',
  starts_at: 'starts_at', ends_at: 'ends_at', approval_mode: 'approval_mode',
  attributes: 'attributes_json',
});
const MAX_ROWS = 100;

export function canonicalCampaignScope(ownerKind, ownerRef) {
  if (!['account','tenant','site'].includes(ownerKind) ||
      typeof ownerRef !== 'string' || !ownerRef.trim() ||
      ownerRef.length > 256) throw new Error('invalid_campaign_scope');
  return ownerKind + ':' + ownerRef.trim();
}
function requiredString(value, label, length = 180) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > length) {
    throw new Error('invalid_campaign_' + label);
  }
  return value.trim();
}
function optionalText(value, label, limit = 20000) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || value.length > limit) throw new Error('invalid_campaign_' + label);
  return value;
}
function parseJson(value, fallback) {
  try { return typeof value === 'string' ? JSON.parse(value) : value ?? fallback; }
  catch { return fallback; }
}
export function campaignFromRow(row) {
  if (!row) return null;
  return {
    id: row.id, scope_id: row.scope_id, name: row.name, slug: row.slug,
    kind: row.kind, status: row.status, objective: row.objective,
    audience: row.audience, brief: row.brief,
    approval_mode: row.approval_mode, starts_at: row.starts_at, ends_at: row.ends_at,
    attributes: parseJson(row.attributes_json, {}),
    revision: row.revision, created_at: row.created_at, updated_at: row.updated_at,
  };
}
function mapSqliteError(err) {
  if (/UNIQUE constraint failed/i.test(String(err?.message))) throw new Error('campaign_slug_conflict');
  throw err;
}
function cleanPatch(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('campaign_patch_required');
  const entries = [];
  for (const [name, column] of Object.entries(EDIT_FIELDS)) {
    if (!Object.prototype.hasOwnProperty.call(input, name)) continue;
    let value = input[name];
    if (name === 'name') value = requiredString(value, name);
    else if (name === 'attributes') {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_campaign_attributes');
      value = JSON.stringify(value);
    } else value = optionalText(value, name);
    entries.push({ column, value });
  }
  if (!entries.length) throw new Error('campaign_patch_empty');
  // Intentionally excludes status, scope, approval results, metrics and publication receipts.
  return entries;
}

export function createCampaignStore(db, context) {
  if (!db?.prepare) throw new Error('campaign_database_required');
  // The caller must have verified installation ownership and required capability.
  const scopeId = requiredString(context?.authorizedScopeId, 'authorized_scope', 300);
  const actorId = requiredString(context?.actorId, 'actor', 256);

  const scopeQuery = db.prepare('SELECT id FROM campaign_scopes WHERE id = ? LIMIT 1');
  async function ensureScope() {
    if (!await scopeQuery.bind(scopeId).first()) throw new Error('campaign_scope_not_provisioned');
  }
  async function get(id) {
    const row = await db.prepare('SELECT * FROM campaigns WHERE scope_id = ? AND id = ? LIMIT 1')
      .bind(scopeId, requiredString(id, 'id', 300)).first();
    return campaignFromRow(row);
  }
  async function list({ status = null, limit = 50 } = {}) {
    const take = Math.min(MAX_ROWS, Math.max(1, Number.isSafeInteger(limit) ? limit : 50));
    const allowed = status === null ? null : requiredString(status, 'status', 24);
    if (allowed && !['draft','generating','review','approved','scheduled','active','paused','completed','archived','failed'].includes(allowed))
      throw new Error('invalid_campaign_status');
    const sql = 'SELECT * FROM campaigns WHERE scope_id = ?' +
      (allowed ? ' AND status = ?' : '') + ' ORDER BY updated_at DESC, id ASC LIMIT ?';
    const binds = allowed ? [scopeId, allowed, take] : [scopeId, take];
    const response = await db.prepare(sql).bind(...binds).all();
    return (response.results || []).map(campaignFromRow);
  }
  async function create(input) {
    await ensureScope();
    const name = requiredString(input?.name, 'name');
    const kind = input?.kind || 'marketing';
    if (!CAMPAIGN_KINDS.includes(kind)) throw new Error('invalid_campaign_kind');
    const slug = requiredString(input?.slug, 'slug', 180);
    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new Error('invalid_campaign_slug');
    const id = 'camp_' + crypto.randomUUID().replaceAll('-', '');
    const attrs = input?.attributes ?? {};
    if (!attrs || typeof attrs !== 'object' || Array.isArray(attrs)) throw new Error('invalid_campaign_attributes');
    try {
      await db.prepare(
        "INSERT INTO campaigns (id,scope_id,name,slug,kind,status,objective,audience,brief,approval_mode,starts_at,ends_at,attributes_json,created_by,updated_by) " +
        "VALUES (?,?,?,?,?,'draft',?,?,?,?,?,?,?,?,?)"
      ).bind(id, scopeId, name, slug, kind,
        optionalText(input.objective, 'objective'),
        optionalText(input.audience, 'audience'),
        optionalText(input.brief, 'brief'),
        optionalText(input.approval_mode, 'approval_mode', 64) || 'manual',
        optionalText(input.starts_at, 'starts_at', 64),
        optionalText(input.ends_at, 'ends_at', 64),
        JSON.stringify(attrs), actorId, actorId).run();
    } catch (error) { mapSqliteError(error); }
    return get(id);
  }
  async function update(id, expectedRevision, patch) {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision <= 0)
      throw new Error('campaign_revision_required');
    const entries = cleanPatch(patch);
    const set = entries.map((e) => e.column + ' = ?').join(', ');
    try {
      const result = await db.prepare(
        "UPDATE campaigns SET " + set + ", revision=revision+1, updated_by=?, updated_at=datetime('now') " +
        "WHERE scope_id=? AND id=? AND revision=? AND status!='archived'"
      ).bind(...entries.map((e) => e.value), actorId, scopeId, requiredString(id, 'id', 300), expectedRevision).run();
      if (Number(result.meta?.changes ?? 0) !== 1) throw new Error('campaign_missing_or_revision_conflict');
    } catch (error) { mapSqliteError(error); }
    return get(id);
  }
  async function archive(id, expectedRevision) {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision <= 0) throw new Error('campaign_revision_required');
    const result = await db.prepare(
      "UPDATE campaigns SET status='archived', revision=revision+1, updated_by=?, updated_at=datetime('now') " +
      "WHERE scope_id=? AND id=? AND revision=? AND status!='archived'"
    ).bind(actorId, scopeId, requiredString(id, 'id', 300), expectedRevision).run();
    if (Number(result.meta?.changes ?? 0) !== 1) throw new Error('campaign_missing_or_revision_conflict');
    return get(id);
  }
  async function materials(id) {
    if (!await get(id)) throw new Error('campaign_not_found');
    const response = await db.prepare(
      'SELECT * FROM campaign_materials WHERE scope_id=? AND campaign_id=? ORDER BY updated_at DESC'
    ).bind(scopeId, id).all();
    return (response.results || []).map((r) => ({
      ...r, content: parseJson(r.content_json, {})
    }));
  }
  async function publications(id) {
    if (!await get(id)) throw new Error('campaign_not_found');
    const response = await db.prepare(
      'SELECT * FROM campaign_publications WHERE scope_id=? AND campaign_id=? ORDER BY requested_at DESC'
    ).bind(scopeId, id).all();
    return response.results || [];
  }
  async function metricFacts(id) {
    if (!await get(id)) throw new Error('campaign_not_found');
    const response = await db.prepare(
      'SELECT * FROM campaign_metric_facts WHERE scope_id=? AND campaign_id=? ORDER BY measured_at DESC'
    ).bind(scopeId, id).all();
    return response.results || [];
  }
  return Object.freeze({ scopeId, list, get, create, update, archive, materials, publications, metricFacts });
}
