import assert from "node:assert/strict";
import test from "node:test";
import { createSqliteD1 } from "./work-sqlite-d1.js";
import { handleStudioChatHistory } from "./studio-chat-history.js";
import {
  handlePublicConversationShare,
  handleStudioConversationShares,
} from "./studio-conversation-shares.js";

const schema = `
CREATE TABLE accounts (id TEXT PRIMARY KEY);
CREATE TABLE projects (id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL);
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
  storage_bytes INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_chat_sessions_account_updated ON agentsam_chat_sessions(account_id,state,updated_at DESC);
CREATE INDEX idx_chat_sessions_parent ON agentsam_chat_sessions(parent_conversation_id) WHERE parent_conversation_id IS NOT NULL;
CREATE INDEX idx_chat_sessions_expires ON agentsam_chat_sessions(expires_at) WHERE expires_at IS NOT NULL;
CREATE TABLE agentsam_conversation_shares (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL REFERENCES agentsam_chat_sessions(conversation_id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json)),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  revoked_at INTEGER
);
CREATE INDEX idx_conv_shares_account ON agentsam_conversation_shares(account_id,created_at DESC);
CREATE INDEX idx_conv_shares_conversation ON agentsam_conversation_shares(conversation_id);
`;

async function setupDb() {
  const db = createSqliteD1();
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(schema);
  await db.prepare("INSERT INTO accounts(id) VALUES (?), (?)").bind("acct-a", "acct-b").run();
  await db.prepare("INSERT INTO projects(id,owner_user_id) VALUES (?,?)").bind("project-a", "acct-a").run();
  await db.prepare(`INSERT INTO agentsam_chat_sessions
    (conversation_id,account_id,title,message_count,r2_messages_key)
    VALUES ('conv-a','acct-a','Account A chat',2,'agentsam/thread-payloads/conv-a/messages.jsonl'),
           ('conv-b','acct-b','Account B chat',1,'agentsam/thread-payloads/conv-b/messages.jsonl'),
           ('side-a','acct-a','Temporary drawer','0',NULL)`)
    .run();
  await db.prepare("UPDATE agentsam_chat_sessions SET session_kind='side_chat',expires_at=9999999999 WHERE conversation_id='side-a'").run();
  return db;
}

test("Studio history reads canonical account_id sessions and updates state without legacy columns", async () => {
  const db = await setupDb();
  try {
    const list = await handleStudioChatHistory(
      new Request("https://agentsam.inneranimalmedia.com/api/studio/chats"),
      { DB: db },
      "acct-a",
    );
    const body = await list.json();
    assert.deepEqual(body.chats.map((chat) => chat.id), ["conv-a"]);
    assert.equal(body.chats[0].pinned, false);
    assert.equal("r2MessagesKey" in body.chats[0], false);

    const privateLookup = await handleStudioChatHistory(
      new Request("https://agentsam.inneranimalmedia.com/api/studio/chats/conv-b"),
      { DB: db },
      "acct-a",
    );
    assert.equal(privateLookup.status, 404);

    const patch = await handleStudioChatHistory(new Request(
      "https://agentsam.inneranimalmedia.com/api/studio/chats/conv-a",
      { method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ pinned: true, state: "archived", projectId: "project-a" }) },
    ), { DB: db }, "acct-a");
    assert.equal(patch.status, 200);
    const row = await db.prepare("SELECT * FROM agentsam_chat_sessions WHERE conversation_id=?").bind("conv-a").first();
    assert.equal(row.is_starred, 1);
    assert.equal(row.state, "archived");
    assert.equal(row.project_id, "project-a");
    assert.equal("is_archived" in row, false);
    assert.equal("lifecycle" in row, false);

    const restore = await handleStudioChatHistory(new Request(
      "https://agentsam.inneranimalmedia.com/api/studio/chats/conv-a",
      { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ state: "active" }) },
    ), { DB: db }, "acct-a");
    assert.equal(restore.status, 200);

    const deleted = await handleStudioChatHistory(new Request(
      "https://agentsam.inneranimalmedia.com/api/studio/chats/conv-a", { method: "DELETE" },
    ), { DB: db }, "acct-a");
    assert.equal(deleted.status, 200);
    const trashed = await db.prepare("SELECT state FROM agentsam_chat_sessions WHERE conversation_id=?").bind("conv-a").first();
    assert.equal(trashed.state, "trashed");
  } finally {
    db.close();
  }
});

test("Studio message reads use the authenticated IAM session and then the canonical R2 key", async () => {
  const db = await setupDb();
  try {
    let forwardedCookie = null;
    const env = { DB: db, IAM_API: { fetch: async (request) => {
      forwardedCookie = request.headers.get("cookie");
      return Response.json([{ role: "assistant", content: "Live account transcript" }]);
    } } };
    const response = await handleStudioChatHistory(new Request(
      "https://agentsam.inneranimalmedia.com/api/studio/chats/conv-a/messages",
      { headers: { cookie: "iam_session=verified" } },
    ), env, "acct-a");
    const body = await response.json();
    assert.equal(forwardedCookie, "iam_session=verified");
    assert.equal(body.source, "account");
    assert.equal(body.messages[0].content, "Live account transcript");
  } finally {
    db.close();
  }
});

test("sharing snapshots are built from the owned session transcript and revoke to the same public 404", async () => {
  const db = await setupDb();
  try {
    const origin = "https://agentsam.inneranimalmedia.com";
    const messages = [
      { role: "user", content: "Actual user message" },
      { role: "assistant", content: "Actual assistant response" },
    ];
    const env = { DB: db, IAM_API: { fetch: async () => Response.json(messages) } };
    const create = await handleStudioConversationShares(new Request(`${origin}/api/studio/conversation-shares`, {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({
        conversationId: "conv-a",
        title: "Forged client title",
        messages: [{ role: "assistant", content: "Forged client transcript" }],
      }),
    }), env, "acct-a", new URL(`${origin}/api/studio/conversation-shares`));
    assert.equal(create.status, 201);
    const created = await create.json();
    const token = new URL(created.link.url).pathname.split("/").pop();
    const shareRow = await db.prepare("SELECT account_id,conversation_id,title,snapshot_json FROM agentsam_conversation_shares WHERE id=?")
      .bind(created.link.id).first();
    assert.equal(shareRow.account_id, "acct-a");
    assert.equal(shareRow.conversation_id, "conv-a");
    assert.equal(shareRow.title, "Account A chat");
    assert.match(shareRow.snapshot_json, /Actual assistant response/);
    assert.doesNotMatch(shareRow.snapshot_json, /Forged client/);

    const publicPage = await handlePublicConversationShare(new Request(`${origin}/share/${token}`), env, token);
    assert.equal(publicPage.status, 200);
    const html = await publicPage.text();
    assert.match(html, /Actual user message/);
    assert.match(html, /Actual assistant response/);
    assert.doesNotMatch(html, /Forged client/);

    const list = await handleStudioConversationShares(new Request(
      `${origin}/api/studio/conversation-shares?conversation_id=conv-a`,
    ), env, "acct-a", new URL(`${origin}/api/studio/conversation-shares?conversation_id=conv-a`));
    assert.equal((await list.json()).links.length, 1);

    const otherAccountAttempt = await handleStudioConversationShares(new Request(`${origin}/api/studio/conversation-shares`, {
      method: "POST", headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ conversationId: "conv-b" }),
    }), env, "acct-a", new URL(`${origin}/api/studio/conversation-shares`));
    assert.equal(otherAccountAttempt.status, 404);

    const revoke = await handleStudioConversationShares(new Request(
      `${origin}/api/studio/conversation-shares/${created.link.id}`, { method: "DELETE", headers: { origin } },
    ), env, "acct-a", new URL(`${origin}/api/studio/conversation-shares/${created.link.id}`));
    assert.equal(revoke.status, 200);
    const afterRevoke = await handlePublicConversationShare(new Request(`${origin}/share/${token}`), env, token);
    assert.equal(afterRevoke.status, 404);
  } finally {
    db.close();
  }
});
