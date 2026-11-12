-- agentsam-engine: d1
-- Reconcile the existing production registry; this is idempotent where the
-- canonical user_storage_provider_preferences table is already installed.
-- owner_user_id stores the authenticated IAM account principal (legacy column
-- name); no workspace is required and no provider credential bytes are kept.
CREATE TABLE IF NOT EXISTS user_storage_provider_preferences (
  owner_user_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK(provider IN (
    'device_fsa','opfs','artifacts_r2','github','google_drive','supabase','s3'
  )),
  is_enabled INTEGER NOT NULL DEFAULT 1,
  is_default INTEGER NOT NULL DEFAULT 0,
  preferences_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(preferences_json)),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (owner_user_id, provider)
);
