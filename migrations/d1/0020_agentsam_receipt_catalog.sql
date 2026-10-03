-- AgentSam universal receipt catalog.
-- Runtime payloads remain in their native schemas; this table indexes the
-- universal agentsam.receipt.v1 envelope persisted under inneranimalmedia-schemas.
CREATE TABLE IF NOT EXISTS agentsam_receipt_catalog (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  receipt_kind TEXT NOT NULL,
  schema_name TEXT NOT NULL,
  status TEXT NOT NULL,
  retention_class TEXT NOT NULL DEFAULT 'ephemeral_success',

  repository_id TEXT,
  git_sha TEXT,
  run_id TEXT,

  r2_key TEXT NOT NULL
    CHECK (r2_key LIKE 'agentsam/runtime/receipts/%'),
  content_hash TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size >= 0),

  created_at_unix INTEGER NOT NULL,
  expires_at_unix INTEGER,

  meta_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_agentsam_receipts_account_kind
  ON agentsam_receipt_catalog (account_id, receipt_kind);

CREATE INDEX IF NOT EXISTS idx_agentsam_receipts_repo_sha
  ON agentsam_receipt_catalog (repository_id, git_sha);

CREATE INDEX IF NOT EXISTS idx_agentsam_receipts_expires
  ON agentsam_receipt_catalog (expires_at_unix)
  WHERE expires_at_unix IS NOT NULL;
