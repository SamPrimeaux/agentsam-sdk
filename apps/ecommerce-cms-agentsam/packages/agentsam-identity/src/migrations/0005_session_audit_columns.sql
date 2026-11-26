-- IAM-shaped scaffold history: audit columns hosted IAM already carries.
--   auth_sessions.revoke_reason  why a session ended (logout, native_handoff_invalid, ...)
--   accounts.last_active_at      account-level "last seen", written on login
-- ALTERs fail with "duplicate column" on re-run; apply tooling treats that as ignorable.
ALTER TABLE auth_sessions ADD COLUMN revoke_reason TEXT;
ALTER TABLE accounts ADD COLUMN last_active_at INTEGER;
