import { sendResendEmail, resendConfigured, getResendDomainStatus, fetchReceivedEmail } from "../lib/resend.js";
import {
  getMailboxBySlug,
  listMailboxes,
  matchMailboxForMessage,
  getMailboxesForUser,
  assertMailboxAccess,
  getPrimaryMailboxForUser,
} from "../lib/mail-mailboxes.js";

const DEFAULT_SETTINGS = {
  resendFrom: "",
  resendPaymentsFrom: "",
  resendDomain: "",
  resendReplyTo: "",
  resendApiKey: "",
  resendTransactional: true,
  resendCampaign: false,
  resendTracking: false,
  resendWebhooks: true,
  defaultInbox: "Resend inbound",
  defaultSender: "Resend only",
  syncCadence: "Realtime webhooks",
  agentMode: "Draft only",
  autoLabel: true,
  clientPriority: true,
  reviewBeforeSend: true,
};

function sanitizeSettings(raw) {
  const merged = { ...DEFAULT_SETTINGS, ...(raw || {}) };
  if (merged.resendApiKey && merged.resendApiKey.includes("•")) {
    delete merged.resendApiKey;
  }
  return merged;
}

function redactSettings(settings) {
  return {
    ...settings,
    resendApiKey: settings.resendApiKey ? "••••••••" : "",
  };
}

async function loadSettings(env) {
  try {
    const row = await env.DB.prepare(
      `SELECT settings_json FROM mail_settings WHERE id = 1`
    ).first();
    if (row?.settings_json) {
      return sanitizeSettings(JSON.parse(row.settings_json));
    }
  } catch {
    // Table may not exist yet — fall through to KV/defaults
  }

  const cached = await env.CMS_CACHE.get("mail:settings", "json");
  return sanitizeSettings(cached);
}

async function saveSettings(env, settings) {
  const existing = await loadSettings(env);
  const next = { ...existing, ...settings };
  if (!settings.resendApiKey) next.resendApiKey = existing.resendApiKey || "";

  const json = JSON.stringify(next);
  try {
    await env.DB.prepare(
      `INSERT INTO mail_settings (id, settings_json, updated_at)
       VALUES (1, ?, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET settings_json = excluded.settings_json, updated_at = excluded.updated_at`
    )
      .bind(json)
      .run();
  } catch {
    await env.CMS_CACHE.put("mail:settings", json);
  }
  return next;
}

function providerStatus(settings, env) {
  const resendReady =
    resendConfigured(env) && settings.resendFrom && settings.resendTransactional;
  return {
    gmail: "removed",
    resend: resendReady ? "configured" : resendConfigured(env) ? "pending" : "pending",
    resend_domain: resendConfigured(env) ? "check_dashboard" : "no_api_key",
    webhooks: {
      outbound: Boolean(env.RESEND_WEBHOOK_SECRET_OUTBOUND || env.RESEND_WEBHOOK_SECRET),
      inbound: Boolean(env.RESEND_WEBHOOK_SECRET_INBOUND),
    },
  };
}

function initialsFor(name, email) {
  const base = (name || email || "?").trim();
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase();
}

function formatMailDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`);
  if (Number.isNaN(d.getTime())) return iso;
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function rowToMessage(row, mailboxes = []) {
  const labels = JSON.parse(row.labels_json || "[]");
  const from = row.from_email || "Unknown";
  const senderName = from.includes("@") ? from.split("@")[0] : from;
  const metadata = JSON.parse(row.metadata_json || "{}");
  const mailbox = metadata.mailbox_id
    ? mailboxes.find((b) => b.id === metadata.mailbox_id)
    : matchMailboxForMessage(row, mailboxes);
  return {
    id: row.id,
    db_id: row.id,
    direction: row.direction,
    initials: initialsFor(senderName, from),
    color: row.direction === "inbound" ? "teal" : "orange",
    sender: senderName,
    email: from,
    to_email: row.to_email || "",
    subject: row.subject || "(no subject)",
    preview: row.preview || row.body_text?.slice(0, 160) || "",
    date: formatMailDate(row.created_at),
    fullDate: row.created_at,
    labels: labels.length ? labels : row.direction === "inbound" ? ["primary"] : ["updates"],
    type:
      row.direction === "inbound"
        ? "Inbound via Resend receiving."
        : `Outbound · ${row.status || "queued"}`,
    unread: row.status === "received" || row.status === "sent",
    starred: false,
    needs: row.direction === "inbound",
    brand: row.direction === "inbound" ? "Inbound" : "Outbound",
    tag: row.direction === "inbound" ? "Inbound" : "Sent",
    headline: row.subject || "(no subject)",
    cta: row.direction === "inbound" ? "Reply" : "View status",
    body_text: row.body_text || "",
    body_html: row.body_html || "",
    status: row.status,
    provider_id: row.provider_id,
    mailbox_id: mailbox?.id || metadata.mailbox_id || null,
    mailbox_label: mailbox?.label || null,
    mailbox_address: mailbox?.address || null,
  };
}

async function recordOutboundMessage(env, { id, from, to, subject, body, status = "sent", mailbox = null }) {
  const preview = (body || subject || "").slice(0, 240);
  const labels = mailbox?.kind === "payments" ? ["payments", "sent"] : ["primary", "sent"];
  await env.DB.prepare(
    `INSERT INTO mail_messages (
       id, direction, from_email, to_email, subject, preview, body_text,
       status, provider, provider_id, labels_json, metadata_json
     ) VALUES (?, 'outbound', ?, ?, ?, ?, ?, ?, 'resend', ?, ?, ?)`
  )
    .bind(
      `out_${id}`,
      from.includes("@") ? from.match(/<([^>]+)>/)?.[1] || from : from,
      to,
      subject,
      preview,
      body,
      status,
      id,
      JSON.stringify(labels),
      JSON.stringify({
        source: "admin.compose",
        mailbox_id: mailbox?.id || null,
        mailbox_address: mailbox?.address || null,
      })
    )
    .run()
    .catch(() => {});
}

async function resolveSendFrom(env, settings, body) {
  const slug = body.fromMailbox || body.mailbox || null;
  if (slug) {
    const mailbox = await getMailboxBySlug(env, slug);
    if (mailbox) {
      return {
        from: `${mailbox.resend_from_name || mailbox.label} <${mailbox.address}>`,
        mailbox,
      };
    }
  }
  if (body.fromProvider === "payments") {
    const mailbox = await getMailboxBySlug(env, "payments");
    const addr = settings.resendPaymentsFrom || mailbox?.address || "";
    return {
      from: `${mailbox?.resend_from_name || "Payments"} <${addr}>`,
      mailbox,
    };
  }
  return { from: settings.resendFrom, mailbox: null };
}

export async function getMailSettings(env) {
  const settings = await loadSettings(env);
  return {
    ok: true,
    settings: redactSettings(settings),
    providers: providerStatus(settings, env),
  };
}

export async function postMailSettings(request, env) {
  const body = await request.json().catch(() => null);
  if (!body) return Response.json({ error: "Invalid body" }, { status: 400 });

  const current = await loadSettings(env);
  const incoming = body.settings || body;
  const saved = await saveSettings(env, incoming);

  return Response.json({
    ok: true,
    settings: redactSettings(saved),
    providers: providerStatus(saved, env),
    section: body.section || "all",
  });
}

export async function getMailPartial(request, env) {
  const assetUrl = new URL(request.url);
  assetUrl.pathname = "/admin/partials/mail-app.html";
  const res = await env.ASSETS.fetch(new Request(assetUrl, request));
  if (!res.ok) {
    return Response.json({ error: "Mail UI partial missing" }, { status: 502 });
  }
  const html = await res.text();
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store" },
  });
}

export async function getMailMailboxes(env, user) {
  const mailboxes = user ? await getMailboxesForUser(env, user) : await listMailboxes(env);
  return Response.json({ ok: true, mailboxes });
}

export async function listMailMessages(env, url, user) {
  const mailboxSlug = url?.searchParams?.get("mailbox") || "";
  const { mailbox, forbidden } = await assertMailboxAccess(env, user, mailboxSlug || null);
  if (forbidden) {
    return Response.json({ error: "Forbidden mailbox" }, { status: 403 });
  }

  const mailboxes = user ? await getMailboxesForUser(env, user) : await listMailboxes(env);
  const activeBox = mailbox || (await getPrimaryMailboxForUser(env, user));

  try {
    let sql = `SELECT id, direction, from_email, to_email, subject, preview, body_text, body_html,
              status, provider, provider_id, labels_json, metadata_json, created_at
       FROM mail_messages`;
    const binds = [];

    if (activeBox) {
      const addr = activeBox.address.toLowerCase();
      const local = addr.split("@")[0];
      sql += ` WHERE (
        (direction = 'inbound' AND (LOWER(to_email) LIKE ? OR LOWER(to_email) = ?))
        OR (direction = 'outbound' AND (LOWER(from_email) = ? OR LOWER(from_email) LIKE ?))
        OR json_extract(metadata_json, '$.mailbox_id') = ?
      )`;
      binds.push(`%${addr}%`, addr, addr, `%${local}@%`, activeBox.id);
    }

    sql += ` ORDER BY datetime(created_at) DESC LIMIT 100`;

    const stmt = binds.length ? env.DB.prepare(sql).bind(...binds) : env.DB.prepare(sql);
    const { results } = await stmt.all();

    return Response.json({
      ok: true,
      messages: (results || []).map((row) => rowToMessage(row, mailboxes)),
      source: "d1",
      mailbox: activeBox?.id || null,
      mailbox_slug: activeBox?.address?.split("@")[0] || null,
    });
  } catch {
    return Response.json({ ok: true, messages: [], source: "d1", mailbox: null });
  }
}

async function userCanAccessMessage(env, user, row) {
  if (!row || !user) return false;
  const metadata = JSON.parse(row.metadata_json || "{}");
  const mailboxId = metadata.mailbox_id;
  if (mailboxId) {
    const mailboxes = await getMailboxesForUser(env, user);
    if (mailboxes.some((b) => b.id === mailboxId)) return true;
  }
  const to = (row.to_email || "").toLowerCase();
  const from = (row.from_email || "").toLowerCase();
  const allowed = await getMailboxesForUser(env, user);
  return allowed.some((box) => {
    const addr = box.address.toLowerCase();
    return to.includes(addr) || from.includes(addr);
  });
}

export async function hydrateInboundMessage(env, user, messageId) {
  const row = await env.DB.prepare(
    `SELECT id, direction, provider_id, body_text, body_html, to_email, from_email, metadata_json
     FROM mail_messages WHERE id = ?`
  )
    .bind(messageId)
    .first();

  if (!row) return Response.json({ error: "Message not found" }, { status: 404 });
  if (!(await userCanAccessMessage(env, user, row))) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  if (row.direction !== "inbound") {
    return Response.json({ error: "Only inbound messages can be hydrated" }, { status: 400 });
  }

  if (row.body_html || row.body_text) {
    return Response.json({
      ok: true,
      body_html: row.body_html || "",
      body_text: row.body_text || "",
      cached: true,
    });
  }

  const providerId = row.provider_id;
  if (!providerId) {
    return Response.json({ error: "No provider id on message" }, { status: 400 });
  }

  const received = await fetchReceivedEmail(env, providerId);
  if (!received.ok) {
    return Response.json({ error: received.error || "Could not fetch from Resend" }, { status: 502 });
  }

  const preview = (received.text || received.html?.replace(/<[^>]+>/g, " ") || row.subject || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);

  await env.DB.prepare(
    `UPDATE mail_messages
     SET body_text = ?, body_html = ?, preview = ?, updated_at = datetime('now')
     WHERE id = ?`
  )
    .bind(received.text || "", received.html || "", preview, messageId)
    .run();

  return Response.json({
    ok: true,
    body_html: received.html || "",
    body_text: received.text || "",
    preview,
    cached: false,
  });
}

export async function sendMailPreview(request, env) {
  const body = await request.json().catch(() => null);
  if (!body?.to || !body?.subject) {
    return Response.json({ error: "to and subject required" }, { status: 400 });
  }

  const settings = await loadSettings(env);
  const provider = "resend";
  const { from: resolvedFrom, mailbox } = await resolveSendFrom(env, settings, body);
  const payload = {
    from: resolvedFrom,
    to: body.to,
    subject: body.subject,
    replyTo: settings.resendReplyTo || null,
    body: body.body || "",
  };

  if (!settings.resendTransactional) {
    return Response.json({
      ok: false,
      preview: true,
      sent: false,
      provider,
      payload,
      error: "Resend transactional sending is disabled in mail settings.",
    }, { status: 400 });
  }

  if (!resendConfigured(env)) {
    return Response.json({
      ok: true,
      preview: true,
      sent: false,
      provider,
      payload,
      message: "Preview only — run: wrangler secret put RESEND_API_KEY",
    });
  }

  const html = payload.body.includes("<")
    ? payload.body
    : `<p>${payload.body.replace(/\n/g, "<br>")}</p>`;

  const result = await sendResendEmail(env, {
    from: resolvedFrom,
    to: body.to,
    subject: body.subject,
    html,
    text: payload.body,
    replyTo: payload.replyTo,
    tags: body.test ? ["admin-test"] : ["admin-compose"],
  });

  if (!result.ok) {
    return Response.json({
      ok: false,
      preview: false,
      sent: false,
      provider,
      payload,
      error: result.error,
      details: result.details,
    }, { status: 502 });
  }

  await recordOutboundMessage(env, {
    id: result.id,
    from: resolvedFrom,
    to: body.to,
    subject: body.subject,
    body: payload.body,
    status: "sent",
    mailbox,
  });

  return Response.json({
    ok: true,
    preview: false,
    sent: true,
    provider,
    payload,
    resend_id: result.id,
    message: `Sent via Resend (${result.id})`,
  });
}

export async function getResendStatus(env) {
  const settings = await loadSettings(env);
  const domain = settings.resendDomain || "";
  const status = await getResendDomainStatus(env, domain);
  const { getCompanyDomain } = await import("../lib/company.js");
  const appDomain = (await getCompanyDomain(env)) || domain || "fuelnfreetime.com";
  return Response.json({
    ok: true,
    configured: resendConfigured(env),
    domain,
    resend: status,
    providers: providerStatus(settings, env),
    webhooks: {
      outbound_url: `https://${appDomain}/api/webhooks/resend/outbound`,
      inbound_url: `https://${appDomain}/api/webhooks/resend/inbound`,
      legacy_url: `https://${appDomain}/api/agentsam/webhooks/resend`,
      outbound_events: [
        "email.sent",
        "email.delivered",
        "email.delivery_delayed",
        "email.bounced",
        "email.complained",
        "email.failed",
      ],
      inbound_events: ["email.received"],
    },
  });
}
