const authority = [{ type: 'secret', ref: 'completeful.api_key', provider: 'completeful' }];

const webhookTopics = [
  'order:created',
  'order:updated',
  'order:sent-to-production',
  'order:cancelled',
  'order:refunded',
  'order:shipment:created',
  'catalog:product:created',
  'catalog:product:updated',
  'catalog:product:price_changed',
  'catalog:product:availability_changed',
  'product:created',
  'product:updated',
  'product:deleted',
  'product:publish:started',
  'product:publish:succeeded',
  'product:publish:failed',
  'shop:disconnected',
  'ping',
];

function objectSchema(properties = {}, required = [], extra = {}) {
  return {
    type: 'object',
    additionalProperties: false,
    properties,
    ...(required.length ? { required } : {}),
    ...extra,
  };
}

function retryPolicy(maxAttempts) {
  return {
    maxAttempts,
    backoff: maxAttempts > 1 ? 'exponential' : 'none',
    ...(maxAttempts > 1
      ? {
          baseDelayMs: 500,
          maxDelayMs: 5_000,
          retryableReasons: ['provider_rate_limited', 'provider_unavailable', 'transport_timeout'],
        }
      : {}),
  };
}

function toolDefinition({
  toolKey,
  displayName,
  description,
  inputSchema,
  riskLevel = 'low',
  sideEffectLevel = 'none',
  idempotencyMode = 'intrinsic',
  maxAttempts = 3,
  receiptMode = 'full',
  sensitiveInputPaths = [],
  sensitiveOutputPaths = [],
  emitsEvents = [],
}) {
  return Object.freeze({
    toolKey,
    displayName,
    description,
    provider: 'completeful',
    capabilityKey: toolKey,
    handler: { type: 'local', ref: 'completeful.execute' },
    inputSchema,
    outputSchema: { type: 'object' },
    authority,
    riskLevel,
    sideEffectLevel,
    idempotencyMode,
    timeoutMs: 30_000,
    retryPolicy: retryPolicy(maxAttempts),
    receiptMode,
    sensitiveInputPaths,
    sensitiveOutputPaths,
    emitsEvents,
    active: true,
  });
}

const orderBodySchema = {
  type: 'object',
  additionalProperties: true,
  properties: {
    external_order_id: { type: ['string', 'null'] },
    shipping_address: { type: 'object' },
    billing_address: { type: 'object' },
    email: { type: ['string', 'null'] },
    currency: { type: 'string', enum: ['USD'] },
    notes: { type: ['string', 'null'] },
    shipping_method: { type: ['string', 'null'], enum: ['standard', null] },
    line_items: { type: 'array', minItems: 1, items: { type: 'object' } },
  },
  required: ['shipping_address', 'line_items'],
};

const productCreateBodySchema = {
  type: 'object',
  additionalProperties: true,
  properties: {
    catalog_product_id: { type: 'string', minLength: 1 },
    title: { type: 'string' },
    description: { type: ['string', 'null'] },
    retail_price: { type: 'number', minimum: 0 },
    compare_at_price: { type: ['number', 'null'] },
    sku: { type: ['string', 'null'] },
    design_id: { type: ['string', 'null'] },
    artfile_url: { type: ['string', 'null'] },
    print_files: { type: ['array', 'null'], minItems: 1, items: { type: 'object' } },
    design: { type: 'object' },
    design_options: { type: 'array', items: { type: 'object' } },
    variants: { type: 'object' },
    publish_to: { type: 'array', uniqueItems: true, items: { type: 'string', enum: ['shopify', 'etsy'] } },
    tags: { type: 'array', items: { type: 'string' } },
    images: { type: 'array', items: { type: 'object' } },
    personalization_enabled: { type: 'boolean' },
  },
  required: ['catalog_product_id'],
};

const designCreateBodySchema = {
  type: 'object',
  additionalProperties: true,
  properties: {
    name: { type: 'string', minLength: 1 },
    canvas_json: { type: 'object' },
    artfile_url: { type: ['string', 'null'] },
    image_url: { type: ['string', 'null'] },
    url: { type: ['string', 'null'] },
    width: { type: ['number', 'null'] },
    height: { type: ['number', 'null'] },
    thumbnail_url: { type: ['string', 'null'] },
    tags: { type: 'array', items: { type: 'string' } },
    personalization_enabled: { type: 'boolean' },
    personalization_fields: { type: 'array', items: { type: 'object' } },
    shop_id: { type: ['string', 'null'] },
    external_user_id: { type: ['string', 'null'] },
    collection: { type: ['string', 'null'] },
  },
  required: ['name'],
};

export const COMPLETEFUL_TOOL_DEFINITIONS = Object.freeze([
  toolDefinition({
    toolKey: 'completeful.shop.list',
    displayName: 'List Completeful shops',
    description: 'List shops available to the resolved Completeful API authority.',
    inputSchema: objectSchema(),
  }),
  toolDefinition({
    toolKey: 'completeful.shop.get',
    displayName: 'Get Completeful shop',
    inputSchema: objectSchema({ shop_id: { type: 'string', minLength: 1 } }, ['shop_id']),
  }),
  toolDefinition({
    toolKey: 'completeful.catalog.list',
    displayName: 'List Completeful catalog products',
    inputSchema: objectSchema({
      limit: { type: 'integer', minimum: 1, maximum: 200 },
      offset: { type: 'integer', minimum: 0 },
      cursor: { type: 'string' },
      search: { type: 'string' },
      marketplace_eligible: { type: 'boolean' },
      include: { type: 'string' },
    }),
  }),
  toolDefinition({
    toolKey: 'completeful.catalog.get',
    displayName: 'Get Completeful catalog product',
    inputSchema: objectSchema(
      {
        product_id: { type: 'string', minLength: 1 },
        include: { type: 'string' },
      },
      ['product_id'],
    ),
  }),
  toolDefinition({
    toolKey: 'completeful.catalog.semantic',
    displayName: 'Search Completeful catalog semantically',
    inputSchema: objectSchema(
      {
        q: { type: 'string', minLength: 1, maxLength: 200 },
        limit: { type: 'integer', minimum: 1, maximum: 50 },
        include: { type: 'string' },
      },
      ['q'],
    ),
  }),
  toolDefinition({
    toolKey: 'completeful.design.create',
    displayName: 'Create Completeful design',
    inputSchema: objectSchema(
      {
        body: designCreateBodySchema,
      },
      ['body'],
    ),
    riskLevel: 'moderate',
    sideEffectLevel: 'external_write',
    idempotencyMode: 'required',
    emitsEvents: ['completeful.design.created'],
  }),
  toolDefinition({
    toolKey: 'completeful.product.create',
    displayName: 'Create Completeful shop product',
    inputSchema: objectSchema(
      {
        shop_id: { type: 'string', minLength: 1 },
        body: productCreateBodySchema,
      },
      ['shop_id', 'body'],
    ),
    riskLevel: 'moderate',
    sideEffectLevel: 'external_write',
    idempotencyMode: 'required',
    emitsEvents: ['completeful.product.created'],
  }),
  toolDefinition({
    toolKey: 'completeful.product.publish',
    displayName: 'Publish Completeful shop product',
    inputSchema: objectSchema(
      {
        shop_id: { type: 'string', minLength: 1 },
        product_id: { type: 'string', minLength: 1 },
      },
      ['shop_id', 'product_id'],
    ),
    riskLevel: 'high',
    sideEffectLevel: 'external_write',
    idempotencyMode: 'not_applicable',
    maxAttempts: 1,
    emitsEvents: ['completeful.product.publish.started'],
  }),
  toolDefinition({
    toolKey: 'completeful.order.quote',
    displayName: 'Quote Completeful order',
    inputSchema: objectSchema(
      {
        shop_id: { type: 'string', minLength: 1 },
        body: orderBodySchema,
      },
      ['shop_id', 'body'],
    ),
    receiptMode: 'redacted',
    sensitiveInputPaths: [
      'body.shipping_address',
      'body.billing_address',
      'body.email',
      'body.notes',
    ],
    sensitiveOutputPaths: ['shipping_address', 'billing_address', 'email', 'notes'],
  }),
  toolDefinition({
    toolKey: 'completeful.order.get',
    displayName: 'Get Completeful order',
    inputSchema: objectSchema(
      {
        shop_id: { type: 'string', minLength: 1 },
        order_id: { type: 'string', minLength: 1 },
      },
      ['shop_id', 'order_id'],
    ),
    receiptMode: 'redacted',
    sensitiveOutputPaths: ['shipping_address', 'billing_address', 'email', 'notes'],
  }),
  toolDefinition({
    toolKey: 'completeful.order.create',
    displayName: 'Create Completeful order',
    description: 'Create a fulfillment order. Requires Idempotency-Key or body.external_order_id.',
    inputSchema: objectSchema(
      {
        shop_id: { type: 'string', minLength: 1 },
        body: orderBodySchema,
      },
      ['shop_id', 'body'],
    ),
    riskLevel: 'high',
    sideEffectLevel: 'billable_external_write',
    idempotencyMode: 'required',
    receiptMode: 'redacted',
    sensitiveInputPaths: [
      'body.shipping_address',
      'body.billing_address',
      'body.email',
      'body.notes',
    ],
    sensitiveOutputPaths: ['shipping_address', 'billing_address', 'email', 'notes'],
    emitsEvents: ['completeful.order.created'],
  }),
  toolDefinition({
    toolKey: 'completeful.order.cancel',
    displayName: 'Cancel Completeful order',
    inputSchema: objectSchema(
      {
        shop_id: { type: 'string', minLength: 1 },
        order_id: { type: 'string', minLength: 1 },
      },
      ['shop_id', 'order_id'],
    ),
    riskLevel: 'high',
    sideEffectLevel: 'external_write',
    idempotencyMode: 'not_applicable',
    maxAttempts: 1,
    emitsEvents: ['completeful.order.cancelled'],
  }),
  toolDefinition({
    toolKey: 'completeful.webhook.list',
    displayName: 'List Completeful webhook subscriptions',
    inputSchema: objectSchema({ shop_id: { type: 'string', minLength: 1 } }, ['shop_id']),
    receiptMode: 'redacted',
    sensitiveOutputPaths: ['secret', 'signing_secret', 'webhook_secret'],
  }),
  toolDefinition({
    toolKey: 'completeful.webhook.ensure',
    displayName: 'Ensure Completeful webhook subscription',
    description: 'Return the existing subscription for a topic or create it exactly once with an idempotency key.',
    inputSchema: objectSchema(
      {
        shop_id: { type: 'string', minLength: 1 },
        url: { type: 'string', minLength: 1 },
        topic: { type: 'string', enum: webhookTopics },
        secret: { type: 'string', minLength: 1 },
      },
      ['shop_id', 'url', 'topic'],
    ),
    riskLevel: 'moderate',
    sideEffectLevel: 'external_write',
    idempotencyMode: 'required',
    receiptMode: 'redacted',
    sensitiveInputPaths: ['secret'],
    sensitiveOutputPaths: ['secret', 'signing_secret', 'webhook_secret'],
    emitsEvents: ['completeful.webhook.ensured'],
  }),
]);

const definitionsByKey = new Map(COMPLETEFUL_TOOL_DEFINITIONS.map((definition) => [definition.toolKey, definition]));

export function getCompletefulToolDefinition(toolKey) {
  return definitionsByKey.get(String(toolKey || '')) || null;
}

function requireString(input, key) {
  const value = String(input?.[key] || '').trim();
  if (!value) throw new TypeError(`${key} is required`);
  return value;
}

function requireBody(input) {
  if (!input?.body || typeof input.body !== 'object' || Array.isArray(input.body)) {
    throw new TypeError('body is required');
  }
  return input.body;
}

function codedError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function result({ data, meta }) {
  return {
    output: data,
    providerRequestId: meta?.request_id || undefined,
    metadata: { provider_meta: meta || null },
  };
}

function collectionItems(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.webhooks)) return data.webhooks;
  if (Array.isArray(data?.subscriptions)) return data.subscriptions;
  return [];
}

function webhookTopic(item) {
  if (item?.topic) return String(item.topic);
  if (item?.event) return String(item.event);
  if (item?.type) return String(item.type);
  if (Array.isArray(item?.events) && item.events[0]) return String(item.events[0]);
  return '';
}

function webhookUrl(item) {
  return String(item?.url || item?.endpoint_url || '');
}

function redactSecrets(value) {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (!value || typeof value !== 'object') return value;
  const output = {};
  for (const [key, child] of Object.entries(value)) {
    if (/secret|token/i.test(key)) continue;
    output[key] = redactSecrets(child);
  }
  return output;
}

function invocationIdempotencyKey(invocation, { allowExternalOrderId = false, body = null } = {}) {
  const key = String(invocation?.idempotencyKey || invocation?.id || '').trim();
  if (key) return key;
  if (allowExternalOrderId && String(body?.external_order_id || '').trim()) return null;
  throw codedError('AgentSam invocation requires an idempotency key', 'completeful_idempotency_required');
}

export async function executeCompletefulProviderTool(client, toolKey, input = {}, invocation = {}) {
  switch (toolKey) {
    case 'completeful.shop.list':
      return result(await client.request('GET', '/shops'));

    case 'completeful.shop.get': {
      const shopId = requireString(input, 'shop_id');
      return result(await client.request('GET', `/shops/${encodeURIComponent(shopId)}`));
    }

    case 'completeful.catalog.list':
      return result(await client.request('GET', '/catalog/products', { query: input }));

    case 'completeful.catalog.get': {
      const productId = requireString(input, 'product_id');
      return result(
        await client.request('GET', `/catalog/products/${encodeURIComponent(productId)}`, {
          query: { include: input.include },
        }),
      );
    }

    case 'completeful.catalog.semantic': {
      const q = requireString(input, 'q');
      return result(
        await client.request('GET', '/catalog/products/semantic', {
          query: { q, limit: input.limit, include: input.include },
        }),
      );
    }

    case 'completeful.design.create': {
      client.assertMutationAllowed();
      const body = requireBody(input);
      const idempotencyKey = invocationIdempotencyKey(invocation);
      return result(await client.request('POST', '/designs', { body, idempotencyKey }));
    }

    case 'completeful.product.create': {
      client.assertMutationAllowed();
      const shopId = requireString(input, 'shop_id');
      const body = requireBody(input);
      const idempotencyKey = invocationIdempotencyKey(invocation);
      return result(
        await client.request('POST', `/shops/${encodeURIComponent(shopId)}/products`, {
          body,
          idempotencyKey,
        }),
      );
    }

    case 'completeful.product.publish': {
      client.assertMutationAllowed();
      const shopId = requireString(input, 'shop_id');
      const productId = requireString(input, 'product_id');
      return result(
        await client.request(
          'POST',
          `/shops/${encodeURIComponent(shopId)}/products/${encodeURIComponent(productId)}/publish`,
        ),
      );
    }

    case 'completeful.order.quote': {
      const shopId = requireString(input, 'shop_id');
      const body = requireBody(input);
      return result(
        await client.request('POST', `/shops/${encodeURIComponent(shopId)}/orders/quote`, { body }),
      );
    }

    case 'completeful.order.get': {
      const shopId = requireString(input, 'shop_id');
      const orderId = requireString(input, 'order_id');
      return result(
        await client.request(
          'GET',
          `/shops/${encodeURIComponent(shopId)}/orders/${encodeURIComponent(orderId)}`,
        ),
      );
    }

    case 'completeful.order.create': {
      client.assertMutationAllowed();
      const shopId = requireString(input, 'shop_id');
      const body = requireBody(input);
      const idempotencyKey = invocationIdempotencyKey(invocation, {
        allowExternalOrderId: true,
        body,
      });
      return result(
        await client.request('POST', `/shops/${encodeURIComponent(shopId)}/orders`, {
          body,
          idempotencyKey,
        }),
      );
    }

    case 'completeful.order.cancel': {
      client.assertMutationAllowed();
      const shopId = requireString(input, 'shop_id');
      const orderId = requireString(input, 'order_id');
      return result(
        await client.request(
          'POST',
          `/shops/${encodeURIComponent(shopId)}/orders/${encodeURIComponent(orderId)}/cancel`,
        ),
      );
    }

    case 'completeful.webhook.list': {
      const shopId = requireString(input, 'shop_id');
      const response = await client.request('GET', `/shops/${encodeURIComponent(shopId)}/webhooks`);
      return result({ data: redactSecrets(response.data), meta: response.meta });
    }

    case 'completeful.webhook.ensure': {
      const shopId = requireString(input, 'shop_id');
      const url = requireString(input, 'url');
      const topic = requireString(input, 'topic');
      const idempotencyKey = invocationIdempotencyKey(invocation);

      const listed = await client.request('GET', `/shops/${encodeURIComponent(shopId)}/webhooks`);
      const existing = collectionItems(listed.data).find((item) => webhookTopic(item) === topic);
      if (existing) {
        if (webhookUrl(existing) && webhookUrl(existing) !== url) {
          throw codedError(
            `Webhook topic ${topic} already exists for a different URL`,
            'completeful_webhook_topic_conflict',
          );
        }
        return result({
          data: { ensured: true, created: false, webhook: redactSecrets(existing) },
          meta: listed.meta,
        });
      }

      client.assertMutationAllowed();
      const body = { url, topic };
      if (input.secret) body.secret = String(input.secret);
      const created = await client.request(
        'POST',
        `/shops/${encodeURIComponent(shopId)}/webhooks`,
        { body, idempotencyKey },
      );
      return result({
        data: { ensured: true, created: true, webhook: redactSecrets(created.data) },
        meta: created.meta,
      });
    }

    default:
      throw new TypeError(`Unsupported Completeful tool: ${toolKey}`);
  }
}

export function createCompletefulProviderAdapter(client) {
  if (!client?.request) throw new TypeError('Completeful provider adapter requires a client');
  return {
    providerKey: 'completeful',
    listTools() {
      return [...COMPLETEFUL_TOOL_DEFINITIONS];
    },
    invoke(invocation) {
      return executeCompletefulProviderTool(client, invocation.toolKey, invocation.input, invocation);
    },
  };
}
