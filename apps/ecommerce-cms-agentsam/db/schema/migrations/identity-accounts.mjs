import { readFileSync } from "node:fs";

const identity = readFileSync(new URL("../core/001_identity.sql", import.meta.url), "utf8");

export async function migrateAccounts(sql) {
  const info = await sql.all("PRAGMA table_info(accounts)");
  const names = new Set(info.map((row) => row.name));
  if (names.has("slug")) return { skipped: true };
  if (!names.has("account_key")) {
    await sql.exec(identity);
    return { fresh: true };
  }
  await sql.exec("PRAGMA foreign_keys = OFF");
  await sql.exec(`
    CREATE TABLE accounts_core (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      legal_name TEXT,
      kind TEXT NOT NULL DEFAULT 'organization',
      parent_account_id TEXT REFERENCES accounts_core(id),
      root_account_id TEXT REFERENCES accounts_core(id),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending','active','suspended','closed')),
      plan_key TEXT NOT NULL DEFAULT 'free',
      timezone TEXT NOT NULL DEFAULT 'UTC',
      locale TEXT NOT NULL DEFAULT 'en-US',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      closed_at TEXT
    )
  `);
  await sql.exec(`
    INSERT INTO accounts_core (id, slug, display_name, status, created_at, updated_at)
    SELECT id, account_key, display_name, status,
      datetime(created_at, 'unixepoch'), datetime(updated_at, 'unixepoch')
    FROM accounts
  `);
  await sql.exec("DROP TABLE accounts");
  await sql.exec("ALTER TABLE accounts_core RENAME TO accounts");
  await sql.exec(identity);
  await sql.exec("PRAGMA foreign_keys = ON");
  return { migrated: true };
}
