/**
 * Account-wide chat history projection and metadata controls.
 * Session creation and transcript writes remain owned by IAM's account-session
 * API; this route only reads canonical session rows and applies owner-scoped
 * metadata/state changes.
 */
import {
  getChatSession,
  listChatSessions,
  updateChatSession,
} from "@inneranimalmedia/agentsam-cms/chat-storage";

const ID = /^[a-zA-Z0-9_-]{1,128}$/;
const CHAT_PATH = /^\/api\/studio\/chats(?:\/([a-zA-Z0-9_-]+)(?:\/(messages))?)?$/;

const json = (value, status = 200) => Response.json(value, {
  status, headers: { "cache-control": "private, no-store", "x-content-type-options": "nosniff" },
});
const clamp = (value, fallback, max) => Math.max(0, Math.min(max,
  Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : fallback));
const clean = (value, max = 160) => String(value ?? "").trim().slice(0, max);

async function authorizedProject(db, accountId, id) {
  if (!id) return true;
  return Boolean(await db.prepare(
    "SELECT id FROM projects WHERE id = ? AND owner_user_id = ? LIMIT 1"
  ).bind(id, accountId).first());
}

async function readArchivedMessages(env, row) {
  if (!row.r2_messages_key) return [];
  const buckets = [env.AUTORAG_BUCKET, env.WEBSITE_ASSETS].filter(Boolean);
  for (const bucket of [...new Set(buckets)]) {
    if (typeof bucket.get !== "function") continue;
    try {
      const object = await bucket.get(row.r2_messages_key);
      if (!object) continue;
      const contents = await object.text();
      try {
        const parsed = JSON.parse(contents);
        if (Array.isArray(parsed)) return parsed;
        if (Array.isArray(parsed?.messages)) return parsed.messages;
      } catch { /* JSONL below */ }
      return contents.split("\n").filter(Boolean).slice(-1000).flatMap((line) => {
        try { return [JSON.parse(line)]; } catch { return []; }
      });
    } catch {
      /* try the next configured transcript bucket */
    }
  }
  return [];
}

/** No non-owned chat, provider secret, or raw R2 key ever reaches the UI. */
export async function handleStudioChatHistory(request, env, accountId) {
  if (!accountId) return json({ error: "unauthorized" }, 401);
  if (!env?.DB?.prepare) return json({ error: "chats_unavailable" }, 503);
  const url = new URL(request.url);
  const match = CHAT_PATH.exec(url.pathname);
  if (!match) return json({ error: "not_found" }, 404);
  const method = request.method.toUpperCase();
  const id = match[1] || null;
  const isMessages = match[2] === "messages";

  try {
    if (!id && method === "GET") {
      const limit = Math.max(1, clamp(url.searchParams.get("limit"), 50, 100));
      const offset = clamp(url.searchParams.get("offset"), 0, 10000);
      const state = ["active", "archived", "trashed"].includes(url.searchParams.get("status"))
        ? url.searchParams.get("status") : "active";
      const sessionKind = ["chat", "side_chat", "subagent"].includes(url.searchParams.get("kind"))
        ? url.searchParams.get("kind") : "chat";
      const query = clean(url.searchParams.get("q"), 100);
      const since = clamp(url.searchParams.get("since"), 0, 9999999999);
      const rows = await listChatSessions(env.DB, accountId, {
        state,
        sessionKind,
        durableOnly: true,
        query,
        since,
        sort: url.searchParams.get("sort") === "oldest" ? "oldest" : "newest",
        limit: limit + 1,
        offset,
      });
      const visible = rows.slice(0, limit).map(({ r2MessagesKey, ...row }) => ({
        ...row,
        pinned: Boolean(row.pinned),
        origin: r2MessagesKey?.includes("/studio/chats/") ? "studio" : "account",
      }));
      return json({ chats: visible, hasMore: rows.length > limit, nextOffset: offset + visible.length });
    }

    // Session creation and transcript writes belong to IAM's account-session API.
    if (!id && method === "POST") return json({ error: "use_account_sessions_api" }, 405);
    if (!id || !ID.test(id)) return json({ error: "invalid_chat_id" }, 400);

    const row = await getChatSession(env.DB, accountId, id);
    if (!row) return json({ error: "chat_not_found" }, 404);

    if (!isMessages && method === "GET") return json({ chat: {
      id: row.conversation_id,
      title: row.title,
      projectId: row.project_id,
      pinned: Boolean(row.is_starred),
      state: row.state,
      kind: row.session_kind,
      updatedAt: row.updated_at,
      messageCount: row.message_count,
    } });

    if (isMessages && method === "GET") {
      // Live transcript is authoritative in IAM. Only if it is unavailable or
      // empty do we fall back to the account-owned R2 archive key on the row.
      if (env.IAM_API?.fetch) {
        try {
          const headers = new Headers();
          for (const key of ["cookie", "authorization"]) {
            const credential = request.headers.get(key);
            if (credential) headers.set(key, credential);
          }
          const reply = await env.IAM_API.fetch(new Request(
            "https://inneranimalmedia.com/api/agent/sessions/" + encodeURIComponent(id) + "/messages",
            { method: "GET", headers },
          ));
          if (reply.ok) {
            const content = await reply.json();
            const messages = Array.isArray(content) ? content : content?.messages;
            if (Array.isArray(messages) && messages.length) return json({ messages, source: "account" });
          }
        } catch { /* recover from the R2 archive below */ }
      }
      const messages = await readArchivedMessages(env, row);
      if (messages.length) return json({ messages, source: "archive" });
      return json({ messages: [], source: "unavailable", recoverable: true });
    }

    if (isMessages) return json({ error: "method_not_allowed" }, 405);
    if (method === "PATCH" || method === "DELETE") {
      let patch = {};
      if (method === "PATCH") {
        try { patch = await request.json(); }
        catch { return json({ error: "invalid_request" }, 400); }
      } else patch = { state: "trashed" };

      const permitted = ["title", "pinned", "state", "projectId"];
      if (!patch || typeof patch !== "object" || Array.isArray(patch) ||
        Object.keys(patch).some((key) => !permitted.includes(key))) {
        return json({ error: "invalid_change" }, 400);
      }
      if (Object.hasOwn(patch, "projectId")) {
        const projectId = patch.projectId == null ? null : clean(patch.projectId, 128);
        if (projectId && !await authorizedProject(env.DB, accountId, projectId)) {
          return json({ error: "project_not_found" }, 404);
        }
        patch = { ...patch, projectId };
      }
      if (Object.hasOwn(patch, "title") && !clean(patch.title)) return json({ error: "title_required" }, 400);
      if (Object.hasOwn(patch, "state") && !["active", "archived", "trashed"].includes(patch.state)) {
        return json({ error: "invalid_state" }, 400);
      }
      const updated = await updateChatSession(env.DB, accountId, id, patch);
      if (!updated) return json({ error: "chat_not_found" }, 404);
      return json({ ok: true });
    }
    return json({ error: "method_not_allowed" }, 405);
  } catch (error) {
    console.error("studio_chat_history_failed", method, url.pathname, String(error?.name || "error"));
    return json({ error: "chats_unavailable" }, 503);
  }
}
