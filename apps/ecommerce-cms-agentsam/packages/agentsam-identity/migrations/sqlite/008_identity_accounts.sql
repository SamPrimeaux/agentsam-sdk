-- identity.core: accounts, the account row of record.
-- Same shape as the hosted accounts table so local SQLite, portable D1 and hosted match.
-- Credentials stay in identity_users (hosted equivalent: auth_users); accounts carries identity and profile.
-- Timestamps: INTEGER unixepoch seconds. Re-run is safe: IF NOT EXISTS, INSERT OR IGNORE, NULL-guarded UPDATE.

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'human'
    CHECK (type IN ('human', 'agent', 'system')),
  email TEXT UNIQUE,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  password_hash TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'pending', 'deleted')),
  plan TEXT NOT NULL DEFAULT 'free'
    CHECK (plan IN ('free', 'pro', 'agency', 'enterprise')),
  timezone TEXT NOT NULL DEFAULT 'America/Chicago',
  meta_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_active_at INTEGER,
  notification_email TEXT
);

-- Existing portable databases: give every identity_users row its account.
INSERT OR IGNORE INTO accounts (id, email, display_name, status, created_at, updated_at)
SELECT
  id,
  email,
  COALESCE(NULLIF(display_name, ''), email),
  CASE WHEN status IN ('active', 'suspended', 'pending', 'deleted') THEN status ELSE 'active' END,
  created_at,
  updated_at
FROM identity_users;

-- Seed last_active_at from the newest session so history is not lost.
UPDATE accounts
SET last_active_at = (SELECT MAX(s.last_active_at) FROM identity_sessions s WHERE s.user_id = accounts.id)
WHERE last_active_at IS NULL
  AND EXISTS (SELECT 1 FROM identity_sessions s WHERE s.user_id = accounts.id);
