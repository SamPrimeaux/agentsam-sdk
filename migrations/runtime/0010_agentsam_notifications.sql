-- Portable AgentSam notification spine.
--
-- Inbox + delivery queue. Shared hosts map account_id to accounts.id.
-- tenant_id / workspace_id are intentionally not part of this contract.
--
-- Channels:
--   in_app  — dashboard / Local Studio inbox (notifications row only)
--   email   — delivery via notification_outbox (+ optional inbox mirror)
--   push    — Web Push; device endpoints stay on agentsam_hook (web_push)
--   imessage— Mac Messages daemon; approval decisions stay on agentsam_approval_queue
--   system / sms / webhook — host-defined adapters
--
-- recipient_account_id NULL means notify account_id (same person).
-- Set recipient_account_id for client/teammate delivery under another owner.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY DEFAULT ('notif_' || lower(hex(randomblob(8)))),
  recipient_id TEXT NOT NULL,
  recipient_type TEXT NOT NULL DEFAULT 'user'
    CHECK (recipient_type IN ('user','account','agent','system')),
  channel TEXT NOT NULL
    CHECK (channel IN ('in_app','email','push','imessage','system','sms','webhook')),
  subject TEXT,
  message TEXT NOT NULL,
  data TEXT,
  entity_type TEXT,
  entity_id TEXT,
  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low','normal','high','urgent')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sent','failed','cancelled','read')),
  sent_at INTEGER,
  read_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created
  ON notifications (recipient_type, recipient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_channel_status
  ON notifications (channel, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_entity
  ON notifications (entity_type, entity_id)
  WHERE entity_type IS NOT NULL AND entity_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS notification_outbox (
  id TEXT PRIMARY KEY DEFAULT ('nox_' || lower(hex(randomblob(8)))),
  account_id TEXT NOT NULL,
  recipient_account_id TEXT,
  channel TEXT NOT NULL
    CHECK (channel IN ('email','system','push','imessage','sms','webhook')),
  to_address TEXT,
  subject TEXT,
  body_text TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(payload_json)),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','queued','sent','failed','cancelled')),
  priority INTEGER NOT NULL DEFAULT 3,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  last_error TEXT,
  source_table TEXT,
  source_id TEXT,
  event_type TEXT,
  created_by TEXT NOT NULL DEFAULT 'system',
  cicd_run_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_notification_outbox_account_status_created
  ON notification_outbox (account_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_outbox_recipient_status_created
  ON notification_outbox (recipient_account_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_outbox_status_priority
  ON notification_outbox (status, priority, created_at);

CREATE INDEX IF NOT EXISTS idx_notification_outbox_event_type
  ON notification_outbox (event_type)
  WHERE event_type IS NOT NULL;
