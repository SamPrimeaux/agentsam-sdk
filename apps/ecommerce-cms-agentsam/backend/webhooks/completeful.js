import {
  clientIp,
  insertAgentSamWebhookEvent,
  pickWebhookHeaders,
} from "../agentsam/webhook-events.js";

const STALE_WINDOW_SECONDS = 5 * 60;

function topicToEnvSuffix(topic) {
  return String(topic || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(sigBuf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqualHex(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function toUnix(value) {
  if (value == null || value === "") return null;
  if (Number.isFinite(Number(value))) {
    const n = Number(value);
    return n > 1e12 ? Math.floor(n / 1000) : Math.floor(n);
  }
  const ms = Date.parse(String(value));
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

function providerObjectId(event) {
  const data = event?.data || {};
  return (
    data.order_id ||
    data.product_id ||
    data.shop_id ||
    data.id ||
    event?.resource_id ||
    null
  );
}

async function lookupWebhook(env, topic) {
  try {
    return (
      (await env.DB.prepare(
        `SELECT id, provider_webhook_id, provider_resource_id, secret_ref
         FROM agentsam_webhooks
         WHERE provider = 'completeful'
           AND status = 'active'
           AND json_extract(events_json, '$[0]') = ?
         ORDER BY updated_at_unix DESC
         LIMIT 1`
      )
        .bind(topic)
        .first()) || {}
    );
  } catch {
    return {};
  }
}

export async function handleCompletefulWebhook(request, env) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const rawBody = await request.text();
  const headers = pickWebhookHeaders(request);
  const ipAddress = clientIp(request);
  const sigHeader = request.headers.get("x-capp-signature") || "";
  const [tPart, sigPart] = sigHeader.split(",");
  const t = (tPart || "").replace("t=", "").trim();
  const sig = (sigPart || "").replace("v1=", "").trim();

  let event = null;
  try {
    event = JSON.parse(rawBody);
  } catch {
    await insertAgentSamWebhookEvent(env, {
      provider: "completeful",
      eventType: "invalid_json",
      payload: rawBody,
      headers,
      metadata: { phase: "parse", ip_address: ipAddress },
      status: "failed",
      signatureValid: false,
      errorCode: "invalid_json",
      errorMessage: "invalid json",
      retryFailed: false,
    });
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  const topic = event?.type || "unknown";
  const registry = await lookupWebhook(env, topic);
  const envSuffix = topicToEnvSuffix(topic);
  const secret = env[`COMPLETEFUL_WEBHOOK_SECRET_${envSuffix}`];
  const providerEventId = event?.id || null;
  const providerCreatedAtUnix = toUnix(event?.created || event?.created_at);
  const objectId = providerObjectId(event);

  if (!t || !sig) {
    await insertAgentSamWebhookEvent(env, {
      webhookId: registry.id || null,
      provider: "completeful",
      eventType: topic,
      providerEventId,
      providerObjectId: objectId,
      payload: event,
      headers,
      metadata: { phase: "verify", ip_address: ipAddress },
      status: "failed",
      signatureValid: false,
      errorCode: "missing_signature",
      errorMessage: "missing signature",
      providerCreatedAtUnix,
      retryFailed: false,
    });
    return Response.json({ error: "missing signature" }, { status: 400 });
  }

  if (!secret) {
    await insertAgentSamWebhookEvent(env, {
      webhookId: registry.id || null,
      provider: "completeful",
      eventType: topic,
      providerEventId,
      providerObjectId: objectId,
      payload: event,
      headers,
      metadata: {
        phase: "verify",
        ip_address: ipAddress,
        expected_secret_ref: registry.secret_ref || `COMPLETEFUL_WEBHOOK_SECRET_${envSuffix}`,
      },
      status: "failed",
      signatureValid: false,
      errorCode: "secret_missing",
      errorMessage: `no secret configured for topic ${topic}`,
      providerCreatedAtUnix,
      retryFailed: false,
    });
    return Response.json({ error: "unknown topic" }, { status: 401 });
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - Number(t)) > STALE_WINDOW_SECONDS) {
    await insertAgentSamWebhookEvent(env, {
      webhookId: registry.id || null,
      provider: "completeful",
      eventType: topic,
      providerEventId,
      providerObjectId: objectId,
      payload: event,
      headers,
      metadata: { phase: "verify", ip_address: ipAddress },
      status: "failed",
      signatureValid: false,
      errorCode: "stale_signature",
      errorMessage: "stale signature timestamp",
      providerCreatedAtUnix,
      retryFailed: false,
    });
    return Response.json({ error: "stale" }, { status: 401 });
  }

  const expected = await hmacHex(secret, `${t}.${rawBody}`);
  if (!timingSafeEqualHex(sig.toLowerCase(), expected.toLowerCase())) {
    await insertAgentSamWebhookEvent(env, {
      webhookId: registry.id || null,
      provider: "completeful",
      eventType: topic,
      providerEventId,
      providerObjectId: objectId,
      payload: event,
      headers,
      metadata: { phase: "verify", ip_address: ipAddress },
      status: "failed",
      signatureValid: false,
      errorCode: "signature_mismatch",
      errorMessage: "signature mismatch",
      providerCreatedAtUnix,
      retryFailed: false,
    });
    return Response.json({ error: "bad signature" }, { status: 401 });
  }

  const claim = await insertAgentSamWebhookEvent(env, {
    webhookId: registry.id || null,
    provider: "completeful",
    eventType: topic,
    providerEventId,
    providerObjectId: objectId,
    payload: event,
    headers,
    metadata: {
      completeful_shop_id: registry.provider_resource_id || event?.data?.shop_id || null,
      completeful_webhook_id: registry.provider_webhook_id || null,
      ip_address: ipAddress,
    },
    status: "processed",
    signatureValid: true,
    providerCreatedAtUnix,
  });

  return Response.json(
    {
      ok: true,
      duplicate: claim.duplicate,
      agentsam_event_id: claim.id,
    },
    { status: 200 }
  );
}
