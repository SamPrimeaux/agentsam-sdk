/** Notification contact + prefs. Account SSOT only — accounts.id. */
const answer = (payload, status = 200) =>
  Response.json(payload, { status, headers: { "cache-control": "no-store" } });

const EVENT_CATALOG = [
  {
    id: "notify-runs",
    label: "Agent run completion",
    description: "Notify when long-running work finishes or needs input.",
    enabled: true,
  },
  {
    id: "notify-security",
    label: "Security findings",
    description: "Notify when credentials, policies or provider health need attention.",
    enabled: true,
  },
  {
    id: "notify-release",
    label: "Release checks",
    description: "Notify when a package or deploy preflight changes state.",
    enabled: false,
  },
];

const CHANNEL_DEFAULTS = {
  email: true,
  push: false,
  imessage: false,
  in_app: true,
};

function decode(value) {
  try {
    const object = JSON.parse(String(value || "{}"));
    return object && typeof object === "object" && !Array.isArray(object) ? object : {};
  } catch {
    return {};
  }
}

function normalizeEmail(value) {
  if (value == null) return "";
  if (typeof value !== "string") return undefined;
  const email = value.trim();
  if (!email) return "";
  if (email.length > 320) return undefined;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return undefined;
  return email.toLowerCase();
}

function normalizePhone(value) {
  if (value == null) return "";
  if (typeof value !== "string") return undefined;
  const phone = value.trim();
  if (!phone) return "";
  if (phone.length > 32) return undefined;
  if (!/^\+?[0-9() .\-]{7,32}$/.test(phone)) return undefined;
  return phone;
}

function normalizeChannels(data) {
  const source = data && typeof data === "object" && !Array.isArray(data) ? data : {};
  return {
    email: source.email === true,
    push: source.push === true,
    imessage: source.imessage === true,
    in_app: source.in_app !== false,
  };
}

function normalizeEvents(stored) {
  const byId = new Map();
  if (Array.isArray(stored)) {
    for (const row of stored) {
      if (!row || typeof row !== "object") continue;
      const id = String(row.id || "").trim();
      if (!id) continue;
      byId.set(id, row.enabled === true);
    }
  }
  return EVENT_CATALOG.map((item) => ({
    ...item,
    enabled: byId.has(item.id) ? byId.get(item.id) === true : item.enabled,
  }));
}

/** meta_json.notifications = { phone, channels, events } under accounts.id */
function readMetaNotifications(meta) {
  const block =
    meta.notifications && typeof meta.notifications === "object" && !Array.isArray(meta.notifications)
      ? meta.notifications
      : {};
  return {
    phone: block.phone ?? meta.notification_phone ?? "",
    channels: block.channels ?? CHANNEL_DEFAULTS,
    events: block.events,
  };
}

function profileFromAccount(account) {
  const meta = decode(account?.meta_json);
  const stored = readMetaNotifications(meta);
  const email = normalizeEmail(account?.notification_email) || "";
  const phone = normalizePhone(stored.phone) || "";
  const loginEmail = normalizeEmail(account?.email) || null;
  return {
    email: email === undefined ? "" : email,
    phone: phone === undefined ? "" : phone,
    loginEmail,
    channels: normalizeChannels(stored.channels),
    events: normalizeEvents(stored.events),
  };
}

function assertMutationGuards(request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return answer({ ok: false, error: "origin_not_allowed" }, 403);
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return answer({ ok: false, error: "json_content_type_required" }, 415);
  }
  return null;
}

export async function handleStudioNotificationSettings(request, env, accountId) {
  if (!accountId) return answer({ ok: false, error: "unauthorized" }, 401);
  if (!env.DB) return answer({ ok: false, error: "database_unavailable" }, 503);
  if (request.method !== "GET" && request.method !== "PUT") {
    return answer({ ok: false, error: "method_not_allowed" }, 405);
  }
  if (request.method === "PUT") {
    const blocked = assertMutationGuards(request);
    if (blocked) return blocked;
  }

  const account = await env.DB.prepare(
    `SELECT id, email, notification_email, meta_json FROM accounts WHERE id = ? LIMIT 1`,
  )
    .bind(accountId)
    .first();
  if (!account) return answer({ ok: false, error: "account_not_found" }, 404);

  if (request.method === "GET") {
    return answer({ ok: true, settings: profileFromAccount(account) });
  }

  const input = await request.json().catch(() => null);
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return answer({ ok: false, error: "notifications_invalid" }, 400);
  }

  const email = normalizeEmail(input.email);
  const phone = normalizePhone(input.phone);
  if (email === undefined || phone === undefined) {
    return answer({ ok: false, error: "notifications_invalid" }, 400);
  }
  if (
    !input.channels ||
    typeof input.channels !== "object" ||
    Array.isArray(input.channels) ||
    typeof input.channels.email !== "boolean" ||
    typeof input.channels.push !== "boolean" ||
    typeof input.channels.imessage !== "boolean" ||
    typeof input.channels.in_app !== "boolean"
  ) {
    return answer({ ok: false, error: "notifications_invalid" }, 400);
  }
  if (!Array.isArray(input.events)) {
    return answer({ ok: false, error: "notifications_invalid" }, 400);
  }
  const knownIds = new Set(EVENT_CATALOG.map((item) => item.id));
  for (const row of input.events) {
    if (
      !row ||
      typeof row !== "object" ||
      typeof row.id !== "string" ||
      !knownIds.has(row.id) ||
      typeof row.enabled !== "boolean"
    ) {
      return answer({ ok: false, error: "notifications_invalid" }, 400);
    }
  }

  const channels = normalizeChannels(input.channels);
  const events = normalizeEvents(input.events).map(({ id, enabled }) => ({ id, enabled }));
  const meta = decode(account.meta_json);
  delete meta.notification_phone;
  meta.notifications = {
    phone,
    channels,
    events,
  };

  await env.DB.prepare(
    `UPDATE accounts
     SET notification_email = ?, meta_json = ?, updated_at = unixepoch()
     WHERE id = ?`,
  )
    .bind(email || null, JSON.stringify(meta), accountId)
    .run();

  const refreshed = await env.DB.prepare(
    `SELECT id, email, notification_email, meta_json FROM accounts WHERE id = ? LIMIT 1`,
  )
    .bind(accountId)
    .first();

  return answer({ ok: true, settings: profileFromAccount(refreshed) });
}
