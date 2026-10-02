// Stripe webhook handler.
// The canonical agentsam_webhook_events ledger is the idempotency + audit source.

import { constructWebhookEvent } from "./stripe.js";
import { commitReservations, releaseReservations } from "./inventory.js";
import { recordDiscountRedemption } from "../lib/discounts.js";
import { sendOrderConfirmationEmail } from "./order-email.js";
import {
  WEBHOOK_ENDPOINT_IDS,
  insertAgentSamWebhookEvent,
  pickWebhookHeaders,
  updateAgentSamWebhookEvent,
} from "../agentsam/webhook-events.js";

export async function handleStripeWebhook(request, env) {
  const rawBody = await request.text();
  const sig = request.headers.get("Stripe-Signature");
  const headers = pickWebhookHeaders(request);

  let event;
  try {
    event = await constructWebhookEvent(rawBody, sig, env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    let parsed = null;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      parsed = null;
    }
    await insertAgentSamWebhookEvent(env, {
      webhookId: WEBHOOK_ENDPOINT_IDS.stripe_checkout,
      provider: "stripe",
      eventType: parsed?.type || "auth.failed",
      providerEventId: parsed?.id || null,
      providerObjectId: parsed?.data?.object?.id || null,
      payload: parsed,
      headers,
      metadata: { phase: "verify" },
      status: "failed",
      signatureValid: false,
      errorCode: "invalid_signature",
      errorMessage: err?.message || "Invalid signature",
      retryFailed: false,
    });
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  const obj = event.data.object;
  const claim = await insertAgentSamWebhookEvent(env, {
    webhookId: WEBHOOK_ENDPOINT_IDS.stripe_checkout,
    provider: "stripe",
    eventType: event.type,
    providerEventId: event.id,
    providerObjectId: obj?.id || null,
    payload: event,
    headers,
    metadata: { object_type: obj?.object || null },
    status: "processing",
    signatureValid: true,
    providerCreatedAtUnix: Number.isFinite(Number(event.created)) ? Number(event.created) : null,
  });

  if (claim.duplicate) {
    return Response.json({ received: true, duplicate: true, agentsam_event_id: claim.id });
  }

  const dispatch = async () => {
    switch (event.type) {
      case "checkout.session.completed": {
        const orderId = Number(obj.metadata?.order_id);
        if (!orderId) return false;

        await env.DB.prepare(
          `UPDATE orders SET status='paid', paid_at=datetime('now'), stripe_payment_intent_id=? WHERE id=?`
        )
          .bind(obj.payment_intent, orderId)
          .run();

        const result = await commitReservations(env, orderId);
        if (!result.ok) {
          console.warn("stripe webhook: oversold shortfall on order", orderId, result.shortfalls);
        }

        const order = await env.DB.prepare(
          `SELECT discount_id, customer_email, discount_cents FROM orders WHERE id=?`
        )
          .bind(orderId)
          .first();
        if (order?.discount_id) {
          await recordDiscountRedemption(env, {
            discountId: order.discount_id,
            orderId,
            customerEmail: order.customer_email,
            amountCents: order.discount_cents,
          });
        }

        await sendOrderConfirmationEmail(env, orderId);
        return true;
      }

      case "checkout.session.expired": {
        const orderId = Number(obj.metadata?.order_id);
        if (!orderId) return false;

        await env.DB.prepare(
          `UPDATE orders SET status='expired' WHERE id=? AND status='awaiting_payment'`
        )
          .bind(orderId)
          .run();
        await releaseReservations(env, orderId);
        return true;
      }

      case "payment_intent.payment_failed": {
        const orderId = Number(obj.metadata?.order_id);
        if (!orderId) return false;

        await env.DB.prepare(
          `UPDATE orders SET status='failed' WHERE id=? AND status='awaiting_payment'`
        )
          .bind(orderId)
          .run();
        await releaseReservations(env, orderId);
        return true;
      }

      default:
        return false;
    }
  };

  try {
    const handled = await dispatch();
    await updateAgentSamWebhookEvent(env, claim.id, {
      status: handled ? "processed" : "ignored",
      metadata: {
        object_type: obj?.object || null,
        retry: claim.retry,
      },
    });
  } catch (err) {
    await updateAgentSamWebhookEvent(env, claim.id, {
      status: "failed",
      errorCode: "processing_failed",
      processingError: err?.message || "Processing failed",
    });
    return Response.json({ error: "Processing failed" }, { status: 500 });
  }

  return Response.json({ received: true, agentsam_event_id: claim.id, retry: claim.retry });
}
