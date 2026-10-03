// src/store/order-email.js
// Task 16 of docs/RUNTIME-CONTRACTS-STRIPE.md — order confirmation email.
// Reuses Sam's existing Resend plumbing (src/lib/resend.js). Best-effort only:
// this function MUST NEVER THROW — a failed email must not break the webhook.

import { sendResendEmail, resendConfigured } from "../lib/resend.js";

export async function sendOrderConfirmationEmail(env, orderId) {
  try {
    if (!resendConfigured(env)) {
      return { ok: false, skipped: "resend-not-configured" };
    }

    const order = await env.DB.prepare(
      `SELECT id, customer_email, total_cents, status FROM orders WHERE id = ?`
    )
      .bind(orderId)
      .first();

    if (!order || !order.customer_email) {
      return { ok: false, skipped: "no-order-or-email" };
    }

    const { results: items } = await env.DB.prepare(
      `SELECT title, qty, price_cents FROM order_items WHERE order_id = ? ORDER BY id`
    )
      .bind(orderId)
      .all();

    const lineItems = items || [];
    const money = (c) => `$${(Number(c || 0) / 100).toFixed(2)}`;

    const subject = `Order #${order.id} confirmed`;

    const textLines = lineItems.map(
      (it) => `${it.title} × ${it.qty} — ${money(it.price_cents)}`
    );
    const text = [
      `Thanks for your order!`,
      ``,
      `Order #${order.id} is confirmed.`,
      ``,
      ...textLines,
      ``,
      `Total: ${money(order.total_cents)}`,
      ``,
      `Thank you for your order.`,
    ].join("\n");

    const htmlRows = lineItems
      .map(
        (it) =>
          `<tr>
             <td style="padding:6px 0;color:#e5e5e5;">${it.title} &times; ${it.qty}</td>
             <td style="padding:6px 0;color:#e5e5e5;text-align:right;">${money(it.price_cents)}</td>
           </tr>`
      )
      .join("");

    const html = `
    <div style="margin:0;padding:24px;background:#0a0a0a;font-family:Inter,Arial,sans-serif;color:#ffffff;">
      <div style="max-width:520px;margin:0 auto;background:#141414;border:1px solid #2a2a2a;border-radius:12px;padding:28px;">
        <h1 style="margin:0 0 4px;font-size:22px;font-weight:900;color:#ffffff;">Order confirmed</h1>
        <p style="margin:0 0 20px;color:#9b9b9b;font-size:14px;">Order #${order.id} — thanks for your order!</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          ${htmlRows}
          <tr>
            <td style="padding:12px 0 0;border-top:1px solid #2a2a2a;font-weight:700;color:#ffffff;">Total</td>
            <td style="padding:12px 0 0;border-top:1px solid #2a2a2a;font-weight:700;color:#ffffff;text-align:right;">${money(order.total_cents)}</td>
          </tr>
        </table>
        <p style="margin:24px 0 0;color:#9b9b9b;font-size:13px;line-height:1.5;">We appreciate you supporting Fuel &amp; Free Time. We'll be in touch as your order ships.</p>
      </div>
    </div>`;

    const result = await sendResendEmail(env, {
      from: undefined,
      to: order.customer_email,
      subject,
      html,
      text,
      replyTo: undefined,
      tags: ["order-confirmation"],
    });

    if (!result.ok) {
      console.warn("order confirmation email failed", orderId, result.error);
    }
    return result;
  } catch (err) {
    console.warn("order confirmation email threw", orderId, err?.message || err);
    return { ok: false, skipped: "threw" };
  }
}
