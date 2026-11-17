import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const migration = (name) => readFileSync(new URL(`../backend/migrations/${name}`, import.meta.url), "utf8");
const legacyShares = migration("1351_agentsam_conversation_shares.sql");
const legacyCms = migration("1373_cms_editor_assistant_storage.sql");
const consolidate = migration("1377_agentsam_chat_session_share_contract.sql");

function makeBase() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(`CREATE TABLE accounts (id TEXT PRIMARY KEY);
    INSERT INTO accounts(id) VALUES ('acct-a'),('acct-b');`);
  return db;
}

test("consolidation backfills CMS assistant sessions, migrates shares and attachments, and drops the duplicate registry", () => {
  const db = makeBase();
  try {
    db.exec(legacyShares);
    db.exec(legacyCms);
    db.exec(`INSERT INTO agentsam_conversations
      (id,account_id,title,status,source,message_count,last_model_id,r2_thread_key,r2_summary_key,last_active_unix,created_at_unix)
      VALUES
      ('conv-active','acct-a','Active','active','admin_agentsam',4,'model-a','threads/active.jsonl','digests/active.json',200,100),
      ('conv-archived','acct-a','Archived','archived','admin_agentsam',2,'model-b','threads/archived.jsonl','digests/archived.json',300,150),
      ('conv-deleted','acct-a','Deleted','deleted','admin_agentsam',1,NULL,'threads/deleted.jsonl','digests/deleted.json',400,180);`);
    db.exec(`INSERT INTO agentsam_attachments
      (id,account_id,conversation_id,uploaded_by,file_name,mime_type,file_size_bytes,r2_key,preview_url)
      VALUES ('attachment-a','acct-a','conv-active','user-a','proof.png','image/png',1234,'r2/proof.png','/media/proof.png');`);
    // The original 1351 schema used owner_id. Migration resolves the owner from
    // the canonical session rather than assuming owner_id is an account ID.
    db.exec(`INSERT INTO agentsam_conversation_shares
      (id,owner_id,conversation_id,token,title,snapshot_json)
      VALUES ('share-a','user-a','conv-active','token-a','Active','{"messages":[]}');`);

    db.exec(consolidate);

    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='agentsam_conversations'").get().n, 0);
    const sessions = db.prepare(`SELECT conversation_id,account_id,title,created_at,updated_at,
      latest_digest_r2_key,digest_count,message_count,r2_messages_key,last_model_key,
      session_kind,expires_at,state,state_changed_at FROM agentsam_chat_sessions ORDER BY conversation_id`).all();
    assert.equal(sessions.length, 3);
    const active = sessions.find((row) => row.conversation_id === "conv-active");
    assert.equal(active.account_id, "acct-a");
    assert.equal(active.message_count, 4);
    assert.equal(active.last_model_key, "model-a");
    assert.equal(active.r2_messages_key, "threads/active.jsonl");
    assert.equal(active.latest_digest_r2_key, "digests/active.json");
    assert.equal(active.state, "active");
    assert.equal(active.session_kind, "chat");
    assert.equal(active.expires_at, null);
    assert.equal(active.digest_count, 1);
    assert.equal(sessions.find((row) => row.conversation_id === "conv-archived").state, "archived");
    assert.equal(sessions.find((row) => row.conversation_id === "conv-deleted").state, "trashed");

    const attachment = db.prepare("SELECT * FROM agentsam_attachments WHERE id='attachment-a'").get();
    assert.equal(attachment.account_id, "acct-a");
    assert.equal(attachment.conversation_id, "conv-active");
    assert.equal(attachment.r2_key, "r2/proof.png");
    const attachmentFks = db.prepare("SELECT \"table\", \"from\", \"to\" FROM pragma_foreign_key_list('agentsam_attachments')").all();
    assert.ok(attachmentFks.some((row) => row.table === "agentsam_chat_sessions" && row.from === "conversation_id" && row.to === "conversation_id"));
    assert.ok(attachmentFks.some((row) => row.table === "agentsam_chat_sessions" && row.from === "account_id" && row.to === "account_id"));

    const share = db.prepare("SELECT id,account_id,conversation_id,token,title,snapshot_json FROM agentsam_conversation_shares").get();
    assert.equal(share.account_id, "acct-a");
    assert.equal(share.conversation_id, "conv-active");
    assert.equal(share.token, "token-a");
    assert.equal(share.snapshot_json, '{"messages":[]}');
    const shareColumns = db.prepare("SELECT name FROM pragma_table_info('agentsam_conversation_shares')").all().map((row) => row.name);
    assert.ok(shareColumns.includes("account_id"));
    assert.ok(!shareColumns.includes("owner_id"));

    assert.throws(() => db.prepare(`INSERT INTO agentsam_attachments
      (id,account_id,conversation_id,file_name,mime_type,file_size_bytes,r2_key)
      VALUES ('cross-account','acct-b','conv-active','bad.txt','text/plain',1,'bad-key')`).run(), /FOREIGN KEY/);
    assert.throws(() => db.prepare(`INSERT INTO agentsam_conversation_shares
      (id,account_id,conversation_id,token,title,snapshot_json)
      VALUES ('cross-share','acct-b','conv-active','bad-token','Bad','{"messages":[]}')`).run(), /FOREIGN KEY/);
  } finally {
    db.close();
  }
});

test("consolidation handles the older compact attachment schema used by the platform D1", () => {
  const db = makeBase();
  try {
    db.exec(legacyShares);
    db.exec(`CREATE TABLE agentsam_conversations (
      id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), title TEXT NOT NULL,
      summary TEXT, status TEXT NOT NULL DEFAULT 'active', source TEXT NOT NULL,
      workflow_key TEXT, last_message_preview TEXT, last_model_id TEXT, message_count INTEGER NOT NULL DEFAULT 0,
      tool_call_count INTEGER NOT NULL DEFAULT 0, attachment_count INTEGER NOT NULL DEFAULT 0,
      r2_thread_key TEXT, r2_summary_key TEXT, kv_recent_key TEXT, created_by TEXT,
      last_active_at TEXT NOT NULL DEFAULT (datetime('now')), last_active_unix INTEGER NOT NULL DEFAULT (unixepoch()),
      created_at TEXT NOT NULL DEFAULT (datetime('now')), created_at_unix INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(id,account_id)
    );
    INSERT INTO agentsam_conversations (id,account_id,title,status,source,message_count,r2_thread_key)
      VALUES ('compact-chat','acct-a','Compact schema chat','active','admin_agentsam',3,'threads/compact.jsonl');
    CREATE TABLE agentsam_attachments (
      id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), conversation_id TEXT,
      uploaded_by TEXT, file_name TEXT NOT NULL, mime_type TEXT NOT NULL,
      file_size_bytes INTEGER NOT NULL, r2_key TEXT NOT NULL UNIQUE, preview_url TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ready', created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (conversation_id,account_id) REFERENCES agentsam_conversations(id,account_id)
    );
    INSERT INTO agentsam_attachments
      (id,account_id,conversation_id,uploaded_by,file_name,mime_type,file_size_bytes,r2_key,preview_url)
      VALUES ('compact-file','acct-a','compact-chat','user-a','document.pdf','application/pdf',512,
        'r2/compact.pdf','/media/compact.pdf');
    `);

    db.exec(consolidate);
    const session = db.prepare("SELECT account_id,title,message_count,r2_messages_key FROM agentsam_chat_sessions WHERE conversation_id='compact-chat'").get();
    assert.deepEqual({ ...session }, {
      account_id: "acct-a", title: "Compact schema chat", message_count: 3,
      r2_messages_key: "threads/compact.jsonl",
    });
    const attachment = db.prepare("SELECT account_id,conversation_id,file_name,mime_type,file_size_bytes,r2_key,preview_url FROM agentsam_attachments WHERE id='compact-file'").get();
    assert.deepEqual({ ...attachment }, {
      account_id: "acct-a", conversation_id: "compact-chat", file_name: "document.pdf",
      mime_type: "application/pdf", file_size_bytes: 512, r2_key: "r2/compact.pdf",
      preview_url: "/media/compact.pdf",
    });
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='agentsam_conversations'").get().n, 0);
  } finally {
    db.close();
  }
});

test("consolidation supports the richer attachment schema and detaches orphan conversation links", () => {
  const db = makeBase();
  try {
    db.exec(`CREATE TABLE agentsam_chat_sessions (
      conversation_id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), title TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()), updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      latest_digest_r2_key TEXT, digest_count INTEGER NOT NULL DEFAULT 0, last_compacted_at INTEGER,
      is_starred INTEGER NOT NULL DEFAULT 0, project_id TEXT, message_count INTEGER NOT NULL DEFAULT 1,
      r2_messages_key TEXT, r2_meta_key TEXT, total_tokens_in INTEGER NOT NULL DEFAULT 0,
      total_tokens_out INTEGER NOT NULL DEFAULT 0, last_model_key TEXT, last_turn_status TEXT,
      last_turn_error TEXT, last_turn_at INTEGER, artifact_count INTEGER NOT NULL DEFAULT 0,
      session_kind TEXT NOT NULL DEFAULT 'chat', parent_conversation_id TEXT,
      expires_at INTEGER, state TEXT NOT NULL DEFAULT 'active', state_changed_at INTEGER NOT NULL DEFAULT 0,
      storage_bytes INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE agentsam_conversations (
      id TEXT PRIMARY KEY, account_id TEXT NOT NULL, title TEXT NOT NULL, summary TEXT, status TEXT NOT NULL,
      source TEXT NOT NULL, workflow_key TEXT, last_message_preview TEXT, last_model_id TEXT,
      message_count INTEGER, tool_call_count INTEGER, attachment_count INTEGER, r2_thread_key TEXT,
      r2_summary_key TEXT, kv_recent_key TEXT, created_by TEXT, last_active_at TEXT,
      last_active_unix INTEGER, created_at TEXT, created_at_unix INTEGER, updated_at TEXT
    );
    INSERT INTO agentsam_conversations VALUES
      ('conv-rich','acct-a','Rich','summary','active','admin_agentsam',NULL,NULL,NULL,1,0,0,'thread/rich','digest/rich',NULL,NULL,NULL,200,100,NULL,200);
    CREATE TABLE agentsam_attachments (
      id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), conversation_id TEXT,
      message_id TEXT, uploaded_by TEXT, file_name TEXT NOT NULL, mime_type TEXT,
      file_size_bytes INTEGER DEFAULT 0, r2_key TEXT NOT NULL UNIQUE, preview_url TEXT,
      image_width INTEGER, image_height INTEGER, status TEXT NOT NULL DEFAULT 'ready',
      metadata_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at_unix INTEGER NOT NULL DEFAULT (unixepoch())
    );
    INSERT INTO agentsam_attachments
      (id,account_id,conversation_id,message_id,uploaded_by,file_name,mime_type,file_size_bytes,r2_key,
       preview_url,image_width,image_height,status,metadata_json,created_at,created_at_unix)
      VALUES ('rich-file','acct-a','conv-rich',NULL,'user-a','photo.png','image/png',88,
        'r2/photo.png','/media/photo.png',NULL,NULL,'ready','{}','2026-01-01 00:00:00',1767225600),
        ('orphan-file','acct-a','missing-session',NULL,'user-a','orphan.png','image/png',44,
        'r2/orphan.png','/media/orphan.png',NULL,NULL,'ready','{}','2026-01-02 00:00:00',1767312000);
    CREATE TABLE agentsam_conversation_shares (
      id TEXT PRIMARY KEY, account_id TEXT NOT NULL, conversation_id TEXT NOT NULL, token TEXT NOT NULL,
      title TEXT NOT NULL, snapshot_json TEXT NOT NULL, created_at INTEGER NOT NULL, revoked_at INTEGER
    );`);

    db.exec(consolidate);
    const attachment = db.prepare("SELECT * FROM agentsam_attachments WHERE id='rich-file'").get();
    assert.equal(attachment.r2_key, "r2/photo.png");
    assert.equal(attachment.image_width, null);
    assert.equal(attachment.image_height, null);
    assert.equal(attachment.message_id, null);
    assert.equal(attachment.metadata_json, "{}");
    assert.equal(attachment.created_at_unix, 1767225600);
    assert.equal(attachment.conversation_id, "conv-rich");
    const orphan = db.prepare("SELECT * FROM agentsam_attachments WHERE id='orphan-file'").get();
    assert.equal(orphan.r2_key, "r2/orphan.png");
    assert.equal(orphan.conversation_id, null); // no matching canonical session: safely detached
    assert.equal(orphan.image_width, null);
    assert.equal(orphan.metadata_json, "{}");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM agentsam_chat_sessions WHERE conversation_id='conv-rich'").get().n, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='agentsam_conversations'").get().n, 0);
  } finally {
    db.close();
  }
});
