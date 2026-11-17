-- agentsam-engine: d1
-- Storage already used by the packaged CMS assistant. The Studio chat
-- registry and model inventory continue to belong to their existing owners.
CREATE TABLE IF NOT EXISTS agentsam_conversations (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  title TEXT NOT NULL,
  summary TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  source TEXT NOT NULL,
  workflow_key TEXT,
  last_message_preview TEXT,
  last_model_id TEXT,
  message_count INTEGER NOT NULL DEFAULT 0,
  tool_call_count INTEGER NOT NULL DEFAULT 0,
  attachment_count INTEGER NOT NULL DEFAULT 0,
  r2_thread_key TEXT,
  r2_summary_key TEXT,
  kv_recent_key TEXT,
  created_by TEXT,
  last_active_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_active_unix INTEGER NOT NULL DEFAULT (unixepoch()),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at_unix INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (id, account_id)
);
CREATE INDEX IF NOT EXISTS idx_cms_assistant_recent
  ON agentsam_conversations(account_id, status, last_active_unix DESC);
CREATE TABLE IF NOT EXISTS agentsam_attachments (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  conversation_id TEXT,
  message_id TEXT,
  uploaded_by TEXT,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  file_size_bytes INTEGER NOT NULL DEFAULT 0,
  r2_key TEXT NOT NULL UNIQUE,
  preview_url TEXT,
  image_width INTEGER,
  image_height INTEGER,
  status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('uploading','ready','failed','deleted')),
  metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at_unix INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (conversation_id, account_id) REFERENCES agentsam_conversations(id, account_id)
);
