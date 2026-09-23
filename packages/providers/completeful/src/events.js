function normalizeTopic(topic) {
  return String(topic || 'unknown')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '') || 'unknown';
}

function providerObjectId(event) {
  const data = event?.data || {};
  return data.order_id || data.product_id || data.shop_id || data.id || event?.resource_id || null;
}

function toUnixMilliseconds(value, fallback = Date.now()) {
  if (value == null || value === '') return fallback;
  if (Number.isFinite(Number(value))) {
    const n = Number(value);
    return n > 1e12 ? Math.floor(n) : Math.floor(n * 1000);
  }
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeCompletefulEvent(event, context = {}) {
  const topic = normalizeTopic(event?.type);
  const id = String(event?.id || context.id || crypto.randomUUID());
  const subject = providerObjectId(event);
  return {
    id,
    eventKey: `completeful.${topic}`,
    occurredAt: toUnixMilliseconds(event?.created ?? event?.created_at, context.occurredAt),
    source: {
      kind: 'webhook',
      provider: 'completeful',
      ref: context.webhookId || undefined,
      metadata: {
        provider_event_id: event?.id || null,
        provider_webhook_id: context.providerWebhookId || null,
        shop_id: context.shopId || event?.data?.shop_id || null,
      },
    },
    payload: event,
    accountId: context.accountId,
    subject: subject ? String(subject) : undefined,
    correlationId: context.correlationId,
    causationId: context.causationId,
    metadata: context.metadata,
  };
}
