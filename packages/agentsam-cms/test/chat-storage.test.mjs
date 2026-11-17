import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  chatSessionR2Keys,
  createChatSession,
  createConversationShare,
  getChatSession,
  getPublicConversationShare,
  listChatSessions,
  listChatSessionCompactionCandidates,
  listConversationShares,
  recordChatSessionCompaction,
  revokeConversationShare,
  touchChatSession,
  trashChatSession,
  updateChatSession,
} from "../src/chat-storage.js";

const schema = `
PRAGMA foreign_keys = ON;
CREATE TABLE accounts (id TEXT PRIMARY KEY);
CREATE TABLE agentsam_chat_sessions (
  conversation_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  latest_digest_r2_key TEXT,
  digest_count INTEGER NOT NULL DEFAULT 0,
  last_compacted_at INTEGER,
  is_starred INTEGER NOT NULL DEFAULT 0,
  project_id TEXT,
  message_count INTEGER NOT NULL DEFAULT 1,
  r2_messages_key TEXT,
  r2_meta_key TEXT,
  total_tokens_in INTEGER NOT NULL DEFAULT 0,
  total_tokens_out INTEGER NOT NULL DEFAULT 0,
  last_model_key TEXT,
  last_turn_status TEXT,
  last_turn_error TEXT,
  last_turn_at INTEGER,
  artifact_count INTEGER NOT NULL DEFAULT 0,
  session_kind TEXT NOT NULL DEFAULT 'chat',
  parent_conversation_id TEXT REFERENCES agentsam_chat_sessions(conversation_id) ON DELETE SET NULL,
  expires_at INTEGER,
  state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active','archived','trashed')),
  state_changed_at INTEGER NOT NULL DEFAULT 0,
  storage_bytes INTEGER NOT NULL DEFAULT 0,
  UNIQUE(conversation_id, account_id)
);
CREATE INDEX idx_chat_sessions_account_updated ON agentsam_chat_sessions(account_id,state,updated_at DESC);
CREATE INDEX idx_chat_sessions_parent ON agentsam_chat_sessions(parent_conversation_id) WHERE parent_conversation_id IS NOT NULL;
CREATE INDEX idx_chat_sessions_expires ON agentsam_chat_sessions(expires_at) WHERE expires_at IS NOT NULL;
CREATE TABLE agentsam_conversation_shares (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json)),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  revoked_at INTEGER,
  FOREIGN KEY (conversation_id, account_id) REFERENCES agentsam_chat_sessions(conversation_id, account_id) ON DELETE CASCADE
);
CREATE INDEX idx_conv_shares_conversation ON agentsam_conversation_shares(conversation_id);
CREATE INDEX idx_conv_shares_account ON agentsam_conversation_shares(account_id,created_at DESC);
`;

function createD1() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(schema);
  const prepare = (sql) => {
    const make = (values = []) => ({
      bind: (...next) => make(next),
      all: async () => ({ results: sqlite.prepare(sql).all(...values) }),
      first: async () => sqlite.prepare(sql).get(...values) ?? null,
      run: async () => {
        const result = sqlite.prepare(sql).run(...values);
        return { success: true, meta: { changes: Number(result.changes) } };
      },
    });
    return make();
  };
  return {
    prepare,
    batch: async (statements) => {
      sqlite.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
    exec: (sql) => sqlite.exec(sql),
    close: () => sqlite.close(),
  };
}

test("CMS assistant sessions use the canonical account-owned session row", async () => {
  const db = createD1();
  try {
    db.exec("INSERT INTO accounts(id) VALUES ('acct-a'),('acct-b')");
    const session = await createChatSession(db, {
      conversationId: "conv_a1",
      accountId: "acct-a",
      title: "A canonical title",
      sessionKind: "chat",
      now: 100,
    });
    assert.equal(session.conversation_id, "conv_a1");
    assert.equal(session.account_id, "acct-a");
    assert.equal(session.title, "A canonical title");
    assert.equal(session.message_count, 0);
    assert.equal(session.r2_messages_key, "agentsam/thread-payloads/conv_a1/messages.jsonl");
    assert.equal(session.latest_digest_r2_key, "agentsam/thread-summaries/conv_a1/latest.json");
    assert.equal(await getChatSession(db, "acct-b", "conv_a1"), null);

    const active = await listChatSessions(db, "acct-a", { state: "active", sessionKind: "chat" });
    assert.equal(active.length, 1);
    assert.equal(active[0].id, "conv_a1");

    assert.equal(await touchChatSession(db, "acct-a", "conv_a1", {
      title: "Updated title", lastModelKey: "model-key", messageDelta: 2, now: 200,
    }), true);
    let updated = await getChatSession(db, "acct-a", "conv_a1");
    assert.equal(updated.title, "Updated title");
    assert.equal(updated.message_count, 2);
    assert.equal(updated.last_model_key, "model-key");

    const candidates = await listChatSessionCompactionCandidates(db, "acct-a", 10);
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].r2_thread_key, updated.r2_messages_key);
    assert.equal(await recordChatSessionCompaction(db, "acct-a", "conv_a1"), true);
    updated = await getChatSession(db, "acct-a", "conv_a1");
    assert.equal(updated.digest_count, 1);
    assert.ok(updated.last_compacted_at);

    assert.equal(await updateChatSession(db, "acct-a", "conv_a1", { pinned: true, state: "archived" }), true);
    updated = await getChatSession(db, "acct-a", "conv_a1");
    assert.equal(updated.is_starred, 1);
    assert.equal(updated.state, "archived");
    assert.equal("is_archived" in updated, false);
    assert.equal("lifecycle" in updated, false);

    assert.equal(await trashChatSession(db, "acct-a", "conv_a1"), true);
    assert.equal((await getChatSession(db, "acct-a", "conv_a1")).state, "trashed");
  } finally {
    db.close();
  }
});

test("durability and history are scoped to the account and expiry, not a duplicate lifecycle flag", async () => {
  const db = createD1();
  try {
    db.exec("INSERT INTO accounts(id) VALUES ('acct-a'),('acct-b')");
    db.exec(`INSERT INTO agentsam_chat_sessions (conversation_id,account_id,title,session_kind,expires_at)
      VALUES ('durable-a','acct-a','Durable A','chat',NULL),
             ('temporary-a','acct-a','Temporary A','side_chat',9999999999),
             ('durable-b','acct-b','Durable B','chat',NULL)`);
    const rows = await listChatSessions(db, "acct-a", { state: "active", sessionKind: "chat", durableOnly: true });
    assert.deepEqual(rows.map((row) => row.id), ["durable-a"]);
    assert.equal(await getChatSession(db, "acct-a", "durable-b"), null);
    assert.equal(await updateChatSession(db, "acct-a", "durable-a", { pinned: true, state: "archived" }), true);
    const archived = await getChatSession(db, "acct-a", "durable-a");
    assert.equal(archived.is_starred, 1);
    assert.equal(archived.state, "archived");
    assert.equal("is_archived" in archived, false);
    assert.equal("lifecycle" in archived, false);
    assert.throws(() => chatSessionR2Keys(""), /conversation_id_required/);
  } finally {
    db.close();
  }
});

test("share snapshots are inserted, listed and revoked through canonical account ownership", async () => {
  const db = createD1();
  try {
    db.exec("INSERT INTO accounts(id) VALUES ('acct-a'),('acct-b')");
    await createChatSession(db, { conversationId: "conv-a", accountId: "acct-a", title: "Private title" });
    await createChatSession(db, { conversationId: "conv-b", accountId: "acct-b", title: "Other title" });
    const snapshotJson = JSON.stringify({ title: "Private title", messages: [{ role: "user", content: "Hello" }] });
    assert.equal(await createConversationShare(db, {
      id: "share-bad", accountId: "acct-a", conversationId: "conv-b",
      token: "token-bad", title: "Private title", snapshotJson,
    }), false);
    assert.equal(await createConversationShare(db, {
      id: "share-a", accountId: "acct-a", conversationId: "conv-a",
      token: "token-good", title: "Private title", snapshotJson,
    }), true);
    const publicShare = await getPublicConversationShare(db, "token-good");
    assert.equal(publicShare.title, "Private title");
    assert.equal(publicShare.snapshot_json, snapshotJson);
    assert.equal(await getPublicConversationShare(db, "token-bad"), null);
    assert.equal((await listConversationShares(db, "acct-b")).length, 0);
    assert.equal((await listConversationShares(db, "acct-a", { conversationId: "conv-a" })).length, 1);
    assert.equal(await revokeConversationShare(db, "acct-b", "share-a"), false);
    assert.equal(await revokeConversationShare(db, "acct-a", "share-a"), true);
    assert.equal(await getPublicConversationShare(db, "token-good"), null);
    assert.equal((await listConversationShares(db, "acct-a")).length, 0);
    assert.equal((await listConversationShares(db, "acct-a", { includeRevoked: true }))[0].revoked_at > 0, true);
    await db.prepare("DELETE FROM agentsam_chat_sessions WHERE conversation_id = ? AND account_id = ?")
      .bind("conv-a", "acct-a").run();
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM agentsam_conversation_shares").first()).n, 0);
  } finally {
    db.close();
  }
});
