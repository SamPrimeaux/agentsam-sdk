-- Additive upgrade: accounts as SSOT for scaffolds that already applied an older 0001.
-- Safe to re-run. New scaffolds get accounts from 0001_identity_core.sql directly.
--
-- account_identities remains IdP linkage only (provider + subject → accounts.id).

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE,
  display_name TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_email ON accounts(email);

-- Backfill from auth_users (1:1 portable scaffold).
INSERT OR IGNORE INTO accounts (id, email, display_name, status, created_at, updated_at)
SELECT id, email, display_name, COALESCE(status, 'active'), created_at, updated_at
FROM auth_users;
