// src/store/inventory.js
// Inventory reservation helpers — Task 5 of docs/RUNTIME-CONTRACTS-STRIPE.md.
// Uses the D1 binding env.DB. Reservations move held -> committed | released.
//
// CRITICAL — timestamp format: expires_at is stored via SQLite's
// datetime('now', '+' || ? || ' minutes') so it matches the format produced by
// datetime('now'). Never store a JS ISO string here: the formats differ and the
// string comparisons used throughout (expires_at > datetime('now')) would break.

const DEFAULT_TTL_MINUTES = 30; // matches Stripe session expiry

// (1) Available quantity = on-hand minus currently-held (non-expired) reservations.
export async function availableQty(env, variantId) {
  const row = await env.DB.prepare(
    `SELECT (pv.inventory_qty - COALESCE(SUM(r.qty), 0)) AS available
       FROM product_variants pv
       LEFT JOIN inventory_reservations r
         ON r.variant_id = pv.id AND r.status = 'held' AND r.expires_at > datetime('now')
      WHERE pv.id = ?
      GROUP BY pv.id`,
  )
    .bind(variantId)
    .first();

  // Variant not found -> nothing available.
  if (!row) return 0;
  return Number(row.available) || 0;
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
  for (const item of lineItems) {
    const available = await availableQty(env, item.variant_id);
    if (available < item.qty) {
      throw new Error(
        `Insufficient inventory for variant ${item.variant_id}: requested ${item.qty}, available ${available}`,
      );
    }
  }

  // All items pass — insert one held row per item in a single atomic batch.
  const statements = lineItems.map((item) =>
    env.DB.prepare(
      `INSERT INTO inventory_reservations (order_id, variant_id, qty, status, expires_at)
       VALUES (?, ?, ?, 'held', datetime('now', '+' || ? || ' minutes'))`,
    ).bind(orderId, item.variant_id, item.qty, ttlMinutes),
  );

  await env.DB.batch(statements);
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
