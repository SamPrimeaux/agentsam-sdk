/**
 * AgentSam conversation metadata — D1 index + KV recent cache + R2 thread keys.
 */

import { FNF_ACCOUNT_ID } from "./constants.js";
import { getSessionUser } from "../lib/auth.js";

const KV_RECENT_KEY = `agentsam:recent:${FNF_ACCOUNT_ID}`;
const RECENT_LIMIT = 20;
const PREVIEW_MAX = 120;

function json(data, init = {}) {
  return Response.json(data, init);
}

function threadR2Key(conversationId) {
  return `agentsam/thread-payloads/${conversationId}/messages.jsonl`;
}

function summaryR2Key(conversationId) {
  return `agentsam/thread-summaries/${conversationId}/latest.json`;
}

function titleFromMessage(text) {
  const s = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return "Untitled";
  return s.length <= 60 ? s : `${s.slice(0, 57)}…`;
}

function previewText(text) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  return s.length <= PREVIEW_MAX ? s : `${s.slice(0, PREVIEW_MAX - 1)}…`;
}

export function conversationThreadKey(conversationId) {
  return threadR2Key(conversationId);
}

export async function listConversations(env, { limit = RECENT_LIMIT, status = "active" } = {}) {
  if (!env?.DB) return [];
  try {
    const { results } = await env.DB.prepare(
      `SELECT id, title, summary, status, workflow_key, last_message_preview,
              message_count, tool_call_count, attachment_count,
              last_active_at, last_active_unix, created_at
       FROM agentsam_conversations
       WHERE account_id = ? AND status = ?
       ORDER BY last_active_unix DESC
       LIMIT ?`
    )
      .bind(FNF_ACCOUNT_ID, status, limit)
      .all();
    return results || [];
  } catch {
    return [];
  }
}

export async function getConversation(env, id) {
  if (!env?.DB || !id) return null;
  return env.DB.prepare(
    `SELECT * FROM agentsam_conversations WHERE id = ? AND account_id = ? AND status != 'deleted' LIMIT 1`
  )
    .bind(id, FNF_ACCOUNT_ID)
    .first();
}

export async function createConversation(env, { title, createdBy, workflowKey } = {}) {
  const id = `conv_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const r2Key = threadR2Key(id);
  const now = Math.floor(Date.now() / 1000);
  const safeTitle = titleFromMessage(title || "New conversation");

  await env.DB.prepare(
    `INSERT INTO agentsam_conversations (
       id, account_id, title, status, source, workflow_key,
       r2_thread_key, r2_summary_key, kv_recent_key, created_by,
       last_active_at, last_active_unix, created_at, created_at_unix, updated_at
     ) VALUES (?, ?, ?, 'active', 'admin_agentsam', ?, ?, ?, ?, ?, datetime('now'), ?, datetime('now'), ?, datetime('now'))`
  )
    .bind(
      id,
      FNF_ACCOUNT_ID,
      safeTitle,
      workflowKey || null,
      r2Key,
      summaryR2Key(id),
      KV_RECENT_KEY,
      createdBy || null,
      now,
      now
    )
    .run();

  return getConversation(env, id);
}

export async function ensureConversation(env, conversationId, { title, createdBy, workflowKey } = {}) {
  if (conversationId) {
    const existing = await getConversation(env, conversationId);
    if (existing) return existing;
  }
  return createConversation(env, { title, createdBy, workflowKey });
}

export async function touchConversation(
  env,
  conversationId,
  {
    title,
    lastMessagePreview,
    lastModelId,
    workflowKey,
    messageDelta = 0,
    toolCallDelta = 0,
    attachmentDelta = 0,
  } = {}
) {
  if (!env?.DB || !conversationId) return;
  const now = Math.floor(Date.now() / 1000);
  const preview = lastMessagePreview != null ? previewText(lastMessagePreview) : null;

  await env.DB.prepare(
    `UPDATE agentsam_conversations SET
       title = COALESCE(?, title),
       last_message_preview = COALESCE(?, last_message_preview),
       last_model_id = COALESCE(?, last_model_id),
       workflow_key = COALESCE(?, workflow_key),
       message_count = message_count + ?,
       tool_call_count = tool_call_count + ?,
       attachment_count = attachment_count + ?,
       last_active_at = datetime('now'),
       last_active_unix = ?,
       updated_at = datetime('now')
     WHERE id = ? AND account_id = ?`
  )
    .bind(
      title ? titleFromMessage(title) : null,
      preview,
      lastModelId || null,
      workflowKey || null,
      messageDelta,
      toolCallDelta,
      attachmentDelta,
      now,
      conversationId,
      FNF_ACCOUNT_ID
    )
    .run();
}

export async function softDeleteConversation(env, id) {
  if (!env?.DB || !id) return false;
  await env.DB.prepare(
    `UPDATE agentsam_conversations SET status = 'deleted', updated_at = datetime('now') WHERE id = ? AND account_id = ?`
  )
    .bind(id, FNF_ACCOUNT_ID)
    .run();
  return true;
}

export async function cacheRecentConversations(env, conversations) {
  if (!env?.CMS_CACHE) return;
  try {
    const payload = JSON.stringify(
      (conversations || []).slice(0, RECENT_LIMIT).map((c) => ({
        id: c.id,
        title: c.title,
        last_message_preview: c.last_message_preview,
        last_active_unix: c.last_active_unix,
        workflow_key: c.workflow_key,
      }))
    );
    await env.CMS_CACHE.put(KV_RECENT_KEY, payload, { expirationTtl: 86400 });
  } catch {
    /* non-blocking */
  }
}

export async function getRecentConversationsCached(env) {
  if (env?.CMS_CACHE) {
    try {
      const raw = await env.CMS_CACHE.get(KV_RECENT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) return parsed;
      }
    } catch {
      /* fall through */
    }
  }
  return listConversations(env);
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
  const conversation = await getConversation(env, id);
  if (!conversation) return json({ error: "Not found" }, { status: 404 });

  let messages = [];
  if (env.WEBSITE_ASSETS && conversation.r2_thread_key) {
    try {
      const obj = await env.WEBSITE_ASSETS.get(conversation.r2_thread_key);
      if (obj) {
        const text = await obj.text();
        messages = text
          .split("\n")
          .filter(Boolean)
          .map((line) => {
            try {
              return JSON.parse(line);
            } catch {
              return null;
            }
          })
          .filter(Boolean);
      }
    } catch {
      /* non-blocking */
    }
  }

  return json({ ok: true, conversation, messages });
}

export async function agentsamConversationCreate(request, env) {
  const user = await getSessionUser(request, env);
  let body = null;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const row = await createConversation(env, {
    title: body?.title,
    createdBy: user?.id || null,
    workflowKey: body?.workflow_key || null,
  });
  await refreshRecentCache(env);
  return json({ ok: true, conversation: row });
}

export async function agentsamConversationPatch(request, env, id) {
  let body = null;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid body" }, { status: 400 });
  }
  const existing = await getConversation(env, id);
  if (!existing) return json({ error: "Not found" }, { status: 404 });

  if (body?.status === "deleted") {
    await softDeleteConversation(env, id);
    await refreshRecentCache(env);
    return json({ ok: true, deleted: true });
  }

  await touchConversation(env, id, {
    title: body?.title,
    lastMessagePreview: body?.last_message_preview,
    workflowKey: body?.workflow_key,
  });
  const updated = await getConversation(env, id);
  await refreshRecentCache(env);
  return json({ ok: true, conversation: updated });
}

export async function agentsamConversationDelete(env, id) {
  await softDeleteConversation(env, id);
  await refreshRecentCache(env);
  return json({ ok: true, deleted: true });
}
