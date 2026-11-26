-- identity.account-security — self-service profile + backup (recovery) codes.
-- Portable identity_* names only. Additive; does not change schema_version, so
-- installs without this component keep working and the account API reports
-- `account_security_migration_required` instead of failing silently.
-- Safe to re-run.

INSERT OR IGNORE INTO identity_schema_meta (key, value)
VALUES ('pack_account_security', '1');

CREATE TABLE IF NOT EXISTS identity_user_profiles (
  user_id TEXT PRIMARY KEY NOT NULL,
  avatar_url TEXT,
  timezone TEXT,
  notification_email TEXT,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES identity_users(id)
);

-- Digests only (SHA-256 of the canonical code). Plaintext is shown once.
CREATE TABLE IF NOT EXISTS identity_backup_codes (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  used_at INTEGER,
  expires_at INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES identity_users(id)
);

CREATE INDEX IF NOT EXISTS idx_identity_backup_codes_user
  ON identity_backup_codes(user_id, used_at);
