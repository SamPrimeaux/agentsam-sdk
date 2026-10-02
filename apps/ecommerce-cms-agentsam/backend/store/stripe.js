// src/store/stripe.js
// Stripe checkout redirect paths — per docs/RUNTIME-CONTRACTS-STRIPE.md Task 3.
// Paths are code constants, NOT wrangler.toml [vars]. Only Stripe keys are secrets.

export const CHECKOUT_SUCCESS_PATH = "/order-confirmation";
export const CHECKOUT_CANCEL_PATH = "/cart.html";

export function checkoutUrls(request) {
  const base = new URL(request.url).origin;
  return {
    success: `${base}${CHECKOUT_SUCCESS_PATH}?session_id={CHECKOUT_SESSION_ID}`,
    cancel: `${base}${CHECKOUT_CANCEL_PATH}?cancelled=1`,
  };
}

// --- Task 4: Stripe REST client + webhook signature verification ---
// Pure functions, no Stripe SDK and no nodejs_compat: global fetch + Web Crypto only.

// (2) Form-encoder for Stripe's bracket notation. Flattens a nested object/array
// into x-www-form-urlencoded keys like line_items[0][price_data][currency]=usd.
export function encodeStripeForm(obj) {
  const pairs = [];
  const walk = (value, prefix) => {
    if (value === null || value === undefined) return;
    if (Array.isArray(value)) {
      value.forEach((v, i) => walk(v, `${prefix}[${i}]`));
    } else if (typeof value === "object") {
      for (const [k, v] of Object.entries(value)) {
        walk(v, prefix ? `${prefix}[${k}]` : k);
      }
    } else {
      pairs.push(`${encodeURIComponent(prefix)}=${encodeURIComponent(value)}`);
    }
  };
  walk(obj, "");
  return pairs.join("&");
}

// (1) Minimal Stripe REST call. Never logs the secret key.
export async function stripeRequest(env, method, path, formBody) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formBody,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || `Stripe request failed (${res.status})`);
  }
  return data;
}

// (3) Create a Checkout Session. lineItems: [{ name, amountCents, qty }].
// Optional couponId applies a Stripe coupon (serializes to discounts[0][coupon]=...).
export async function createCheckoutSession(
  env,
  { orderId, email, lineItems, successUrl, cancelUrl, couponId },
) {
  const params = {
    mode: "payment",
    success_url: successUrl,
    cancel_url: cancelUrl,
    customer_email: email,
    metadata: {
      order_id: orderId,
      customer_email: email,
    },
    payment_intent_data: { metadata: { order_id: orderId } },
    line_items: lineItems.map((item) => ({
      price_data: {
        currency: "usd",
        product_data: { name: item.name },
        unit_amount: item.amountCents,
      },
      quantity: item.qty,
    })),
  };
  if (couponId) {
    params.discounts = [{ coupon: couponId }];
  }
  return stripeRequest(env, "POST", "/checkout/sessions", encodeStripeForm(params));
}

// Constant-time string comparison (length check + XOR accumulate). Not ===.
function constantTimeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

// (4) SECURITY CRITICAL: verify a Stripe webhook signature using SubtleCrypto.
// rawBody must be the exact bytes/string as received — do not re-serialize.
export async function constructWebhookEvent(rawBody, signatureHeader, secret) {
  if (!signatureHeader) throw new Error("Missing Stripe-Signature header");

  // Parse comma-separated k=v pairs; capture t and ALL v1 values.
  let t = null;
  const v1s = [];
  for (const part of signatureHeader.split(",")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key === "t") t = value;
    else if (key === "v1") v1s.push(value);
  }
  if (!t || v1s.length === 0) throw new Error("Invalid Stripe-Signature header");

  const signedPayload = `${t}.${rawBody}`;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(signedPayload));
  const expected = [...new Uint8Array(sigBuf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Valid if ANY provided v1 matches, compared in constant time.
  const matched = v1s.some((v1) => constantTimeEqual(expected, v1));
  if (!matched) throw new Error("Stripe signature verification failed");

  // Replay tolerance: reject timestamps more than 5 minutes from now.
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - Number(t)) > 300) {
    throw new Error("Stripe signature timestamp outside tolerance");
  }

  return JSON.parse(rawBody);
}

// --- Tasks 6-7: one-time coupon for cart-level discounts ---
// Create a single-use, fixed-amount coupon. Returns the parsed coupon (has .id).
export async function createCoupon(env, { amountOffCents, currency = "usd" }) {
  return stripeRequest(
    env,
    "POST",
    "/coupons",
    encodeStripeForm({ amount_off: amountOffCents, currency, duration: "once" }),
  );
}
