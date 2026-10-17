// src/store/inventory.js
// Inventory reservation helpers — Task 5 of docs/RUNTIME-CONTRACTS-STRIPE.md.
// Uses the D1 binding env.DB. Reservations move held -> committed | released.
//
// CRITICAL — timestamp format: expires_at is stored via SQLite's
// datetime('now', '+' || ? || ' minutes') so it matches the format produced by
// datetime('now'). Never store a JS ISO string here: the formats differ and the
// string comparisons used throughout (expires_at > datetime('now')) would break.

const DEFAULT_TTL_MINUTES = 30; // matches Stripe session expiry

// A validated supplier link is orderable without local stock. This is NOT a
// real-time Completeful stock quote. Incomplete links fail closed.
function variantAvailabilitySql(where) {
  return `SELECT v.id, v.sku, v.size, v.color, v.price_cents, v.inventory_qty,
      vl.id AS supplier_link_id,
      vl.completeful_catalog_variant_id AS supplier_catalog_variant_id,
      pl.sync_status AS supplier_sync_status,
      COALESCE(SUM(r.qty), 0) AS held_qty
    FROM product_variants v
    LEFT JOIN completeful_variant_links vl ON vl.variant_id = v.id
    LEFT JOIN completeful_product_links pl
      ON pl.id = vl.product_link_id AND pl.product_id = v.product_id
    LEFT JOIN inventory_reservations r
      ON r.variant_id = v.id AND r.status = 'held'
      AND r.expires_at > datetime('now')
    WHERE ${where}
    GROUP BY v.id
    ORDER BY v.id`;
}

export function classifyVariantAvailability(row) {
  if (!row) return { fulfillment: "stock", available: false, available_qty: 0 };
  if (row.supplier_link_id != null) {
    const ready = row.supplier_sync_status === "linked" &&
      Boolean(String(row.supplier_catalog_variant_id || "").trim());
    return {
      fulfillment: "supplier",
      available: ready,
      available_qty: null,
      supplier_status: ready ? "ready" : "not_ready",
    };
  }
  const remaining = Math.max(0, Number(row.inventory_qty || 0) - Number(row.held_qty || 0));
  return { fulfillment: "stock", available: remaining > 0, available_qty: remaining };
}

export async function getVariantAvailability(env, variantId) {
  const row = await env.DB.prepare(variantAvailabilitySql("v.id = ?"))
    .bind(variantId).first();
  return classifyVariantAvailability(row);
}

export async function listProductVariantAvailability(env, productId) {
  const { results } = await env.DB.prepare(variantAvailabilitySql("v.product_id = ?"))
    .bind(productId).all();
  return (results || []).map((row) => ({
    id: row.id,
    sku: row.sku,
    size: row.size,
    color: row.color,
    price_cents: row.price_cents,
    inventory_qty: row.inventory_qty,
    ...classifyVariantAvailability(row),
  }));
}

// Internal numeric stock guard: Infinity is never exposed through JSON.
export async function availableQty(env, variantId) {
  const availability = await getVariantAvailability(env, variantId);
  return availability.fulfillment === "supplier" && availability.available
    ? Number.POSITIVE_INFINITY
    : (availability.available_qty ?? 0);
}

// (2) Hold inventory for an order. lineItems: [{ variant_id, qty }].
// Pre-checks availability for every item and inserts nothing if any item is short.
// NOTE: this pre-check is best-effort only — the real oversell guard is the
// conditional decrement in commitReservations().
export async function holdInventory(
  env,
  orderId,
  lineItems,
  ttlMinutes = DEFAULT_TTL_MINUTES,
) {
  // Aggregate duplicate cart lines before checking stock.
  const totals = new Map();
  for (const item of lineItems) {
    const qty = Number(item.qty);
    if (!Number.isInteger(qty) || qty < 1) throw new Error("Invalid reservation quantity");
    totals.set(item.variant_id, (totals.get(item.variant_id) || 0) + qty);
  }
  const stockItems = [];
  for (const [variantId, qty] of totals) {
    const availability = await getVariantAvailability(env, variantId);
    if (!availability.available ||
        (availability.fulfillment === "stock" && availability.available_qty < qty)) {
      throw new Error(`Insufficient inventory for variant ${variantId}: requested ${qty}`);
    }
    // Supplier-fulfilled lines are not local stock and must not be reserved.
    if (availability.fulfillment === "stock") stockItems.push({ variant_id: variantId, qty });
  }

  // Hold only stock-managed items. An all-supplier order needs no D1 stock rows.
  const statements = stockItems.map((item) =>
    env.DB.prepare(
      `INSERT INTO inventory_reservations (order_id, variant_id, qty, status, expires_at)
       VALUES (?, ?, ?, 'held', datetime('now', '+' || ? || ' minutes'))`,
    ).bind(orderId, item.variant_id, item.qty, ttlMinutes),
  );

  if (statements.length) await env.DB.batch(statements);
}

// (3) Commit an order's held reservations: decrement stock (guarded) and flip
// held -> committed. Never throws on shortfall — the webhook must still mark the
// order for manual review. Returns { ok, shortfalls }.
export async function commitReservations(env, orderId) {
  const held = await env.DB.prepare(
    `SELECT variant_id, qty FROM inventory_reservations
      WHERE order_id = ? AND status = 'held'`,
  )
    .bind(orderId)
    .all();

  const reservations = held.results || [];

  // Guarded decrement per reservation, then a single status flip — one batch.
  const statements = reservations.map((r) =>
    env.DB.prepare(
      `UPDATE product_variants SET inventory_qty = inventory_qty - ?
        WHERE id = ? AND inventory_qty >= ?`,
    ).bind(r.qty, r.variant_id, r.qty),
  );
  statements.push(
    env.DB.prepare(
      `UPDATE inventory_reservations SET status = 'committed'
        WHERE order_id = ? AND status = 'held'`,
    ).bind(orderId),
  );

  const results = await env.DB.batch(statements);

  // Any decrement that changed 0 rows lost the oversell race -> shortfall.
  const shortfalls = [];
  reservations.forEach((r, i) => {
    if (results[i]?.meta?.changes === 0) shortfalls.push(r.variant_id);
  });

  return { ok: shortfalls.length === 0, shortfalls };
}

// (4) Release an order's held reservations. No stock change. Returns count released.
export async function releaseReservations(env, orderId) {
  const res = await env.DB.prepare(
    `UPDATE inventory_reservations SET status = 'released'
      WHERE order_id = ? AND status = 'held'`,
  )
    .bind(orderId)
    .run();

  return res.meta?.changes || 0;
}

// (5) Release all stale held reservations (expired). Returns count released.
// Wired to the daily cron in Sprint 8; safe to call from checkout/webhook now.
export async function expireStaleReservations(env) {
  const res = await env.DB.prepare(
    `UPDATE inventory_reservations SET status = 'released'
      WHERE status = 'held' AND expires_at <= datetime('now')`,
  ).run();

  return res.meta?.changes || 0;
}
