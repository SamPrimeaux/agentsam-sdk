-- identity.core extension — company / brand + native handoff parity
-- Portable identity_* names only. Does not create IAM `company` / `accounts`.
-- Does NOT include password-reset tables — recovery remains storage-agnostic
-- (createPasswordResetService + injected {get,put,delete} store).
-- Upgrades schema_version 1 → 2. Safe to re-run (IF NOT EXISTS / ignorable ALTERs).

INSERT OR REPLACE INTO identity_schema_meta (key, value)
VALUES ('schema_version', '2');

INSERT OR IGNORE INTO identity_schema_meta (key, value)
VALUES ('pack_company_native', '1');

CREATE TABLE IF NOT EXISTS identity_companies (
  id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  legal_name TEXT,
  logo_url TEXT,
  favicon_url TEXT,
  primary_color TEXT,
  auth_bg_color TEXT,
  support_email TEXT,
  website_url TEXT,
  tagline TEXT,
  meta_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_identity_companies_slug
  ON identity_companies(slug);

CREATE TABLE IF NOT EXISTS identity_native_handoffs (
  handoff_hash TEXT PRIMARY KEY NOT NULL,
  session_id TEXT NOT NULL,
  challenge TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  consumed_at INTEGER,
  FOREIGN KEY (session_id) REFERENCES identity_sessions(id)
);

CREATE INDEX IF NOT EXISTS idx_identity_native_handoffs_expires
  ON identity_native_handoffs(expires_at);

-- Session type for browser vs desktop/native (default keeps existing rows as browser).
ALTER TABLE identity_sessions ADD COLUMN type TEXT NOT NULL DEFAULT 'browser';

-- Native OAuth transaction fields (optional on browser transactions).
ALTER TABLE identity_oauth_transactions ADD COLUMN client_type TEXT;
ALTER TABLE identity_oauth_transactions ADD COLUMN native_challenge TEXT;
ALTER TABLE identity_oauth_transactions ADD COLUMN native_redirect TEXT;
