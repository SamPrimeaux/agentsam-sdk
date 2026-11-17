/**
 * Canonical AgentSam chat-session and conversation-share persistence.
 *
 * agentsam_chat_sessions owns account-scoped identity, lifecycle, counters,
 * model/turn status and transcript/digest object keys. The CMS assistant is a
 * consumer of this spine; it does not create a parallel conversation table.
 * agentsam_conversation_shares owns immutable public snapshots and revocation.
 *
 * Every owner-scoped operation receives the authenticated accounts.id from
 * its caller. Never accept account ownership from request data.
 */

const SESSION_KINDS = new Set(["chat", "side_chat", "subagent"]);
const SESSION_STATES = new Set(["active", "archived", "trashed"]);

function required(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new TypeError(`${name}_required`);
  return normalized;
}

function safeLimit(value, fallback = 50, max = 100) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(1, Math.min(max, Math.trunc(number))) : fallback;
}

function changed(result) {
  return Number(result?.meta?.changes ?? result?.changes ?? 0) > 0;
}

function validateKind(value = "chat") {
  const kind = String(value || "chat").trim();
  if (!SESSION_KINDS.has(kind)) throw new TypeError("invalid_session_kind");
  return kind;
}

function validateState(value = "active") {
  const state = String(value || "active").trim();
  if (!SESSION_STATES.has(state)) throw new TypeError("invalid_session_state");
  return state;
}

/** All CMS assistant transcript and digest keys are derived from the canonical session ID. */
export function chatSessionR2Keys(conversationId) {
  const id = required(conversationId, "conversation_id");
  return {
    messages: `agentsam/thread-payloads/${id}/messages.jsonl`,
    digest: `agentsam/thread-summaries/${id}/latest.json`,
  };
}

export async function createChatSession(db, {
  conversationId,
  accountId,
  title,
  sessionKind = "chat",
  parentConversationId = null,
  expiresAt = null,
  now = Math.floor(Date.now() / 1000),
} = {}) {
  const id = required(conversationId, "conversation_id");
  const account = required(accountId, "account_id");
  const safeTitle = required(title, "title").slice(0, 160);
  const kind = validateKind(sessionKind);
  const keys = chatSessionR2Keys(id);
  await db.prepare(`INSERT INTO agentsam_chat_sessions
    (conversation_id, account_id, title, created_at, updated_at,
     latest_digest_r2_key, message_count, r2_messages_key, session_kind,
     parent_conversation_id, expires_at, state, state_changed_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, 'active', ?)`)
    .bind(id, account, safeTitle, Math.trunc(now), Math.trunc(now), keys.digest,
      keys.messages, kind, parentConversationId || null,
      expiresAt == null ? null : Math.trunc(Number(expiresAt)), Math.trunc(now))
    .run();
  return getChatSession(db, account, id);
}

export async function getChatSession(db, accountId, conversationId) {
  const account = required(accountId, "account_id");
  const id = required(conversationId, "conversation_id");
  return db.prepare(`SELECT conversation_id, account_id, title, created_at, updated_at,
      latest_digest_r2_key, digest_count, last_compacted_at, is_starred, project_id,
      message_count, r2_messages_key, r2_meta_key, total_tokens_in, total_tokens_out,
      last_model_key, last_turn_status, last_turn_error, last_turn_at, artifact_count,
      session_kind, parent_conversation_id, expires_at, state, state_changed_at, storage_bytes
    FROM agentsam_chat_sessions
    WHERE conversation_id = ? AND account_id = ? LIMIT 1`)
    .bind(id, account)
    .first();
}

/** Account-wide sidebar projection. Expiry, not a legacy lifecycle flag, defines durability. */
export async function listChatSessions(db, accountId, {
  state = "active",
  sessionKind = "chat",
  durableOnly = true,
  query = "",
  since = 0,
  sort = "newest",
  limit = 50,
  offset = 0,
  parentConversationId = null,
} = {}) {
  const account = required(accountId, "account_id");
  const currentState = validateState(state);
  const kind = validateKind(sessionKind);
  const where = ["account_id = ?", "state = ?", "session_kind = ?"];
  const binds = [account, currentState, kind];
  if (durableOnly) where.push("expires_at IS NULL");
  if (parentConversationId) {
    where.push("parent_conversation_id = ?");
    binds.push(required(parentConversationId, "parent_conversation_id"));
  }
  const q = String(query || "").trim().slice(0, 100);
  if (q) {
    where.push("title LIKE ? ESCAPE '\\'");
    binds.push(`%${q.replace(/[\\%_]/g, "\\$&")}%`);
  }
  const timestamp = Math.max(0, Math.min(9999999999, Number(since) || 0));
  if (timestamp) {
    where.push("updated_at >= ?");
    binds.push(Math.trunc(timestamp));
  }
  const order = sort === "oldest" ? "ASC" : "DESC";
  const rows = await db.prepare(`SELECT conversation_id AS id, title,
      project_id AS projectId, is_starred AS pinned, updated_at AS updatedAt,
      created_at AS createdAt, message_count AS messageCount,
      artifact_count AS artifactCount, last_turn_status AS lastTurnStatus,
      last_model_key AS lastModelKey, state, session_kind AS kind,
      parent_conversation_id AS parentConversationId, expires_at AS expiresAt
    FROM agentsam_chat_sessions
    WHERE ${where.join(" AND ")}
    ORDER BY updated_at ${order}, conversation_id ${order}
    LIMIT ? OFFSET ?`)
    .bind(...binds, safeLimit(limit, 50, 101), Math.max(0, Math.trunc(Number(offset) || 0)))
    .all();
  return rows.results || [];
}

/** Only canonical session metadata can be changed through Studio history. */
export async function updateChatSession(db, accountId, conversationId, patch = {}) {
  const account = required(accountId, "account_id");
  const id = required(conversationId, "conversation_id");
  const fields = [];
  const values = [];
  if (Object.hasOwn(patch, "title")) {
    const title = String(patch.title ?? "").trim().slice(0, 160);
    if (!title) throw new TypeError("title_required");
    fields.push("title = ?"); values.push(title);
  }
  if (Object.hasOwn(patch, "pinned")) {
    fields.push("is_starred = ?"); values.push(patch.pinned ? 1 : 0);
  }
  if (Object.hasOwn(patch, "state")) {
    fields.push("state = ?", "state_changed_at = unixepoch()");
    values.push(validateState(patch.state));
  }
  if (Object.hasOwn(patch, "projectId")) {
    const projectId = patch.projectId == null ? null : String(patch.projectId).trim().slice(0, 128);
    fields.push("project_id = ?"); values.push(projectId || null);
  }
  if (!fields.length) return false;
  fields.push("updated_at = unixepoch()");
  const result = await db.prepare(`UPDATE agentsam_chat_sessions
    SET ${fields.join(", ")}
    WHERE conversation_id = ? AND account_id = ?`)
    .bind(...values, id, account)
    .run();
  return changed(result);
}

/** Transcript appenders update the canonical session row, never a CMS shadow record. */
export async function touchChatSession(db, accountId, conversationId, {
  title = null,
  lastModelKey = null,
  messageDelta = 0,
  now = Math.floor(Date.now() / 1000),
} = {}) {
  const account = required(accountId, "account_id");
  const id = required(conversationId, "conversation_id");
  const result = await db.prepare(`UPDATE agentsam_chat_sessions SET
      title = COALESCE(?, title),
      last_model_key = COALESCE(?, last_model_key),
      message_count = message_count + ?,
      updated_at = ?,
      last_turn_at = ?
    WHERE conversation_id = ? AND account_id = ? AND state != 'trashed'
      AND session_kind = 'chat' AND expires_at IS NULL`)
    .bind(title, lastModelKey, Math.max(0, Math.trunc(Number(messageDelta) || 0)),
      Math.trunc(now), Math.trunc(now), id, account)
    .run();
  return changed(result);
}

export async function trashChatSession(db, accountId, conversationId) {
  const account = required(accountId, "account_id");
  const id = required(conversationId, "conversation_id");
  const result = await db.prepare(`UPDATE agentsam_chat_sessions
    SET state = 'trashed', state_changed_at = unixepoch(), updated_at = unixepoch()
    WHERE conversation_id = ? AND account_id = ? AND session_kind = 'chat'`)
    .bind(id, account)
    .run();
  return changed(result);
}

export async function listChatSessionCompactionCandidates(db, accountId, limit = 10) {
  const account = required(accountId, "account_id");
  const rows = await db.prepare(`SELECT conversation_id AS id, title,
      r2_messages_key AS r2_thread_key,
      latest_digest_r2_key AS r2_summary_key,
      message_count, updated_at AS last_active_unix
    FROM agentsam_chat_sessions
    WHERE account_id = ? AND state = 'active'
      AND session_kind = 'chat' AND expires_at IS NULL AND message_count > 0
    ORDER BY updated_at DESC LIMIT ?`)
    .bind(account, safeLimit(limit, 10, 100))
    .all();
  return rows.results || [];
}

export async function recordChatSessionCompaction(db, accountId, conversationId) {
  const account = required(accountId, "account_id");
  const id = required(conversationId, "conversation_id");
  const result = await db.prepare(`UPDATE agentsam_chat_sessions
    SET last_compacted_at = unixepoch(), digest_count = digest_count + 1
    WHERE conversation_id = ? AND account_id = ? AND state = 'active'
      AND session_kind = 'chat' AND expires_at IS NULL`)
    .bind(id, account)
    .run();
  return changed(result);
}

/** Insert only when the target session belongs to the authenticated account. */
export async function createConversationShare(db, {
  id,
  accountId,
  conversationId,
  token,
  title,
  snapshotJson,
} = {}) {
  const shareId = required(id, "share_id");
  const account = required(accountId, "account_id");
  const conversation = required(conversationId, "conversation_id");
  const shareToken = required(token, "share_token");
  const shareTitle = required(title, "share_title");
  const snapshot = required(snapshotJson, "snapshot_json");
  const result = await db.prepare(`INSERT INTO agentsam_conversation_shares
    (id, account_id, conversation_id, token, title, snapshot_json)
    SELECT ?, s.account_id, s.conversation_id, ?, ?, ?
    FROM agentsam_chat_sessions s
    WHERE s.conversation_id = ? AND s.account_id = ?
      AND s.expires_at IS NULL AND s.state != 'trashed'`)
    .bind(shareId, shareToken, shareTitle, snapshot, conversation, account)
    .run();
  return changed(result);
}

export async function listConversationShares(db, accountId, {
  conversationId = null,
  includeRevoked = false,
  limit = 50,
} = {}) {
  const account = required(accountId, "account_id");
  const where = ["account_id = ?"];
  const binds = [account];
  if (conversationId) {
    where.push("conversation_id = ?");
    binds.push(required(conversationId, "conversation_id"));
  }
  if (!includeRevoked) where.push("revoked_at IS NULL");
  const rows = await db.prepare(`SELECT id, conversation_id, token, title, created_at, revoked_at
    FROM agentsam_conversation_shares
    WHERE ${where.join(" AND ")}
    ORDER BY created_at DESC, id DESC LIMIT ?`)
    .bind(...binds, safeLimit(limit, 50, 100))
    .all();
  return rows.results || [];
}

export async function revokeConversationShare(db, accountId, shareId) {
  const account = required(accountId, "account_id");
  const id = required(shareId, "share_id");
  const result = await db.prepare(`UPDATE agentsam_conversation_shares
    SET revoked_at = unixepoch()
    WHERE id = ? AND account_id = ? AND revoked_at IS NULL`)
    .bind(id, account)
    .run();
  return changed(result);
}

/** Public capability lookup deliberately has no account/session join. */
export async function getPublicConversationShare(db, token) {
  const shareToken = required(token, "share_token");
  return db.prepare(`SELECT title, snapshot_json
    FROM agentsam_conversation_shares
    WHERE token = ? AND revoked_at IS NULL LIMIT 1`)
    .bind(shareToken)
    .first();
}
