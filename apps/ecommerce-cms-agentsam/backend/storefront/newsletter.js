import { sendResendEmail, resendConfigured } from "../lib/resend.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_SOURCE_TYPES = new Set(["form", "footer", "popup", "cms_block", "newsletter"]);
const CONFIRMATION_TTL_MS = 48 * 60 * 60 * 1000;

function jsonResponse(payload, status = 200) {
  return Response.json(payload, { status, headers: { "cache-control": "no-store" } });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

function htmlResponse(title, message, status = 200) {
  return new Response(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} · Fuel &amp; Free Time</title>
<style>
:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#080908;color:#f4f1e9}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(ellipse at top right,#382014 0,transparent 46%),#080908}
main{width:min(100%,560px);padding:clamp(28px,6vw,56px);border:1px solid #35332e;border-radius:20px;background:#121310;box-shadow:0 24px 90px #0008}
.eyebrow{margin:0 0 14px;color:#ff6b1a;font-size:11px;font-weight:800;letter-spacing:.18em;text-transform:uppercase}h1{margin:0 0 16px;font-size:clamp(30px,6vw,46px);line-height:1.02;letter-spacing:-.04em}p{color:#c5c3bc;line-height:1.7}a{display:inline-block;margin-top:16px;padding:13px 20px;border-radius:999px;background:#ff5a0a;color:#111;text-decoration:none;font-size:12px;font-weight:800;letter-spacing:.04em}
</style></head><body><main><p class="eyebrow">Fuel &amp; Free Time · The Dispatch</p><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><a href="/">BACK TO THE STOREFRONT</a></main></body></html>`, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}

function textValue(value, maxLength = 200) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function createToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(String(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function parseAttribution(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "{}";
  const allowed = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "referrer"];
  const attribution = {};
  for (const key of allowed) {
    const candidate = textValue(value[key], 180);
    if (candidate) attribution[key] = candidate;
  }
  return JSON.stringify(attribution);
}

function parseMetadata(value) {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function readSignupBody(request) {
  const contentType = request.headers.get("content-type") || "";
  try {
    if (contentType.includes("application/json")) return await request.json();
    if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      return Object.fromEntries(form.entries());
    }
  } catch {
    return null;
  }
  return null;
}

async function sendProviderEmail(env, message) {
  return sendResendEmail(env, {
    from: env.NEWSLETTER_FROM_EMAIL || env.RESEND_FROM_EMAIL || null,
    ...message,
  });
}

function confirmationContent(request, token, firstName) {
  const confirmUrl = new URL("/api/newsletter/confirm", request.url);
  confirmUrl.searchParams.set("token", token);
  const greeting = firstName ? `Hi ${escapeHtml(firstName)},` : "You're almost there.";
  return {
    url: confirmUrl.toString(),
    html: `<div style="background:#080908;color:#f4f1e9;padding:32px;font-family:Arial,sans-serif"><p style="color:#ff6b1a;font-size:11px;font-weight:bold;letter-spacing:2px">FUEL &amp; FREE TIME · THE DISPATCH</p><h1 style="font-size:30px;line-height:1.05">One quick confirmation.</h1><p>${greeting}</p><p>Confirm your email to get first access to drops, event invites, and the stories that matter.</p><p><a href="${escapeHtml(confirmUrl.toString())}" style="display:inline-block;background:#ff5a0a;color:#111;padding:14px 22px;border-radius:999px;text-decoration:none;font-weight:bold">CONFIRM MY SUBSCRIPTION</a></p><p style="color:#aaa">This link expires in 48 hours. If you didn't request this, you can ignore this email.</p></div>`,
    text: `Fuel & Free Time — The Dispatch\n\nConfirm your email to get first access to drops, event invites, and the stories that matter.\n\nConfirm here: ${confirmUrl}\n\nThis link expires in 48 hours. If you didn't request this, ignore this email.`,
  };
}

export async function handleNewsletterSignup(request, env) {
  const body = await readSignupBody(request);
  if (!body || typeof body !== "object") return jsonResponse({ ok: false, error: "Invalid request body." }, 400);

  const email = textValue(body.email, 254).toLowerCase();
  if (!EMAIL_RE.test(email)) return jsonResponse({ ok: false, error: "Enter a valid email address." }, 400);
  if (!resendConfigured(env)) {
    return jsonResponse({ ok: false, error: "Email confirmation is temporarily unavailable. Please try again shortly." }, 503);
  }

  const firstName = textValue(body.first_name, 100);
  const lastName = textValue(body.last_name, 100);
  const sourcePath = textValue(body.source_path || body.source_page || new URL(request.url).pathname, 300) || "/";
  const sourceTypeCandidate = textValue(body.source_type, 40).toLowerCase();
  const sourceType = ALLOWED_SOURCE_TYPES.has(sourceTypeCandidate) ? sourceTypeCandidate : "form";
  const sourceRef = textValue(body.source_ref, 120) || null;
  const consentText = textValue(body.consent_text, 500) || "Submitted the Fuel & Free Time newsletter signup form.";
  const attributionJson = parseAttribution(body.attribution);

  const existing = await env.DB.prepare(
    "SELECT id, status, metadata_json FROM newsletter_subscribers WHERE email = ? LIMIT 1"
  ).bind(email).first();
  if (existing?.status === "subscribed") {
    return jsonResponse({ ok: true, status: "subscribed", message: "You're already subscribed." });
  }
  if (existing && ["bounced", "complained"].includes(existing.status)) {
    return jsonResponse({ ok: false, error: "This address cannot be subscribed. Please contact us for help." }, 409);
  }

  const token = createToken();
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + CONFIRMATION_TTL_MS).toISOString();
  const metadata = {
    ...parseMetadata(existing?.metadata_json),
    confirmation_expires_at: expiresAt,
    confirmation_requested_at: new Date().toISOString(),
  };
  const metadataJson = JSON.stringify(metadata);

  if (existing) {
    await env.DB.prepare(`UPDATE newsletter_subscribers SET
      first_name = ?, last_name = ?, status = 'pending', source_type = ?, source_ref = ?, source_path = ?,
      attribution_json = ?, consent_text = ?, consent_ip_hash = NULL, confirm_token_hash = ?,
      confirmed_at = NULL, subscribed_at = NULL, unsubscribed_at = NULL,
      metadata_json = ?, last_event_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?`)
      .bind(firstName || null, lastName || null, sourceType, sourceRef, sourcePath, attributionJson,
        consentText, tokenHash, metadataJson, existing.id).run();
  } else {
    await env.DB.prepare(`INSERT INTO newsletter_subscribers
      (email, first_name, last_name, status, source_type, source_ref, source_path, attribution_json,
       consent_text, consent_ip_hash, confirm_token_hash, metadata_json, last_event_at)
      VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, NULL, ?, ?, datetime('now'))`)
      .bind(email, firstName || null, lastName || null, sourceType, sourceRef, sourcePath,
        attributionJson, consentText, tokenHash, metadataJson).run();
  }

  const confirmation = confirmationContent(request, token, firstName);
  const delivery = await sendProviderEmail(env, {
    to: email,
    subject: "Confirm your Fuel & Free Time subscription",
    html: confirmation.html,
    text: confirmation.text,
    tags: [{ name: "type", value: "newsletter_confirmation" }],
  });
  if (!delivery.ok) {
    console.warn("[newsletter] confirmation email could not be sent", { status: delivery.status || 0 });
    return jsonResponse({ ok: false, status: "pending", error: "Your signup was saved, but we couldn't send the confirmation email. Please try again shortly." }, 502);
  }

  return jsonResponse({ ok: true, status: "pending", message: "Check your inbox for a confirmation link to finish subscribing." });
}

export async function handleNewsletterConfirm(request, env, url = new URL(request.url)) {
  const token = textValue(url.searchParams.get("token"), 128);
  if (!/^[a-f0-9]{64}$/i.test(token)) {
    return htmlResponse("Confirmation link not valid", "This link is missing or malformed. Return to the storefront and request a fresh confirmation email.", 400);
  }

  const tokenHash = await sha256Hex(token);
  const subscriber = await env.DB.prepare(`SELECT id, email, first_name, status, metadata_json, unsubscribe_token
    FROM newsletter_subscribers WHERE confirm_token_hash = ? LIMIT 1`).bind(tokenHash).first();
  if (!subscriber || subscriber.status !== "pending") {
    return htmlResponse("Link already used or expired", "This confirmation link is no longer active. If you still want updates, return to the storefront and sign up again.", 404);
  }

  const metadata = parseMetadata(subscriber.metadata_json);
  const expiresAt = Date.parse(metadata.confirmation_expires_at || "");
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) {
    metadata.confirmation_expires_at = null;
    metadata.confirmation_expired_at = new Date().toISOString();
    await env.DB.prepare(`UPDATE newsletter_subscribers SET confirm_token_hash = NULL, metadata_json = ?,
      last_event_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`)
      .bind(JSON.stringify(metadata), subscriber.id).run();
    return htmlResponse("Confirmation link expired", "This link expired after 48 hours. Return to the storefront and sign up again to receive a fresh confirmation email.", 410);
  }

  metadata.confirmation_expires_at = null;
  metadata.confirmation_confirmed_at = new Date().toISOString();
  await env.DB.prepare(`UPDATE newsletter_subscribers SET status = 'subscribed', confirmed_at = datetime('now'),
    subscribed_at = COALESCE(subscribed_at, datetime('now')), confirm_token_hash = NULL,
    metadata_json = ?, last_event_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`)
    .bind(JSON.stringify(metadata), subscriber.id).run();

  const unsubscribeUrl = new URL("/api/newsletter/unsubscribe", request.url);
  unsubscribeUrl.searchParams.set("token", subscriber.unsubscribe_token);
  const firstName = textValue(subscriber.first_name, 100);
  const welcome = await sendProviderEmail(env, {
    to: subscriber.email,
    subject: "You're on the Fuel & Free Time list",
    html: `<div style="background:#080908;color:#f4f1e9;padding:32px;font-family:Arial,sans-serif"><p style="color:#ff6b1a;font-size:11px;font-weight:bold;letter-spacing:2px">FUEL &amp; FREE TIME · THE DISPATCH</p><h1 style="font-size:30px;line-height:1.05">You're on the list${firstName ? `, ${escapeHtml(firstName)}` : ""}.</h1><p>Thanks for joining. We'll send you the drops, invites, and stories worth your time.</p><p style="color:#aaa;font-size:12px">Want fewer emails? <a href="${escapeHtml(unsubscribeUrl.toString())}" style="color:#ff8a4b">Unsubscribe here</a>.</p></div>`,
    text: `Fuel & Free Time — The Dispatch\n\nYou're on the list${firstName ? `, ${firstName}` : ""}. Thanks for joining.\n\nUnsubscribe: ${unsubscribeUrl}`,
    tags: [{ name: "type", value: "newsletter_welcome" }],
  });
  if (!welcome.ok) console.warn("[newsletter] welcome email could not be sent", { status: welcome.status || 0 });

  return htmlResponse("You're on the list.", welcome.ok
    ? "Your email is confirmed. You're subscribed to Fuel & Free Time updates. Keep an eye on your inbox."
    : "Your email is confirmed and your subscription is active. We couldn't send the welcome note, but you're all set.");
}

export async function handleNewsletterUnsubscribe(request, env, url = new URL(request.url)) {
  const token = textValue(url.searchParams.get("token"), 128);
  if (!/^[a-f0-9]{32}$/i.test(token)) {
    return htmlResponse("Unsubscribe link not valid", "This link is missing or malformed. If you need help managing your subscription, contact us.", 400);
  }

  const subscriber = await env.DB.prepare(`SELECT id, status FROM newsletter_subscribers
    WHERE unsubscribe_token = ? LIMIT 1`).bind(token).first();
  if (!subscriber) return htmlResponse("Subscription not found", "We couldn't find an active subscription for this link.", 404);
  if (subscriber.status !== "unsubscribed") {
    await env.DB.prepare(`UPDATE newsletter_subscribers SET status = 'unsubscribed', unsubscribed_at = datetime('now'),
      confirm_token_hash = NULL, last_event_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`)
      .bind(subscriber.id).run();
  }
  return htmlResponse("You're unsubscribed.", "You won't receive further Fuel & Free Time newsletter emails. If this was a mistake, you can sign up again from the storefront.");
}
