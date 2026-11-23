-- Records why a session ended (logout, native_handoff_invalid, pkce_verification_failed, ...).
-- Re-run is safe: apply tooling treats "duplicate column" as ignorable.
ALTER TABLE identity_sessions ADD COLUMN revoke_reason TEXT;
