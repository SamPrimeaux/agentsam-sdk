/**
 * CMS assistant conversation facade over the canonical AgentSam chat spine.
 *
 * This module does not own a conversation table. agentsam_chat_sessions is the
 * sole D1 authority for identity, account ownership, lifecycle, title, counters,
 * model state and R2 transcript/digest pointers. R2 holds the transcript and
 * derived digest. agentsam_conversation_shares owns public snapshots.
 */

import { requireApplicationAccountId } from "../lib/account-context.js";
import { getSessionUser } from "../lib/auth.js";
import {
  chatSessionR2Keys,
  createChatSession,
  getChatSession,
  listChatSessions,
  trashChatSession,
  touchChatSession,
  updateChatSession,
} from "@inneranimalmedia/agentsam-cms/chat-storage";

const RECENT_LIMIT = 20;
const PREVIEW_MAX = 120;

function json(data, init = {}) {
  return Response.json(data, init);
}

function titleFromMessage(text) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  if (!s) return "Untitled";
  return s.length <= 60 ? s : `${s.slice(0, 57)}…`;
}

function previewText(text) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  return s.length <= PREVIEW_MAX ? s : `${s.slice(0, PREVIEW_MAX - 1)}…`;
}

function parseJsonl(contents) {
  return String(contents || "").split("\n").filter(Boolean).flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

function sessionProjection(session) {
  if (!session) return null;
  const state = session.state || "active";
  return {
    id: session.conversation_id,
    account_id: session.account_id,
    title: session.title,
    status: state === "trashed" ? "deleted" : state,
    state,
    source: "admin_agentsam",
    last_model_id: session.last_model_key || null,
    message_count: session.message_count,
    r2_thread_key: session.r2_messages_key,
    r2_summary_key: session.latest_digest_r2_key,
    last_active_unix: session.updated_at,
    last_active_at: new Date(Number(session.updated_at) * 1000).toISOString(),
    created_at_unix: session.created_at,
    created_at: new Date(Number(session.created_at) * 1000).toISOString(),
    updated_at: new Date(Number(session.updated_at) * 1000).toISOString(),
    pinned: Boolean(session.is_starred),
    project_id: session.project_id || null,
  };
}

async function readSessionMessages(env, session) {
  if (!env?.WEBSITE_ASSETS || !session?.r2_messages_key) return [];
  try {
    const object = await env.WEBSITE_ASSETS.get(session.r2_messages_key);
    if (!object) return [];
    const contents = await object.text();
    try {
      const parsed = JSON.parse(contents);
      if (Array.isArray(parsed)) return parsed;
      if (Array.isArray(parsed?.messages)) return parsed.messages;
    } catch { /* JSONL is the canonical thread format. */ }
    return parseJsonl(contents);
  } catch (error) {
    console.warn("agentsam_thread_read_failed", String(error?.message || error).slice(0, 140));
    return [];
  }
}

async function readSessionDigest(env, session) {
  if (!env?.WEBSITE_ASSETS || !session?.latest_digest_r2_key) return "";
  try {
    const object = await env.WEBSITE_ASSETS.get(session.latest_digest_r2_key);
    if (!object) return "";
    const contents = await object.text();
    try {
      const parsed = JSON.parse(contents);
      return String(parsed?.summary || "").slice(0, 4000);
    } catch {
      return contents.slice(0, 4000);
    }
  } catch {
    return "";
  }
}

/**
 * Resolve a conversation only through the authenticated account's canonical
 * session row. Optional R2 enrichment is derived data, never a second registry.
 */
export async function getConversation(env, id, { includeR2 = false, includeMessages = false } = {}) {
  if (!env?.DB || !id) return null;
  const session = await getChatSession(env.DB, requireApplicationAccountId(), id);
  if (!session || session.session_kind !== "chat" || session.expires_at != null || session.state === "trashed") {
    return null;
  }
  const conversation = sessionProjection(session);
  if (!includeR2 && !includeMessages) return conversation;

  const messages = await readSessionMessages(env, session);
  const latest = messages.at(-1) || null;
  const latestContent = typeof latest?.content === "string" ? latest.content : "";
  conversation.last_message_preview = previewText(latestContent);
  conversation.workflow_key = latest?.workflow_key || null;
  conversation.summary = await readSessionDigest(env, session);
  if (includeMessages) conversation.messages = messages;
  return conversation;
}

export async function listConversations(env, { limit = RECENT_LIMIT, status = "active" } = {}) {
  if (!env?.DB) return [];
  try {
    const state = status === "deleted" ? "trashed" : status;
    const rows = await listChatSessions(env.DB, requireApplicationAccountId(), {
      state,
      sessionKind: "chat",
      durableOnly: true,
      limit: Math.min(100, Math.max(1, Number(limit) || RECENT_LIMIT)),
    });
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.state === "trashed" ? "deleted" : row.state,
      state: row.state,
      pinned: Boolean(row.pinned),
      project_id: row.projectId || null,
      message_count: row.messageCount,
      last_model_id: row.lastModelKey || null,
      last_active_unix: row.updatedAt,
      created_at_unix: row.createdAt,
      source: "admin_agentsam",
    }));
  } catch (error) {
    console.warn("agentsam_chat_session_list_failed", String(error?.message || error).slice(0, 160));
    return [];
  }
}

/** Public key helpers remain stable for the CMS transcript and compaction modules. */
export function conversationThreadKey(conversationId) {
  return chatSessionR2Keys(conversationId).messages;
}

export function conversationSummaryKey(conversationId) {
  return chatSessionR2Keys(conversationId).digest;
}

export async function createConversation(env, { title } = {}) {
  const accountId = requireApplicationAccountId();
  const id = `conv_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
  return createChatSession(env.DB, {
    conversationId: id,
    accountId,
    title: titleFromMessage(title || "New conversation"),
    sessionKind: "chat",
  }).then(sessionProjection);
}

export async function ensureConversation(env, conversationId, { title } = {}) {
  if (conversationId) {
    const existing = await getConversation(env, conversationId);
    if (existing) return existing;
  }
  return createConversation(env, { title });
}

export async function touchConversation(
  env,
  conversationId,
  { title, lastModelId, messageDelta = 0 } = {},
) {
  if (!env?.DB || !conversationId) return false;
  return touchChatSession(env.DB, requireApplicationAccountId(), conversationId, {
    title: title ? titleFromMessage(title) : null,
    lastModelKey: lastModelId || null,
    messageDelta,
  });
}

export async function softDeleteConversation(env, id) {
  if (!env?.DB || !id) return false;
  return trashChatSession(env.DB, requireApplicationAccountId(), id);
}

export async function cacheRecentConversations(env, conversations) {
  if (!env?.CMS_CACHE) return;
  try {
    const payload = JSON.stringify((conversations || []).slice(0, RECENT_LIMIT).map((row) => ({
      id: row.id,
      title: row.title,
      last_active_unix: row.last_active_unix,
    })));
    await env.CMS_CACHE.put(`agentsam:recent:${requireApplicationAccountId()}`, payload, { expirationTtl: 86400 });
  } catch {
    /* KV is a disposable projection; canonical state remains in D1. */
  }
}

export async function getRecentConversationsCached(env) {
  // Read canonical D1 state first so Studio archive/trash/restore is immediately
  // reflected. KV never becomes an alternate conversation lifecycle authority.
  const rows = await listConversations(env);
  await cacheRecentConversations(env, rows);
  return rows;
}

export async function refreshRecentCache(env) {
  const rows = await listConversations(env);
  await cacheRecentConversations(env, rows);
  return rows;
}

export async function agentsamConversationsList(env) {
  const conversations = await getRecentConversationsCached(env);
  return json({ ok: true, conversations });
}

export async function agentsamConversationGet(env, id) {
  const conversation = await getConversation(env, id, { includeR2: true, includeMessages: true });
  if (!conversation) return json({ error: "Not found" }, { status: 404 });
  const messages = conversation.messages || [];
  delete conversation.messages;
  return json({ ok: true, conversation, messages });
}

export async function agentsamConversationCreate(request, env, sessionUser = null) {
  // Session identity is used only for request authentication; account ownership
  // is resolved from the verified application context, never from the body.
  await (sessionUser || getSessionUser(request, env));
  let body = null;
  try { body = await request.json(); } catch { body = {}; }
  const row = await createConversation(env, { title: body?.title });
  await refreshRecentCache(env);
  return json({ ok: true, conversation: row });
}

export async function agentsamConversationPatch(request, env, id) {
  let body = null;
  try { body = await request.json(); }
  catch { return json({ error: "Invalid body" }, { status: 400 }); }
  const existing = await getConversation(env, id);
  if (!existing) return json({ error: "Not found" }, { status: 404 });

  const patch = {};
  if (Object.hasOwn(body || {}, "title")) patch.title = titleFromMessage(body.title);
  if (Object.hasOwn(body || {}, "pinned")) patch.pinned = Boolean(body.pinned);
  if (Object.hasOwn(body || {}, "is_starred")) patch.pinned = Boolean(body.is_starred);
  if (Object.hasOwn(body || {}, "status")) {
    const state = body.status === "deleted" ? "trashed" : body.status;
    if (!["active", "archived", "trashed"].includes(state)) {
      return json({ error: "Invalid status" }, { status: 400 });
    }
    patch.state = state;
  }
  await updateChatSession(env.DB, requireApplicationAccountId(), id, patch);
  await refreshRecentCache(env);
  if (patch.state === "trashed") return json({ ok: true, deleted: true });
  const updated = await getConversation(env, id);
  return json({ ok: true, conversation: updated });
}

export async function agentsamConversationDelete(env, id) {
  const deleted = await softDeleteConversation(env, id);
  await refreshRecentCache(env);
  return json({ ok: true, deleted });
}
