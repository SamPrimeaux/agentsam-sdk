import { FNF_ACCOUNT_ID } from "./constants.js";

export const WEBHOOK_ENDPOINT_IDS = {
  resend_inbound: "awh_resend_inbound",
  resend_outbound: "awh_resend_outbound",
  resend_legacy: "awh_resend_events",
  stripe_checkout: "awh_stripe_checkout",
};

const DAY = 86400;

function newRowId() {
  return `whe_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

function retentionForStatus(status, now = Math.floor(Date.now() / 1000)) {
  if (status === "ignored") {
    return { payloadExpiresAt: now + 3 * DAY, expiresAt: now + 14 * DAY };
  }
  if (status === "failed" || status === "dead_letter") {
    return { payloadExpiresAt: now + 30 * DAY, expiresAt: now + 90 * DAY };
  }
  return { payloadExpiresAt: now + 7 * DAY, expiresAt: now + 30 * DAY };
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(String(value ?? ""))
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function resolveDedupeKey({
  dedupeKey,
  providerEventId,
  providerObjectId,
  provider,
  eventType,
  providerCreatedAtUnix,
  payload,
  headers,
}) {
  if (dedupeKey) return String(dedupeKey);
  if (providerEventId) return `event:${providerEventId}`;

  const deliveryId =
    headers?.["svix-id"] ||
    headers?.["x-webhook-id"] ||
    headers?.["x-request-id"] ||
    null;
  if (deliveryId) return `delivery:${deliveryId}`;

  if (providerObjectId) {
    return `object:${providerObjectId}:${eventType}:${providerCreatedAtUnix || ""}`;
  }

  return `hash:${await sha256Hex(
    JSON.stringify({
      provider,
      eventType,
      providerCreatedAtUnix: providerCreatedAtUnix || null,
      payload: payload ?? null,
    })
  )}`;
}

export function pickWebhookHeaders(request) {
  const keys = [
    "svix-id",
    "svix-timestamp",
    "svix-signature",
    "stripe-signature",
    "x-capp-signature",
    "x-webhook-id",
    "x-request-id",
    "content-type",
    "user-agent",
  ];
  const out = {};
  for (const key of keys) {
    const value = request.headers.get(key);
    if (value) out[key] = value;
  }
  return out;
}

export function clientIp(request) {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    null
  );
}

export function resendEventMeta(event, headers = {}) {
  const eventType = event?.type || "unknown";
  const providerObjectId = event?.data?.email_id || event?.data?.id || null;
  const providerEventId = headers["svix-id"] || event?.id || null;
  return { eventType, providerEventId, providerObjectId };
}

export async function insertAgentSamWebhookEvent(
  env,
  {
    webhookId = null,
    endpointId = null,
    provider,
    eventType,
    providerEventId = null,
    providerObjectId = null,
    eventId = null,
    dedupeKey = null,
    payload = null,
    headers = null,
    metadata = {},
    status = "received",
    signatureValid = true,
    errorCode = null,
    errorMessage = null,
    processingError = null,
    providerCreatedAtUnix = null,
    retryFailed = true,
  }
) {
  const id = newRowId();
  const now = Math.floor(Date.now() / 1000);
  const resolvedWebhookId = webhookId || endpointId || null;
  const resolvedObjectId = providerObjectId || eventId || null;
  const resolvedDedupeKey = await resolveDedupeKey({
    dedupeKey,
    providerEventId,
    providerObjectId: resolvedObjectId,
    provider,
    eventType,
    providerCreatedAtUnix,
    payload,
    headers,
  });
  const { payloadExpiresAt, expiresAt } = retentionForStatus(status, now);
  const terminal = new Set(["processed", "failed", "ignored", "dead_letter"]);
  const processedAt = terminal.has(status) ? now : null;

  try {
    const result = await env.DB.prepare(
      `INSERT INTO agentsam_webhook_events (
         id, account_id, webhook_id, provider, event_type,
         provider_event_id, provider_object_id, dedupe_key,
         status, signature_valid, attempt_count,
         payload_json, headers_json, metadata_json,
         error_code, error_message, processing_error,
         provider_created_at_unix, received_at_unix, processed_at_unix,
         payload_expires_at_unix, expires_at_unix
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(account_id, provider, dedupe_key) DO NOTHING`
    )
      .bind(
        id,
        FNF_ACCOUNT_ID,
        resolvedWebhookId,
        provider,
        eventType,
        providerEventId,
        resolvedObjectId,
        resolvedDedupeKey,
        status,
        signatureValid == null ? null : signatureValid ? 1 : 0,
        payload != null ? JSON.stringify(payload) : null,
        headers != null ? JSON.stringify(headers) : null,
        JSON.stringify(metadata || {}),
        errorCode,
        errorMessage,
        processingError,
        providerCreatedAtUnix,
        now,
        processedAt,
        payloadExpiresAt,
        expiresAt
      )
      .run();

    if ((result.meta?.changes ?? 0) > 0) {
      if (resolvedWebhookId) {
        await env.DB.prepare(
          `UPDATE agentsam_webhooks
           SET last_event_at_unix = ?, updated_at_unix = ?
           WHERE id = ? AND account_id = ?`
        )
          .bind(now, now, resolvedWebhookId, FNF_ACCOUNT_ID)
          .run()
          .catch(() => {});
      }
      return {
        id,
        duplicate: false,
        retry: false,
        status,
        dedupeKey: resolvedDedupeKey,
      };
    }

    const existing = await env.DB.prepare(
      `SELECT id, status, attempt_count
       FROM agentsam_webhook_events
       WHERE account_id = ? AND provider = ? AND dedupe_key = ?
       LIMIT 1`
    )
      .bind(FNF_ACCOUNT_ID, provider, resolvedDedupeKey)
      .first();

    if (
      existing?.id &&
      retryFailed &&
      (existing.status === "failed" || existing.status === "dead_letter")
    ) {
      const retryRetention = retentionForStatus("processing", now);
      await env.DB.prepare(
        `UPDATE agentsam_webhook_events
         SET status = 'processing',
             attempt_count = COALESCE(attempt_count, 0) + 1,
             signature_valid = ?,
             payload_json = COALESCE(?, payload_json),
             headers_json = COALESCE(?, headers_json),
             metadata_json = ?,
             error_code = NULL,
             error_message = NULL,
             processing_error = NULL,
             processed_at_unix = NULL,
             payload_expires_at_unix = ?,
             expires_at_unix = ?
         WHERE id = ?`
      )
        .bind(
          signatureValid == null ? null : signatureValid ? 1 : 0,
          payload != null ? JSON.stringify(payload) : null,
          headers != null ? JSON.stringify(headers) : null,
          JSON.stringify(metadata || {}),
          retryRetention.payloadExpiresAt,
          retryRetention.expiresAt,
          existing.id
        )
        .run();

      return {
        id: existing.id,
        duplicate: false,
        retry: true,
        status: "processing",
        dedupeKey: resolvedDedupeKey,
      };
    }

    return {
      id: existing?.id || null,
      duplicate: true,
      retry: false,
      status: existing?.status || null,
      dedupeKey: resolvedDedupeKey,
    };
  } catch (err) {
    console.error("[agentsam_webhook_events] insert failed", err?.message || err);
    return {
      id: null,
      duplicate: false,
      retry: false,
      status: null,
      dedupeKey: resolvedDedupeKey,
      error: err?.message || String(err),
    };
  }
}

export async function updateAgentSamWebhookEvent(
  env,
  id,
  {
    status,
    errorCode = null,
    errorMessage = null,
    processingError = null,
    metadata = null,
  }
) {
  if (!id) return { ok: false, reason: "missing_event_id" };

  const now = Math.floor(Date.now() / 1000);
  const { payloadExpiresAt, expiresAt } = retentionForStatus(status, now);
  const terminal = new Set(["processed", "failed", "ignored", "dead_letter"]);
  const processedAt = terminal.has(status) ? now : null;

  try {
    const result = await env.DB.prepare(
      `UPDATE agentsam_webhook_events
       SET status = ?,
           error_code = CASE WHEN ? IS NOT NULL THEN ? ELSE error_code END,
           error_message = CASE WHEN ? IS NOT NULL THEN ? ELSE error_message END,
           processing_error = CASE WHEN ? IS NOT NULL THEN ? ELSE processing_error END,
           metadata_json = CASE WHEN ? IS NOT NULL THEN ? ELSE metadata_json END,
           processed_at_unix = ?,
           payload_expires_at_unix = ?,
           expires_at_unix = ?
       WHERE id = ? AND account_id = ?`
    )
      .bind(
        status,
        errorCode,
        errorCode,
        errorMessage,
        errorMessage,
        processingError,
        processingError,
        metadata != null ? 1 : null,
        metadata != null ? JSON.stringify(metadata) : null,
        processedAt,
        payloadExpiresAt,
        expiresAt,
        id,
        FNF_ACCOUNT_ID
      )
      .run();
    return { ok: true, changes: result.meta?.changes ?? 0 };
  } catch (err) {
    console.error("[agentsam_webhook_events] update failed", err?.message || err);
    return { ok: false, error: err?.message || String(err) };
  }
}
