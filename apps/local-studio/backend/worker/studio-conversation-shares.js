import {
  createConversationShare,
  getChatSession,
  getPublicConversationShare,
  listConversationShares,
  revokeConversationShare,
} from "@inneranimalmedia/agentsam-cms/chat-storage";

const json = (body, status = 200, headers = {}) => Response.json(body, {
  status,
  headers: { "cache-control": "no-store", ...headers },
});

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char]);

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function text(value, max = 60_000) {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function normalizeSnapshot(title, messages) {
  if (!Array.isArray(messages)) return null;
  const normalizedMessages = messages.slice(-200).flatMap((message) => {
    if (!message || !["user", "assistant"].includes(message.role)) return [];
    const content = text(message.content);
    const attachments = Array.isArray(message.attachments)
      ? message.attachments.slice(0, 20).map((attachment) => ({
          name: text(attachment?.name, 180),
          mimeType: text(attachment?.mimeType || attachment?.mime_type, 100),
        })).filter((attachment) => attachment.name)
      : [];
    if (!content && !attachments.length) return [];
    return [{ role: message.role, content, attachments }];
  });
  const snapshot = {
    title: text(title, 200).trim() || "Shared conversation",
    messages: normalizedMessages,
    sharedAt: new Date().toISOString(),
  };
  const encoded = JSON.stringify(snapshot);
  if (encoded.length > 900_000) return null;
  return { snapshot, encoded };
}

async function readR2Transcript(env, session) {
  if (!session.r2_messages_key) return [];
  const buckets = [...new Set([env.AUTORAG_BUCKET, env.WEBSITE_ASSETS].filter(Boolean))];
  for (const bucket of buckets) {
    if (typeof bucket.get !== "function") continue;
    try {
      const object = await bucket.get(session.r2_messages_key);
      if (!object) continue;
      const contents = await object.text();
      try {
        const parsed = JSON.parse(contents);
        if (Array.isArray(parsed)) return parsed;
        if (Array.isArray(parsed?.messages)) return parsed.messages;
      } catch { /* JSONL archive */ }
      return contents.split("\n").filter(Boolean).slice(-1000).flatMap((line) => {
        try { return [JSON.parse(line)]; } catch { return []; }
      });
    } catch {
      /* try the next account-owned archive bucket */
    }
  }
  return [];
}

async function readCurrentTranscript(request, env, session) {
  if (env.IAM_API?.fetch) {
    try {
      const headers = new Headers();
      for (const key of ["cookie", "authorization"]) {
        const credential = request.headers.get(key);
        if (credential) headers.set(key, credential);
      }
      const reply = await env.IAM_API.fetch(new Request(
        "https://inneranimalmedia.com/api/agent/sessions/" +
          encodeURIComponent(session.conversation_id) + "/messages",
        { method: "GET", headers },
      ));
      if (reply.ok) {
        const payload = await reply.json();
        const messages = Array.isArray(payload) ? payload : payload?.messages;
        if (Array.isArray(messages) && messages.length) return messages;
      }
    } catch {
      /* the canonical session's R2 archive is the recoverable fallback */
    }
  }
  return readR2Transcript(env, session);
}

export async function handleStudioConversationShares(request, env, accountId, url) {
  if (!env.DB?.prepare) return json({ ok: false, error: "share_storage_unavailable" }, 503);
  if (!accountId) return json({ ok: false, error: "unauthorized" }, 401);
  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin) return json({ ok: false, error: "origin_not_allowed" }, 403);

  const collection = url.pathname === "/api/studio/conversation-shares";
  const match = /^\/api\/studio\/conversation-shares\/([A-Za-z0-9_-]{8,100})$/.exec(url.pathname);
  try {
    if (collection && request.method === "POST") {
      let body;
      try { body = await request.json(); }
      catch { return json({ ok: false, error: "invalid_request" }, 400); }
      const conversationId = text(body?.conversationId || body?.conversation_id, 160).trim();
      if (!conversationId) return json({ ok: false, error: "conversation_id_required" }, 400);

      // Resolve ownership and transcript from canonical storage. Client-supplied
      // title/messages are deliberately ignored so a caller cannot share another
      // account's session or forge a public snapshot.
      const session = await getChatSession(env.DB, accountId, conversationId);
      if (!session || session.expires_at != null || session.state === "trashed") {
        return json({ ok: false, error: "conversation_not_found" }, 404);
      }
      const messages = await readCurrentTranscript(request, env, session);
      if (!messages.length) return json({ ok: false, error: "conversation_messages_unavailable" }, 409);
      const normalized = normalizeSnapshot(session.title, messages);
      if (!normalized) return json({ ok: false, error: "invalid_share_snapshot" }, 400);

      const id = "cshare_" + crypto.randomUUID().replaceAll("-", "");
      const token = randomToken();
      const created = await createConversationShare(env.DB, {
        id,
        accountId,
        conversationId,
        token,
        title: normalized.snapshot.title,
        snapshotJson: normalized.encoded,
      });
      if (!created) return json({ ok: false, error: "conversation_not_found" }, 404);
      const link = new URL("/share/" + token, url.origin).toString();
      return json({ ok: true, link: { id, url: link, createdAt: new Date().toISOString() } }, 201);
    }

    if (collection && request.method === "GET") {
      const conversationId = text(url.searchParams.get("conversation_id"), 160).trim() || null;
      const includeRevoked = url.searchParams.get("include_revoked") === "1";
      const rows = await listConversationShares(env.DB, accountId, {
        conversationId,
        includeRevoked,
        limit: 50,
      });
      return json({ ok: true, links: rows.map((row) => ({
        id: row.id,
        conversationId: row.conversation_id,
        title: row.title,
        url: new URL("/share/" + row.token, url.origin).toString(),
        createdAt: new Date(Number(row.created_at) * 1000).toISOString(),
        revokedAt: row.revoked_at == null ? null : new Date(Number(row.revoked_at) * 1000).toISOString(),
      })) });
    }

    if (match && request.method === "DELETE") {
      const revoked = await revokeConversationShare(env.DB, accountId, match[1]);
      return revoked ? json({ ok: true }) : json({ ok: false, error: "share_not_found" }, 404);
    }
    return json({ ok: false, error: "method_not_allowed" }, 405, { allow: collection ? "GET, POST" : "DELETE" });
  } catch (error) {
    console.warn("conversation_share_request_failed", String(error?.message || error).slice(0, 140));
    return json({ ok: false, error: "conversation_share_unavailable" }, 503);
  }
}

function renderSharedConversation(snapshot) {
  const messages = Array.isArray(snapshot?.messages) ? snapshot.messages : [];
  const cards = messages.map((message) => {
    const role = message.role === "user" ? "You" : "AgentSam";
    const attachments = Array.isArray(message.attachments) && message.attachments.length
      ? `<p class="attachments">${message.attachments.map((item) => `<span>Image · ${escapeHtml(item.name)}</span>`).join("")}</p>`
      : "";
    return `<article class="message"><div class="role">${role}</div>${message.content ? `<p>${escapeHtml(message.content)}</p>` : ""}${attachments}</article>`;
  }).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escapeHtml(snapshot?.title || "Shared conversation")} · AgentSam</title><style>
    :root{color-scheme:dark;font:16px/1.65 ui-sans-serif,system-ui,sans-serif;background:#090a0d;color:#eee}
    *{box-sizing:border-box}body{margin:0;padding:40px 18px}.page{max-width:760px;margin:auto}
    header{border-bottom:1px solid #2b2d33;padding:12px 0 24px;margin-bottom:30px}
    .brand{font-size:13px;color:#aaa;letter-spacing:.08em;text-transform:uppercase}
    h1{font-size:clamp(24px,5vw,34px);line-height:1.2;margin:20px 0 8px}
    .meta{color:#9799a1;font-size:13px}.message{padding:20px 22px;border:1px solid #292b30;border-radius:18px;background:#141519;margin:14px 0}
    .role{font-size:12px;color:#aaa;margin-bottom:8px}.message p{white-space:pre-wrap;overflow-wrap:anywhere;margin:0}
    .attachments{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px!important}.attachments span{border:1px solid #373941;border-radius:999px;padding:4px 10px;color:#b8bac4;font-size:12px}
    footer{padding:24px 0;color:#777;font-size:12px}
    @media(max-width:600px){body{padding:22px 12px}.message{padding:16px;border-radius:14px}}
  </style></head><body><main class="page"><header><div class="brand">AgentSam · Shared conversation</div><h1>${escapeHtml(snapshot?.title || "Shared conversation")}</h1><div class="meta">Anyone with this link can view this conversation.</div></header>${cards || '<p>No messages were included in this conversation.</p>'}<footer>Shared from AgentSam</footer></main></body></html>`;
}

export async function handlePublicConversationShare(request, env, token) {
  if (request.method !== "GET" || !env.DB?.prepare) {
    return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
  }
  try {
    // Public capability lookup is token-only: no auth and no joins to accounts
    // or sessions. Revoked and unknown tokens deliberately share one 404.
    const row = await getPublicConversationShare(env.DB, token);
    if (!row) return new Response("This share link is unavailable or has been revoked.", {
      status: 404, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
    const snapshot = JSON.parse(row.snapshot_json);
    if (!snapshot.title) snapshot.title = row.title;
    return new Response(renderSharedConversation(snapshot), {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
        "referrer-policy": "no-referrer",
        "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      },
    });
  } catch {
    return new Response("This share link is unavailable.", {
      status: 503, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }
}
