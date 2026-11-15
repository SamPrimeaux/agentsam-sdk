-- IAM-shaped scaffold history: account self-service columns + backup codes.
-- Hosted IAM already has these columns/tables; this brings older scaffolds to parity.
-- ALTERs fail with "duplicate column" on re-run; apply tooling treats that as ignorable.

ALTER TABLE auth_users ADD COLUMN avatar_url TEXT;
ALTER TABLE auth_users ADD COLUMN timezone TEXT;
ALTER TABLE auth_users ADD COLUMN notification_email TEXT;
ALTER TABLE auth_users ADD COLUMN role TEXT NOT NULL DEFAULT 'member';
ALTER TABLE auth_users ADD COLUMN is_superadmin INTEGER NOT NULL DEFAULT 0;
ALTER TABLE auth_sessions ADD COLUMN type TEXT NOT NULL DEFAULT 'browser';
ALTER TABLE accounts ADD COLUMN avatar_url TEXT;
ALTER TABLE accounts ADD COLUMN timezone TEXT;
ALTER TABLE accounts ADD COLUMN notification_email TEXT;

CREATE TABLE IF NOT EXISTS user_backup_codes (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  used_at INTEGER,
  expires_at INTEGER,
  created_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_user_backup_codes_user ON user_backup_codes(user_id, used_at);
