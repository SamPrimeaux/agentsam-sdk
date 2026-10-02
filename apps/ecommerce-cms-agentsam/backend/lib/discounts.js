/**
 * Shared discount validation + amount calculation (admin + storefront).
 */

import { FNF_ACCOUNT_ID } from "../agentsam/constants.js";

export function parseJson(raw, fallback) {
  try {
    if (raw == null || raw === "") return fallback;
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return fallback;
  }
}

export function normalizeCode(code) {
  return String(code || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

export function mapDiscount(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    code: row.code,
    method: row.method,
    discount_type: row.discount_type,
    value_type: row.value_type,
    value: row.value,
    applies_to: row.applies_to,
    applies_to_ids: parseJson(row.applies_to_json, []),
    eligibility: row.eligibility,
    min_requirement_type: row.min_requirement_type,
    min_requirement_value: row.min_requirement_value ?? 0,
    max_uses_total: row.max_uses_total,
    max_uses_per_customer: row.max_uses_per_customer ?? 0,
    combine_product: !!row.combine_product,
    combine_order: !!row.combine_order,
    combine_shipping: !!row.combine_shipping,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    status: row.status,
    uses_count: row.uses_count ?? 0,
    metadata: parseJson(row.metadata_json, {}),
    created_by: row.created_by,
    updated_by: row.updated_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function nowIso() {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

function isWithinSchedule(row) {
  const now = nowIso();
  if (row.starts_at && row.starts_at > now) return false;
  if (row.ends_at && row.ends_at < now) return false;
  return true;
}

function effectiveStatus(row) {
  if (!row) return "disabled";
  if (row.status === "disabled" || row.status === "draft") return row.status;
  if (!isWithinSchedule(row)) {
    if (row.starts_at && row.starts_at > nowIso()) return "scheduled";
    if (row.ends_at && row.ends_at < nowIso()) return "expired";
  }
  return row.status;
}

function lineSubtotal(lineItems) {
  return lineItems.reduce((sum, li) => sum + li.unitCents * li.qty, 0);
}

function eligibleLineSubtotal(discount, lineItems) {
  const ids = parseJson(discount.applies_to_json, []);
  if (discount.applies_to === "all" || !ids.length) {
    return lineSubtotal(lineItems);
  }
  if (discount.applies_to === "products") {
    const set = new Set(ids.map(String));
    return lineItems
      .filter((li) => set.has(String(li.variant?.product_id)))
      .reduce((sum, li) => sum + li.unitCents * li.qty, 0);
  }
  if (discount.applies_to === "collections") {
    const set = new Set(ids.map(String));
    return lineItems
      .filter((li) => set.has(String(li.variant?.collection || "")))
      .reduce((sum, li) => sum + li.unitCents * li.qty, 0);
  }
  return lineSubtotal(lineItems);
}

export function computeDiscountAmount(discountRow, { subtotalCents, lineItems = [], itemCount = 0 }) {
  const discount = typeof discountRow.applies_to_json === "string" ? discountRow : mapDiscount(discountRow);
  const row = typeof discountRow.applies_to_json === "string" ? discountRow : discountRow;
  const type = row.discount_type;
  const valueType = row.value_type;
  const value = Number(row.value || 0);
  const subtotal = subtotalCents ?? lineSubtotal(lineItems);
  const qty = itemCount || lineItems.reduce((n, li) => n + li.qty, 0);

  if (type === "shipping") {
    return { discount_cents: 0, free_shipping: true, message: "Free shipping applied" };
  }

  if (type === "buy_x_get_y") {
    const meta = parseJson(row.metadata_json, {});
    const buyQty = Math.max(1, Number(meta.buy_quantity || 2));
    const getPct = Math.min(100, Math.max(1, Number(meta.get_percent || 100)));
    if (qty < buyQty) {
      return { discount_cents: 0, free_shipping: false, message: `Add ${buyQty - qty} more item(s) for this offer` };
    }
    const cheapest = [...lineItems].sort((a, b) => a.unitCents - b.unitCents)[0];
    const amount = cheapest ? Math.round((cheapest.unitCents * getPct) / 100) : 0;
    return { discount_cents: amount, free_shipping: false, message: "Buy X get Y applied" };
  }

  const base =
    type === "product"
      ? eligibleLineSubtotal(row, lineItems)
      : subtotal;

  if (base <= 0) {
    return { discount_cents: 0, free_shipping: false, message: "Discount does not apply to these items" };
  }

  let amount = 0;
  if (valueType === "percent") {
    amount = Math.round((base * Math.min(100, Math.max(0, value))) / 100);
  } else {
    amount = Math.min(base, value);
  }

  return {
    discount_cents: amount,
    free_shipping: false,
    message: amount > 0 ? "Discount applied" : "No discount amount",
  };
}

export async function loadDiscountByCode(env, code) {
  const normalized = normalizeCode(code);
  if (!normalized) return null;
  return env.DB.prepare(
    `SELECT * FROM discounts WHERE account_id = ? AND code = ? COLLATE NOCASE LIMIT 1`
  )
    .bind(FNF_ACCOUNT_ID, normalized)
    .first();
}

export async function validateDiscountForCheckout(env, code, { customerEmail, subtotalCents, lineItems, itemCount }) {
  const row = await loadDiscountByCode(env, code);
  if (!row) {
    return { ok: false, error: "Discount code not found" };
  }

  const status = effectiveStatus(row);
  if (status !== "active") {
    const messages = {
      draft: "This discount is not active yet",
      disabled: "This discount is disabled",
      scheduled: "This discount is not active yet",
      expired: "This discount has expired",
    };
    return { ok: false, error: messages[status] || "Discount unavailable" };
  }

  if (row.method !== "code") {
    return { ok: false, error: "Enter a valid discount code" };
  }

  if (row.max_uses_total != null && row.uses_count >= row.max_uses_total) {
    return { ok: false, error: "This discount has reached its usage limit" };
  }

  if (row.max_uses_per_customer > 0 && customerEmail) {
    const used = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM discount_redemptions WHERE discount_id = ? AND customer_email = ?`
    )
      .bind(row.id, customerEmail.toLowerCase())
      .first();
    if ((used?.n || 0) >= row.max_uses_per_customer) {
      return { ok: false, error: "You have already used this discount" };
    }
  }

  const qty = itemCount ?? lineItems.reduce((n, li) => n + li.qty, 0);
  if (row.min_requirement_type === "amount") {
    const min = Number(row.min_requirement_value || 0);
    if (subtotalCents < min) {
      return {
        ok: false,
        error: `Minimum purchase of $${(min / 100).toFixed(2)} required`,
      };
    }
  }
  if (row.min_requirement_type === "quantity" && qty < Number(row.min_requirement_value || 0)) {
    return {
      ok: false,
      error: `Minimum ${row.min_requirement_value} items required`,
    };
  }

  const result = computeDiscountAmount(row, { subtotalCents, lineItems, itemCount: qty });
  if (result.discount_cents <= 0 && !result.free_shipping) {
    return { ok: false, error: result.message || "Discount does not apply" };
  }

  return {
    ok: true,
    discount: mapDiscount(row),
    discount_cents: result.discount_cents,
    free_shipping: result.free_shipping,
    message: result.message,
  };
}

export async function recordDiscountRedemption(env, { discountId, orderId, customerEmail, amountCents }) {
  await env.DB.prepare(
    `INSERT INTO discount_redemptions (discount_id, order_id, customer_email, amount_cents)
     VALUES (?, ?, ?, ?)`
  )
    .bind(discountId, orderId, customerEmail?.toLowerCase() || null, amountCents || 0)
    .run();

  await env.DB.prepare(
    `UPDATE discounts SET uses_count = uses_count + 1, updated_at = datetime('now') WHERE id = ?`
  )
    .bind(discountId)
    .run();
}

export function discountTypeLabel(d) {
  if (!d) return "Discount";
  if (d.discount_type === "shipping") return "Free shipping";
  if (d.discount_type === "buy_x_get_y") return "Buy X get Y";
  if (d.discount_type === "order") {
    return d.value_type === "percent" ? "Amount off order" : "Fixed amount off order";
  }
  return d.value_type === "percent" ? "Amount off products" : "Fixed amount off products";
}
