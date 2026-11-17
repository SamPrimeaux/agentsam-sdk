-- agentsam-engine: d1
-- Collapse the CMS assistant's legacy conversation registry into the canonical
-- account-owned chat-session spine. After this migration there is no
-- agentsam_conversations table or runtime dependency on it.

CREATE TABLE IF NOT EXISTS agentsam_chat_sessions (
  conversation_id        TEXT PRIMARY KEY,
  account_id             TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  title                  TEXT NOT NULL,
  created_at             INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at             INTEGER NOT NULL DEFAULT (unixepoch()),
  latest_digest_r2_key   TEXT,
  digest_count           INTEGER NOT NULL DEFAULT 0,
  last_compacted_at      INTEGER,
  is_starred             INTEGER NOT NULL DEFAULT 0,
  project_id             TEXT,
  message_count          INTEGER NOT NULL DEFAULT 1,
  r2_messages_key        TEXT,
  r2_meta_key            TEXT,
  total_tokens_in        INTEGER NOT NULL DEFAULT 0,
  total_tokens_out       INTEGER NOT NULL DEFAULT 0,
  last_model_key         TEXT,
  last_turn_status       TEXT,
  last_turn_error        TEXT,
  last_turn_at           INTEGER,
  artifact_count         INTEGER NOT NULL DEFAULT 0,
  session_kind           TEXT NOT NULL DEFAULT 'chat',
  parent_conversation_id TEXT REFERENCES agentsam_chat_sessions(conversation_id) ON DELETE SET NULL,
  expires_at             INTEGER,
  state                  TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active','archived','trashed')),
  state_changed_at       INTEGER NOT NULL DEFAULT 0,
  storage_bytes          INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_account_updated
  ON agentsam_chat_sessions(account_id, state, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_sessions_conversation_account
  ON agentsam_chat_sessions(conversation_id, account_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_parent
  ON agentsam_chat_sessions(parent_conversation_id)
  WHERE parent_conversation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_sessions_expires
  ON agentsam_chat_sessions(expires_at)
  WHERE expires_at IS NOT NULL;

-- Preserve every existing CMS conversation ID and R2 object pointer. The
-- session row becomes the only authority for title, account, state, model and
-- message count. Summary content remains in its existing R2 digest object.
INSERT OR IGNORE INTO agentsam_chat_sessions (
  conversation_id, account_id, title, created_at, updated_at,
  latest_digest_r2_key, digest_count, message_count, r2_messages_key,
  last_model_key, last_turn_at, session_kind, expires_at, state, state_changed_at
)
SELECT c.id, c.account_id, c.title,
  COALESCE(c.created_at_unix, unixepoch()),
  COALESCE(c.last_active_unix, unixepoch()),
  c.r2_summary_key,
  CASE WHEN c.r2_summary_key IS NOT NULL THEN 1 ELSE 0 END,
  COALESCE(c.message_count, 0),
  c.r2_thread_key,
  c.last_model_id,
  c.last_active_unix,
  'chat', NULL,
  CASE c.status
    WHEN 'deleted' THEN 'trashed'
    WHEN 'archived' THEN 'archived'
    ELSE 'active'
  END,
  COALESCE(c.last_active_unix, unixepoch())
FROM agentsam_conversations c
JOIN accounts a ON a.id = c.account_id;

-- Rebuild attachment metadata so conversation links target the canonical
-- session spine, not the table being retired. R2 object keys and file metadata
-- are preserved; an orphaned/cross-account conversation link is detached,
-- never used to reassign the asset to another account.
ALTER TABLE agentsam_attachments RENAME TO agentsam_attachments_legacy;
DROP INDEX IF EXISTS idx_agentsam_attachments_status;
DROP INDEX IF EXISTS idx_agentsam_attachments_account_conversation;

CREATE TABLE agentsam_attachments (
  id               TEXT PRIMARY KEY,
  account_id       TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  conversation_id  TEXT,
  message_id       TEXT,
  uploaded_by      TEXT,
  file_name        TEXT NOT NULL,
  mime_type        TEXT,
  file_size_bytes  INTEGER NOT NULL DEFAULT 0,
  r2_key           TEXT NOT NULL UNIQUE,
  preview_url      TEXT,
  image_width      INTEGER,
  image_height     INTEGER,
  status           TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('uploading','ready','failed','deleted')),
  metadata_json    TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json)),
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  created_at_unix  INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (conversation_id, account_id)
    REFERENCES agentsam_chat_sessions(conversation_id, account_id)
);

INSERT INTO agentsam_attachments (
  id, account_id, conversation_id, uploaded_by, file_name, mime_type,
  file_size_bytes, r2_key, preview_url, status, created_at, created_at_unix
)
SELECT a.id, a.account_id,
  CASE WHEN a.conversation_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM agentsam_chat_sessions s
    WHERE s.conversation_id = a.conversation_id AND s.account_id = a.account_id
  ) THEN a.conversation_id ELSE NULL END,
  a.uploaded_by, a.file_name, a.mime_type,
  COALESCE(a.file_size_bytes, 0), a.r2_key, a.preview_url,
  COALESCE(a.status, 'ready'),
  COALESCE(a.created_at, datetime('now')),
  COALESCE(unixepoch(a.created_at), unixepoch())
FROM agentsam_attachments_legacy a;

DROP TABLE agentsam_attachments_legacy;
CREATE INDEX idx_agentsam_attachments_status
  ON agentsam_attachments(account_id, status, created_at_unix DESC);
CREATE INDEX idx_agentsam_attachments_account_conversation
  ON agentsam_attachments(account_id, conversation_id, created_at_unix DESC);

-- Rebuild share rows from their canonical conversation ID. This supports both
-- the old owner_id shape and the account_id shape: ownership is resolved from
-- agentsam_chat_sessions, never guessed from a user-supplied owner value.
ALTER TABLE agentsam_conversation_shares RENAME TO agentsam_conversation_shares_legacy;
DROP INDEX IF EXISTS idx_agentsam_conversation_shares_owner;
DROP INDEX IF EXISTS idx_conv_shares_conversation;
DROP INDEX IF EXISTS idx_conv_shares_account;

CREATE TABLE agentsam_conversation_shares (
  id               TEXT PRIMARY KEY,
  account_id       TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  conversation_id  TEXT NOT NULL,
  token            TEXT NOT NULL UNIQUE,
  title            TEXT NOT NULL,
  snapshot_json    TEXT NOT NULL CHECK (json_valid(snapshot_json)),
  created_at       INTEGER NOT NULL DEFAULT (unixepoch()),
  revoked_at       INTEGER,
  FOREIGN KEY (conversation_id, account_id)
    REFERENCES agentsam_chat_sessions(conversation_id, account_id) ON DELETE CASCADE
);

INSERT INTO agentsam_conversation_shares (
  id, account_id, conversation_id, token, title, snapshot_json, created_at, revoked_at
)
SELECT old.id, session.account_id, old.conversation_id, old.token, old.title,
  old.snapshot_json, COALESCE(old.created_at, unixepoch()), old.revoked_at
FROM agentsam_conversation_shares_legacy old
JOIN agentsam_chat_sessions session
  ON session.conversation_id = old.conversation_id;

DROP TABLE agentsam_conversation_shares_legacy;
CREATE INDEX idx_conv_shares_conversation
  ON agentsam_conversation_shares(conversation_id);
CREATE INDEX idx_conv_shares_account
  ON agentsam_conversation_shares(account_id, created_at DESC);

-- No runtime code may continue to treat CMS conversation metadata as a second
-- source of truth. Its data and indexes have been migrated above.
DROP TABLE agentsam_conversations;
