/**
 * Portable Work schema. A SUBSET of the production tables (same names, same column
 * names, same CHECK vocabularies) so identical queries run on hosted D1 and on a fresh
 * local SQLite install. Existing tables are never altered: CREATE IF NOT EXISTS only.
 */
export const WORK_SCHEMA = Object.freeze([
  `CREATE TABLE IF NOT EXISTS agentsam_tickets (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('backlog','active','blocked','in_review','shipped','abandoned')),
    status_reason TEXT, project TEXT, subsystem TEXT, tags TEXT, priority TEXT, doc_path TEXT,
    blocks TEXT, blocked_by TEXT, supersedes TEXT,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, closed_at INTEGER,
    dedup_key TEXT, description TEXT, client_id TEXT, due_at INTEGER,
    surface TEXT NOT NULL DEFAULT 'platform', start_at INTEGER, estimated_minutes INTEGER,
    percent_complete INTEGER NOT NULL DEFAULT 0, owner_kind TEXT NOT NULL DEFAULT 'unassigned',
    owner_ref TEXT, parent_ticket_id TEXT, agent_run_id TEXT, worktree TEXT, linked_commit TEXT,
    source TEXT NOT NULL DEFAULT 'manual', account_id TEXT, repository_id TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS agentsam_ticket_events (
    id TEXT PRIMARY KEY, ticket_id TEXT NOT NULL, event_type TEXT NOT NULL,
    from_status TEXT, to_status TEXT, detail TEXT, commit_sha TEXT, created_at INTEGER NOT NULL,
    actor_type TEXT, actor_id TEXT, media_asset_id TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    client_name TEXT,
    project_type TEXT CHECK (project_type IN ('dashboard','landing-page','saas-product','e-commerce','internal-tool','template')),
    status TEXT CHECK (status IN ('discovery','design','development','qa','staging','production','maintenance','archived')) DEFAULT 'discovery',
    launch_date DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    client_id TEXT, domain TEXT, priority INTEGER DEFAULT 50, description TEXT, owner_user_id TEXT,
    metadata_json TEXT DEFAULT '{}', tags_json TEXT DEFAULT '[]', parent_id TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS calendar_events (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    tenant_id TEXT NOT NULL,
    user_id TEXT,
    title TEXT NOT NULL,
    description TEXT,
    location TEXT,
    event_type TEXT DEFAULT 'meeting' CHECK (event_type IN ('meeting','deadline','reminder','task','client_call','personal','travel','other')),
    start_datetime TEXT NOT NULL,
    end_datetime TEXT NOT NULL,
    timezone TEXT DEFAULT 'America/Chicago',
    all_day INTEGER DEFAULT 0 CHECK (all_day IN (0,1)),
    status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled','completed','cancelled','rescheduled')),
    color TEXT DEFAULT '#3b82f6',
    priority TEXT DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
    client_id TEXT,
    project_id TEXT,
    created_by TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    calendar_source TEXT DEFAULT 'primary',
    external_event_id TEXT,
    sync_account TEXT
  )`,
  `CREATE TRIGGER IF NOT EXISTS trg_agentsam_tickets_shipped_requires_closed_at_ins
    BEFORE INSERT ON agentsam_tickets FOR EACH ROW
    WHEN NEW.status = 'shipped' AND NEW.closed_at IS NULL
    BEGIN SELECT RAISE(ABORT, 'agentsam_tickets: status=shipped requires closed_at on INSERT'); END`,
  `CREATE TRIGGER IF NOT EXISTS trg_agentsam_tickets_shipped_requires_closed_at_upd
    BEFORE UPDATE ON agentsam_tickets FOR EACH ROW
    WHEN NEW.status = 'shipped' AND NEW.closed_at IS NULL
    BEGIN SELECT RAISE(ABORT, 'agentsam_tickets: status=shipped requires closed_at (use assert:ticket-shippable or setTicketStatus)'); END`,
]);

const ensured = new WeakSet();

/** Create any missing Work tables. Cheap after the first call per db handle. */
export async function ensureWorkSchema(db) {
  if (!db?.prepare || ensured.has(db)) return;
  const row = await db
    .prepare(
      "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name IN ('agentsam_tickets','agentsam_ticket_events','projects','calendar_events')",
    )
    .first();
  if (Number(row?.n) < 4) {
    for (const sql of WORK_SCHEMA) await db.prepare(sql).run();
  }
  ensured.add(db);
}
