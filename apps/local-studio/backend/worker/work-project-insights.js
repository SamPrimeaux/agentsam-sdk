/**
 * Project insights from the SAME D1 as tickets/projects/chat sessions.
 * Strict account ownership; absence of cost/usage tables is unknown, not $0.
 */
import { readProjectMeasurements } from './work-project-metrics.js';
const clean = (value) => String(value ?? '').trim();
const num = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

export async function readProjectInsights(db, ownerId, projectId) {
  const owner = clean(ownerId);
  const id = clean(projectId);
  if (!owner || !id) return null;
  const project = await db.prepare('SELECT id FROM projects WHERE id = ? AND owner_user_id = ?').bind(id, owner).first();
  if (!project) return null;
  const costsTable = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'project_costs'").first();
  let costs = null;
  if (costsTable) {
    const schema = await db.prepare("PRAGMA table_info('project_costs')").all();
    const columns = new Set((schema.results || []).map((row) => row.name));
    if (columns.has('project_id') && columns.has('amount')) {
      const count = await db.prepare('SELECT COUNT(*) AS n, SUM(amount) AS total FROM project_costs WHERE CAST(project_id AS TEXT) = ?').bind(id).first();
      // No rows means no recorded costs, not proof of zero spending elsewhere.
      costs = num(count?.n) > 0 ? { currency: 'USD', recordedTotal: num(count.total), lineItems: num(count.n) } : null;
    }
  }
  let rules = null;
  const rulesTable = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'agentsam_rules_document'").first();
  if (rulesTable) {
    const schema = await db.prepare("PRAGMA table_info('agentsam_rules_document')").all();
    const columns = new Set((schema.results || []).map((row) => row.name));
    if (columns.has('user_id') && columns.has('body_markdown') && columns.has('is_active')) {
      const where = columns.has('project_id') ? '(project_id = ? OR id = ?)' : 'id = ?';
      const params = columns.has('project_id') ? [id, 'rule_' + id + '_runtimecontract'] : ['rule_' + id + '_runtimecontract'];
      const doc = await db.prepare(
        'SELECT id, title, version, updated_at FROM agentsam_rules_document WHERE ' + where
        + ' AND user_id = ? AND is_active = 1 ORDER BY updated_at DESC LIMIT 1'
      ).bind(...params, owner).first();
      if (doc) rules = { id: doc.id, title: doc.title, version: Number(doc.version) || 1, updatedAt: doc.updated_at };
    }
  }
  let measurements = null;
  try { measurements = await readProjectMeasurements(db, owner, id, { authorized: true }); }
  catch (err) { console.error('project_measurements_unavailable', String(err)); }
  // The current USD ledger supersedes a generic legacy sum once available.
  // Keep the old guarded cost query only for older local schemas.
  if (measurements) costs = measurements.costs
    ? {currency:measurements.costs.currency,recordedTotal:measurements.costs.recordedTotal,
       lineItems:measurements.costs.lineItems} : null;
  let connections = [];
  try {
    const storage = await db.prepare(
      "SELECT storage_type, storage_name, status FROM project_storage WHERE project_id=? ORDER BY storage_type, storage_name"
    ).bind(id).all();
    const oauth = await db.prepare(
      "SELECT provider, COUNT(*) AS active FROM user_oauth_tokens " +
      "WHERE user_id=? AND is_active=1 AND (revoked_at IS NULL OR revoked_at=0) " +
      "AND provider IN ('cloudflare','github','google_drive') GROUP BY provider"
    ).bind(owner).all();
    const active = new Map((oauth.results || []).map(x => [x.provider, num(x.active)]));
    const providers = { github:'github', google_drive:'google_drive' };
    connections = (storage.results || []).map(row => {
      const type=clean(row.storage_type).toLowerCase();
      const provider=providers[type] || null;
      return { type, name: clean(row.storage_name), configured: clean(row.status).toLowerCase()==='active',
        verification: provider ? (active.get(provider)>0?'oauth_record_active':'oauth_reauthorization_required')
          : 'storage_registration_only' };
    });
  } catch (err) { console.error('project_connections_unavailable', String(err)); }
  return { projectId: id, costs, rules, measurements, connections,
    costsConnected: Boolean(costsTable), rulesConnected: Boolean(rulesTable) };
}
