/** Ephemeral Local Studio authorization tables that already exist in production D1.
 * The merchant CMS schema fixture intentionally does not own these host tables. */
export function addCmsHostDirectoryTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY, workspace_id TEXT, owner_account_id TEXT,
      is_active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY, name TEXT, domain TEXT, worker_id TEXT,
      metadata_json TEXT, tenant_id TEXT
    );
    CREATE TABLE IF NOT EXISTS memberships (
      workspace_id TEXT, account_id TEXT, role TEXT
    );
    CREATE TABLE IF NOT EXISTS project_permissions (
      project_id TEXT, tenant_id TEXT, subject_type TEXT,
      subject_id TEXT, permission_level TEXT, expires_at INTEGER
    );
  `);
}
