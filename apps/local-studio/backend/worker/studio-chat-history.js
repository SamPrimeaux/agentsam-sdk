/**
 * Read-only account-wide projection + metadata controls for existing
 * agentsam_chat_sessions. No second session registry or transcript writer.
 * Older local-only sessions stay on-device until safe account-scoped migration.
 */
const ID = /^[a-zA-Z0-9_-]{1,128}$/;
const CHAT_PATH = /^\/api\/studio\/chats(?:\/([a-zA-Z0-9_-]+)(?:\/(messages))?)?$/;

const json = (value, status = 200) => Response.json(value, {
  status, headers: { "cache-control": "private, no-store", "x-content-type-options": "nosniff" },
});
const clamp = (value, fallback, max) => Math.max(0, Math.min(max, Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : fallback));
const clean = (value, max = 160) => String(value ?? "").trim().slice(0, max);

async function ownedSession(db, owner, id) {
  return db.prepare(`SELECT conversation_id,title,tenant_id,r2_messages_key,project_id,state,is_starred,
    lifecycle,session_kind,updated_at,message_count FROM agentsam_chat_sessions
    WHERE conversation_id=? AND user_id=? LIMIT 1`).bind(id, owner).first();
}
async function authorizedProject(db, owner, id) {
  if (!id) return true;
  return Boolean(await db.prepare(
    "SELECT id FROM projects WHERE id=? AND owner_user_id=? LIMIT 1"
  ).bind(id, owner).first());
}

/** No non-owned chat, provider secret, or raw R2 key ever reaches the UI. */
export async function handleStudioChatHistory(request, env, owner) {
  if (!owner) return json({ error: "unauthorized" }, 401);
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
      const status = ["active", "archived", "trashed"].includes(url.searchParams.get("status"))
        ? url.searchParams.get("status") : "active";
      const kind = ["chat", "side_chat", "subagent"].includes(url.searchParams.get("kind"))
        ? url.searchParams.get("kind") : "chat";
      const q = clean(url.searchParams.get("q"), 100);
      const since = clamp(url.searchParams.get("since"), 0, 9999999999);
      const order = url.searchParams.get("sort") === "oldest" ? "ASC" : "DESC";
      const where = `user_id=? AND state=? AND session_kind=? AND lifecycle='durable'
        ${q ? "AND title LIKE ? ESCAPE '\\'" : ""}
        ${since ? "AND updated_at>=?" : ""}`;
      const binds = [owner, status, kind];
      if (q) binds.push("%" + q.replace(/[\\%_]/g, "\\$&") + "%");
      if (since) binds.push(since);
      const rows = await env.DB.prepare(`SELECT conversation_id AS id,title,project_id AS projectId,
          workspace_id AS workspaceId,is_starred AS pinned,updated_at AS updatedAt,
          created_at AS createdAt,message_count AS messageCount,artifact_count AS artifactCount,
          last_turn_status AS lastTurnStatus,state,session_kind AS kind,r2_messages_key AS _archive
        FROM agentsam_chat_sessions WHERE ${where}
        ORDER BY is_starred DESC,updated_at ${order},conversation_id ${order} LIMIT ? OFFSET ?`)
        .bind(...binds, limit + 1, offset).all();
      const all = rows.results || [];
      const visible = all.slice(0, limit).map(({ _archive, ...row }) => ({
        ...row, pinned: Boolean(row.pinned), origin: _archive?.includes("/studio/chats/") ? "studio" : "account",
      }));
      return json({ chats: visible, hasMore: all.length > limit, nextOffset: offset + visible.length });
    }

    // Legacy local chat data is not auto-imported: the V1 browser storage key
    // predates account scoping. Implicit imports risk crossing user boundaries.
    // Session creation and transcript writes belong to IAM's existing API.
    if (!id && method === "POST") return json({error:"use_account_sessions_api"},405);

    if (!id || !ID.test(id)) return json({ error: "invalid_chat_id" }, 400);
    const row = await ownedSession(env.DB, owner, id);
    if (!row) return json({ error: "chat_not_found" }, 404);
    if (!isMessages && method === "GET") return json({ chat: {
      id: row.conversation_id, title: row.title, projectId: row.project_id,
      pinned: Boolean(row.is_starred), state: row.state, kind: row.session_kind,
      updatedAt: row.updated_at, messageCount: row.message_count,
    } });
    if (isMessages && method === "GET") {
      // Main IAM owns live DO messages. Forward the same verified browser
      // credential to its native message endpoint; fallback to its R2 archive
      // only when DO is unavailable. Both paths require ownedSession above.
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
            if (Array.isArray(content) && content.length) return json({ messages: content, source: "account" });
          }
        } catch { /* R2 fallback below */ }
      }
      if (row.r2_messages_key && env.AUTORAG_BUCKET?.get) {
        const object = await env.AUTORAG_BUCKET.get(row.r2_messages_key);
        if (object) {
          const contents = await object.text();
          const messages = contents.split("\n").filter(Boolean).slice(-1000).flatMap((line) => {
            try { return [JSON.parse(line)]; } catch { return []; }
          });
          return json({ messages, source: "archive" });
        }
      }
      return json({ messages: [], source: "unavailable", recoverable: true });
    }
    if (isMessages) return json({ error: "method_not_allowed" }, 405);
    if (method === "PATCH" || method === "DELETE") {
      let patch = {};
      if (method === "PATCH") {
        try { patch = await request.json(); } catch { return json({ error: "invalid_request" }, 400); }
      } else patch = { state: "trashed" };
      const permitted = ["title", "pinned", "state", "projectId"];
      if (!patch || typeof patch !== "object" || Array.isArray(patch) ||
        Object.keys(patch).some(key => !permitted.includes(key))) return json({ error: "invalid_change" }, 400);
      const fields = [];
      const values = [];
      if (Object.hasOwn(patch, "title")) {
        const title = clean(patch.title);
        if (!title) return json({ error: "title_required" }, 400);
        fields.push("title=?"); values.push(title);
      }
      if (Object.hasOwn(patch, "pinned")) {
        fields.push("is_starred=?"); values.push(patch.pinned ? 1 : 0);
      }
      if (Object.hasOwn(patch, "state")) {
        if (!["active", "archived", "trashed"].includes(patch.state)) return json({ error: "invalid_state" }, 400);
        fields.push("state=?", "is_archived=?", "state_changed_at=unixepoch()");
        values.push(patch.state, patch.state === "active" ? 0 : 1);
      }
      if (Object.hasOwn(patch, "projectId")) {
        const projectId = patch.projectId == null ? null : clean(patch.projectId, 128);
        if (projectId && !await authorizedProject(env.DB, owner, projectId)) return json({ error: "project_not_found" }, 404);
        fields.push("project_id=?"); values.push(projectId || null);
      }
      if (!fields.length) return json({ error: "no_changes" }, 400);
      const result = await env.DB.prepare(`UPDATE agentsam_chat_sessions
        SET ${fields.join(",")},updated_at=unixepoch()
        WHERE conversation_id=? AND user_id=?`).bind(...values, id, owner).run();
      if (!(result.meta?.changes ?? result.changes)) return json({ error: "chat_not_found" }, 404);
      return json({ ok: true });
    }
    return json({ error: "method_not_allowed" }, 405);
  } catch (error) {
    console.error("studio_chat_history_failed", method, url.pathname, String(error?.name || "error"));
    return json({ error: "chats_unavailable" }, 503);
  }
}
