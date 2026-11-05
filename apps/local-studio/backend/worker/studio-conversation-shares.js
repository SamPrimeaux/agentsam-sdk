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

function normalizeSnapshot(body) {
  if (!body || typeof body !== "object" || !Array.isArray(body.messages)) return null;
  const messages = body.messages.slice(-200).flatMap((message) => {
    if (!message || !["user", "assistant"].includes(message.role)) return [];
    const content = text(message.content);
    const attachments = Array.isArray(message.attachments)
      ? message.attachments.slice(0, 20).map((attachment) => ({
          name: text(attachment?.name, 180),
          mimeType: text(attachment?.mimeType, 100),
        })).filter((attachment) => attachment.name)
      : [];
    if (!content && !attachments.length) return [];
    return [{ role: message.role, content, attachments }];
  });
  const snapshot = {
    title: text(body.title, 200).trim() || "Shared conversation",
    messages,
    sharedAt: new Date().toISOString(),
  };
  const encoded = JSON.stringify(snapshot);
  if (encoded.length > 900_000) return null;
  return { snapshot, encoded };
}

export async function handleStudioConversationShares(request, env, userId, url) {
  if (!env.DB?.prepare) return json({ ok: false, error: "share_storage_unavailable" }, 503);
  if (!userId) return json({ ok: false, error: "unauthorized" }, 401);
  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin) return json({ ok: false, error: "origin_not_allowed" }, 403);

  const collection = url.pathname === "/api/studio/conversation-shares";
  const match = /^\/api\/studio\/conversation-shares\/([A-Za-z0-9_-]{8,100})$/.exec(url.pathname);
  try {
    if (collection && request.method === "POST") {
      const body = await request.json();
      const conversationId = text(body?.conversationId, 160).trim();
      const normalized = normalizeSnapshot(body);
      if (!conversationId || !normalized) return json({ ok: false, error: "invalid_share_snapshot" }, 400);
      const id = "cshare_" + crypto.randomUUID().replaceAll("-", "");
      const token = randomToken();
      await env.DB.prepare(`INSERT INTO agentsam_conversation_shares
        (id, owner_id, conversation_id, token, title, snapshot_json)
        VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(id, userId, conversationId, token, normalized.snapshot.title, normalized.encoded).run();
      const link = new URL("/share/" + token, url.origin).toString();
      return json({ ok: true, link: { id, url: link, createdAt: new Date().toISOString() } }, 201);
    }

    if (collection && request.method === "GET") {
      const conversationId = text(url.searchParams.get("conversation_id"), 160).trim();
      if (!conversationId) return json({ ok: false, error: "conversation_id_required" }, 400);
      const { results = [] } = await env.DB.prepare(`SELECT id, token, title, created_at
        FROM agentsam_conversation_shares
        WHERE owner_id = ? AND conversation_id = ? AND revoked_at IS NULL
        ORDER BY created_at DESC LIMIT 50`).bind(userId, conversationId).all();
      return json({ ok: true, links: results.map((row) => ({
        id: row.id,
        title: row.title,
        url: new URL("/share/" + row.token, url.origin).toString(),
        createdAt: new Date(Number(row.created_at) * 1000).toISOString(),
      })) });
    }

    if (match && request.method === "DELETE") {
      const result = await env.DB.prepare(`UPDATE agentsam_conversation_shares
        SET revoked_at = unixepoch()
        WHERE id = ? AND owner_id = ? AND revoked_at IS NULL`).bind(match[1], userId).run();
      return Number(result?.meta?.changes || 0) ? json({ ok: true }) : json({ ok: false, error: "share_not_found" }, 404);
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
    const row = await env.DB.prepare(`SELECT snapshot_json FROM agentsam_conversation_shares
      WHERE token = ? AND revoked_at IS NULL LIMIT 1`).bind(token).first();
    if (!row) return new Response("This share link is unavailable or has been revoked.", {
      status: 404, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
    const snapshot = JSON.parse(row.snapshot_json);
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
