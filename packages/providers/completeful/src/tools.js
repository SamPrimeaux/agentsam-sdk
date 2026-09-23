const authority = [{ type: 'secret', ref: 'completeful.api_key', provider: 'completeful' }];

function objectSchema(properties = {}, required = []) {
  return {
    type: 'object',
    additionalProperties: false,
    properties,
    ...(required.length ? { required } : {}),
  };
}

function readTool({ toolKey, displayName, description, inputSchema, emitsEvents = [] }) {
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
    riskLevel: 'low',
    sideEffectLevel: 'none',
    idempotencyMode: 'intrinsic',
    timeoutMs: 30_000,
    retryPolicy: {
      maxAttempts: 3,
      backoff: 'exponential',
      baseDelayMs: 500,
      maxDelayMs: 5_000,
      retryableReasons: ['provider_rate_limited', 'provider_unavailable', 'transport_timeout'],
    },
    emitsEvents,
    active: true,
  });
}

export const COMPLETEFUL_TOOL_DEFINITIONS = Object.freeze([
  readTool({
    toolKey: 'completeful.shop.list',
    displayName: 'List Completeful shops',
    description: 'List shops available to the resolved Completeful API authority.',
    inputSchema: objectSchema(),
  }),
  readTool({
    toolKey: 'completeful.shop.get',
    displayName: 'Get Completeful shop',
    inputSchema: objectSchema({ shop_id: { type: 'string', minLength: 1 } }, ['shop_id']),
  }),
  readTool({
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
  readTool({
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
  readTool({
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
  readTool({
    toolKey: 'completeful.order.get',
    displayName: 'Get Completeful order',
    inputSchema: objectSchema(
      {
        shop_id: { type: 'string', minLength: 1 },
        order_id: { type: 'string', minLength: 1 },
      },
      ['shop_id', 'order_id'],
    ),
  }),
  readTool({
    toolKey: 'completeful.webhook.list',
    displayName: 'List Completeful webhook subscriptions',
    inputSchema: objectSchema({ shop_id: { type: 'string', minLength: 1 } }, ['shop_id']),
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

function result({ data, meta }) {
  return {
    output: data,
    providerRequestId: meta?.request_id || undefined,
    metadata: { provider_meta: meta || null },
  };
}

export async function executeCompletefulProviderTool(client, toolKey, input = {}) {
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

    case 'completeful.webhook.list': {
      const shopId = requireString(input, 'shop_id');
      return result(
        await client.request('GET', `/shops/${encodeURIComponent(shopId)}/webhooks`),
      );
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
      return executeCompletefulProviderTool(client, invocation.toolKey, invocation.input);
    },
  };
}
