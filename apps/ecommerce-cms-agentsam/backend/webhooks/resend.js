import { verifyResendWebhookPayload, fetchReceivedEmail } from "../lib/resend.js";
import { listMailboxes } from "../lib/mail-mailboxes.js";
import {
  WEBHOOK_ENDPOINT_IDS,
  clientIp,
  insertAgentSamWebhookEvent,
  pickWebhookHeaders,
  resendEventMeta,
  updateAgentSamWebhookEvent,
} from "../agentsam/webhook-events.js";

const OUTBOUND_EVENTS = new Set([
  "email.sent",
  "email.delivered",
  "email.delivery_delayed",
  "email.bounced",
  "email.complained",
  "email.failed",
  "email.opened",
  "email.clicked",
]);

function normalizeAddress(value) {
  if (Array.isArray(value)) return value.map((v) => normalizeAddress(v)).filter(Boolean).join(", ");
  if (value && typeof value === "object") {
    if (typeof value.email === "string") return value.email.trim();
    if (typeof value.address === "string") return value.address.trim();
  }
  return String(value || "").trim();
}

async function applyOutboundEvent(env, event) {
  const type = event?.type;
  const data = event?.data || {};
  const providerId = data.email_id || data.id;
  if (!providerId) return;

  const statusMap = {
    "email.sent": "sent",
    "email.delivered": "delivered",
    "email.delivery_delayed": "delayed",
    "email.bounced": "bounced",
    "email.complained": "complained",
    "email.failed": "failed",
    "email.opened": "opened",
    "email.clicked": "clicked",
  };
  const status = statusMap[type];
  if (!status) return;

  await env.DB.prepare(
    `UPDATE mail_messages
     SET status = ?, metadata_json = ?, updated_at = datetime('now')
     WHERE provider_id = ? AND direction = 'outbound'`
  )
    .bind(status, JSON.stringify({ last_event: event }), providerId)
    .run()
    .catch(() => {});
}

async function applyInboundEvent(env, event, apiKey) {
  if (event?.type !== "email.received") return;
  const data = event.data || {};
  const providerId = data.email_id || data.id;
  if (!providerId) return;

  let subject = data.subject || "(no subject)";
  let fromEmail = normalizeAddress(data.from);
  let toEmail = normalizeAddress(data.to);
  let bodyText = "";
  let bodyHtml = "";

  if (apiKey && providerId) {
    const received = await fetchReceivedEmail(env, providerId);
    if (received.ok) {
      subject = received.subject || subject;
      fromEmail = normalizeAddress(received.from) || fromEmail;
      toEmail = normalizeAddress(received.to) || toEmail;
      bodyText = received.text || bodyText;
      bodyHtml = received.html || bodyHtml;
    }
  }

  const preview = (bodyText || subject || "Inbound message").slice(0, 240);
  const mailboxes = await listMailboxes(env).catch(() => []);
  const toHaystack = toEmail.toLowerCase();
  const mailbox = mailboxes.find((b) => {
    const addr = b.address.toLowerCase();
    return toHaystack.includes(addr);
  });
  const labelSlug = (mailbox?.label || mailbox?.address?.split("@")[0] || "primary").toLowerCase();
  const labels = mailbox
    ? ["inbound", mailbox.kind === "payments" ? "payments" : "primary", labelSlug]
    : ["inbound", "primary"];

  await env.DB.prepare(
    `INSERT INTO mail_messages (
       id, direction, from_email, to_email, subject, preview, body_text, body_html,
       status, provider, provider_id, labels_json, metadata_json
     ) VALUES (?, 'inbound', ?, ?, ?, ?, ?, ?, 'received', 'resend', ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       from_email = excluded.from_email,
       to_email = excluded.to_email,
       subject = excluded.subject,
       preview = excluded.preview,
       body_text = CASE WHEN excluded.body_text != '' THEN excluded.body_text ELSE mail_messages.body_text END,
       body_html = CASE WHEN excluded.body_html != '' THEN excluded.body_html ELSE mail_messages.body_html END,
       labels_json = excluded.labels_json,
       metadata_json = excluded.metadata_json,
       updated_at = datetime('now')`
  )
    .bind(
      `in_${providerId}`,
      fromEmail,
      toEmail,
      subject,
      preview,
      bodyText,
      bodyHtml,
      providerId,
      JSON.stringify(labels),
      JSON.stringify({
        source: "resend.inbound",
        mailbox_id: mailbox?.id || null,
        mailbox_address: mailbox?.address || null,
        event,
      })
    )
    .run()
    .catch(() => {});
}

async function handleResendChannel(request, env, { channel, webhookId, secret }) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const payload = await request.text();
  const headers = pickWebhookHeaders(request);
  const ipAddress = clientIp(request);

  let event;
  try {
    event = await verifyResendWebhookPayload(payload, request.headers, secret);
  } catch (err) {
    let parsed = null;
    try {
      parsed = JSON.parse(payload);
    } catch {
      parsed = null;
    }
    const { eventType, providerEventId, providerObjectId } = resendEventMeta(parsed, headers);
    await insertAgentSamWebhookEvent(env, {
      webhookId,
      provider: "resend",
      eventType: eventType === "unknown" ? "auth.failed" : eventType,
      providerEventId,
      providerObjectId,
      payload: parsed,
      headers,
      metadata: { channel, phase: "verify", ip_address: ipAddress },
      status: "failed",
      signatureValid: false,
      errorCode: "invalid_signature",
      errorMessage: err?.message || "Invalid webhook",
      retryFailed: false,
    });

    return Response.json({ error: err.message || "Invalid webhook" }, { status: 401 });
  }

  const { eventType, providerEventId, providerObjectId } = resendEventMeta(event, headers);
  const claim = await insertAgentSamWebhookEvent(env, {
    webhookId,
    provider: "resend",
    eventType,
    providerEventId,
    providerObjectId,
    payload: event,
    headers,
    metadata: { channel, mail_table: "mail_messages", ip_address: ipAddress },
    status: "processing",
    signatureValid: true,
  });

  if (claim.duplicate) {
    return Response.json({
      ok: true,
      duplicate: true,
      channel,
      type: eventType,
      provider_id: providerObjectId,
      agentsam_event_id: claim.id,
    });
  }

  try {
    if (channel === "outbound") {
      if (OUTBOUND_EVENTS.has(eventType)) await applyOutboundEvent(env, event);
    } else if (eventType === "email.received") {
      await applyInboundEvent(env, event, env.RESEND_API_KEY);
    }

    const handled =
      channel === "outbound" ? OUTBOUND_EVENTS.has(eventType) : eventType === "email.received";

    await updateAgentSamWebhookEvent(env, claim.id, {
      status: handled ? "processed" : "ignored",
      metadata: {
        channel,
        provider_id: providerObjectId,
        mail_table: "mail_messages",
        duplicate: false,
        retry: claim.retry,
      },
    });

    return Response.json({
      ok: true,
      channel,
      type: eventType,
      provider_id: providerObjectId,
      agentsam_event_id: claim.id,
      retry: claim.retry,
    });
  } catch (err) {
    await updateAgentSamWebhookEvent(env, claim.id, {
      status: "failed",
      errorCode: "processing_failed",
      processingError: err?.message || "Webhook processing failed",
      metadata: { channel, provider_id: providerObjectId },
    });
    console.error(`[resend-${channel}]`, err);
    return Response.json(
      { ok: false, error: err?.message || "Webhook processing failed" },
      { status: 500 }
    );
  }
}

export async function handleResendOutboundWebhook(request, env) {
  const secret = env.RESEND_WEBHOOK_SECRET_OUTBOUND || env.RESEND_WEBHOOK_SECRET || "";
  return handleResendChannel(request, env, {
    channel: "outbound",
    webhookId: WEBHOOK_ENDPOINT_IDS.resend_outbound,
    secret,
  });
}

export async function handleResendInboundWebhook(request, env) {
  const secret = env.RESEND_WEBHOOK_SECRET_INBOUND || "";
  return handleResendChannel(request, env, {
    channel: "inbound",
    webhookId: WEBHOOK_ENDPOINT_IDS.resend_inbound,
    secret,
  });
}

/** Legacy single endpoint — treats as outbound. */
export async function handleResendWebhookLegacy(request, env) {
  const secret = env.RESEND_WEBHOOK_SECRET_OUTBOUND || env.RESEND_WEBHOOK_SECRET || "";
  return handleResendChannel(request, env, {
    channel: "outbound",
    webhookId: WEBHOOK_ENDPOINT_IDS.resend_legacy,
    secret,
  });
}
