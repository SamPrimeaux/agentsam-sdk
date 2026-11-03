/**
 * D1 / SQLite adapter for EXISTING notification_outbox (0010_agentsam_notifications.sql).
 * No new tables. Account ownership is checked on every transition.
 * Processing is immediate; hosts can add an explicit queue worker later.
 */
export function createNotificationOutboxStore(db, { newId = () => 'nox_' + crypto.randomUUID() } = {}) {
  if (!db || typeof db.prepare !== 'function') throw new TypeError('outbox_database_required');
  const exec = (sql, args = []) => db.prepare(sql).bind(...args);
  return Object.freeze({
    async enqueue({ meta, message }) {
      const id = newId();
      const payload = JSON.stringify({
        provider_id: meta.providerId, purpose: meta.purpose,
        reply_to: message.replyTo, html: message.html || null,
      });
      await exec(
        'INSERT INTO notification_outbox ' +
        '(id, account_id, recipient_account_id, channel, to_address, subject, body_text, ' +
        'payload_json, status, source_id, event_type, created_by) ' +
        "VALUES (?, ?, ?, 'email', ?, ?, ?, ?, 'pending', ?, ?, ?)",
        [id, meta.accountId, meta.recipientAccountId, message.to.join(','),
          message.subject, message.text || null, payload, meta.sourceId,
          meta.purpose, meta.createdBy],
      ).run();
      return id;
    },
    async start({ id, accountId }) {
      const result = await exec(
        "UPDATE notification_outbox SET status = 'queued', attempts = attempts + 1, " +
        "updated_at = unixepoch() WHERE id = ? AND account_id = ? " +
        "AND channel = 'email' AND status = 'pending'",
        [id, accountId],
      ).run();
      return Number(result?.meta?.changes || 0) === 1;
    },
    async complete({ id, accountId, ok, providerMessageId = null, errorCode = null }) {
      const result = await exec(
        "UPDATE notification_outbox SET status = ?, last_error = ?, " +
        "payload_json = json_set(payload_json,'$.provider_message_id',?), " +
        "updated_at = unixepoch() WHERE id = ? AND account_id = ? " +
        "AND channel = 'email' AND status = 'queued'",
        [ok ? 'sent' : 'failed', ok ? null : String(errorCode || 'unknown').slice(0, 100),
          providerMessageId, id, accountId],
      ).run();
      if (Number(result?.meta?.changes || 0) !== 1) throw new Error('outbox_state_transition_failed');
    },
    async get({ id, accountId }) {
      const row = await exec(
        'SELECT id, account_id, channel, status, attempts, max_attempts, last_error, ' +
        'created_at, updated_at FROM notification_outbox WHERE id = ? AND account_id = ? LIMIT 1',
        [id, accountId],
      ).first();
      return row || null;
    },
  });
}
