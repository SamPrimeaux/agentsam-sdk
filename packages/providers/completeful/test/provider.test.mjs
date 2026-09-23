import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COMPLETEFUL_TOOL_DEFINITIONS,
  CompletefulApiError,
  computeCompletefulWebhookSignature,
  createCompletefulClient,
  createCompletefulProviderAdapter,
  normalizeCompletefulEvent,
  verifyCompletefulWebhook,
} from '../src/index.js';

test('Completeful tool definitions use the shared execution-plane vocabulary', () => {
  const keys = new Set();
  for (const tool of COMPLETEFUL_TOOL_DEFINITIONS) {
    assert.equal(tool.provider, 'completeful');
    assert.equal(tool.handler.ref, 'completeful.execute');
    assert.ok(tool.capabilityKey);
    assert.ok(tool.inputSchema);
    assert.ok(tool.outputSchema);
    assert.ok(tool.authority?.length);
    assert.ok(tool.sideEffectLevel);
    assert.ok(tool.idempotencyMode);
    assert.equal(keys.has(tool.toolKey), false, `duplicate tool key: ${tool.toolKey}`);
    keys.add(tool.toolKey);
  }
});

test('client preserves provider metadata and does not depend on Worker env shape', async () => {
  let captured = null;
  const client = createCompletefulClient({
    apiKey: 'capp_test_example',
    fetchImpl: async (url, init) => {
      captured = { url, init };
      return new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { 'x-request-id': 'req_123', 'x-capp-dry-run': 'true' },
      });
    },
  });

  const adapter = createCompletefulProviderAdapter(client);
  const result = await adapter.invoke({
    id: 'inv_1',
    toolKey: 'completeful.catalog.list',
    input: { limit: 5, search: 'shirt' },
    requestedAt: Date.now(),
  });

  assert.match(captured.url, /\/v1\/catalog\/products/);
  assert.match(captured.url, /limit=5/);
  assert.equal(captured.init.headers.get('Authorization'), 'Bearer capp_test_example');
  assert.deepEqual(result.output, { items: [] });
  assert.equal(result.providerRequestId, 'req_123');
  assert.equal(result.metadata.provider_meta.dry_run, true);
});

test('client keeps Completeful structured provider errors', async () => {
  const client = createCompletefulClient({
    apiKey: 'capp_test_example',
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          error: 'bad input',
          code: 'invalid_order',
          request_id: 'req_bad',
          path: '/v1/shops/x/orders',
          remediation: 'fix order payload',
        }),
        { status: 422, headers: { 'content-type': 'application/json' } },
      ),
  });

  await assert.rejects(
    () => client.request('POST', '/shops/x/orders'),
    (error) => {
      assert.ok(error instanceof CompletefulApiError);
      assert.equal(error.code, 'invalid_order');
      assert.equal(error.requestId, 'req_bad');
      assert.equal(error.remediation, 'fix order payload');
      return true;
    },
  );
});

test('live mutations fail closed unless the host explicitly enables them', () => {
  const client = createCompletefulClient({ apiKey: 'capp_live_example', fetchImpl: async () => new Response('{}') });
  assert.throws(() => client.assertMutationAllowed(), /live writes are disabled/i);
});

test('webhook verification is portable and event normalization keeps provider provenance', async () => {
  const rawBody = JSON.stringify({ id: 'evt_1', type: 'order:created', data: { order_id: 'ord_1', shop_id: 'shop_1' } });
  const timestamp = 1_800_000_000;
  const secret = 'whsec_example';
  const signature = await computeCompletefulWebhookSignature(secret, timestamp, rawBody);
  const verified = await verifyCompletefulWebhook({
    rawBody,
    signatureHeader: `t=${timestamp},v1=${signature}`,
    secret,
    nowSeconds: timestamp,
  });
  assert.equal(verified.ok, true);

  const event = normalizeCompletefulEvent(JSON.parse(rawBody), { accountId: 'acct_1', webhookId: 'hook_1' });
  assert.equal(event.eventKey, 'completeful.order.created');
  assert.equal(event.subject, 'ord_1');
  assert.equal(event.source.provider, 'completeful');
  assert.equal(event.accountId, 'acct_1');
});


test('order creation requires explicit idempotency and is marked billable/high risk', async () => {
  const definition = COMPLETEFUL_TOOL_DEFINITIONS.find((tool) => tool.toolKey === 'completeful.order.create');
  assert.equal(definition.sideEffectLevel, 'billable_external_write');
  assert.equal(definition.idempotencyMode, 'required');
  assert.equal(definition.riskLevel, 'high');
  assert.equal(definition.receiptMode, 'redacted');

  const client = createCompletefulClient({
    apiKey: 'capp_test_example',
    fetchImpl: async () => new Response(JSON.stringify({ id: 'ord_1' }), { status: 201 }),
  });
  const adapter = createCompletefulProviderAdapter(client);
  await assert.rejects(
    () =>
      adapter.invoke({
        id: 'inv_order',
        toolKey: 'completeful.order.create',
        input: {
          shop_id: 'shop_1',
          body: { shipping_address: {}, line_items: [{}] },
        },
        requestedAt: Date.now(),
      }),
    (error) => error?.code === 'completeful_idempotency_required',
  );
});

test('write tools fail closed for live credentials', async () => {
  const client = createCompletefulClient({
    apiKey: 'capp_live_example',
    fetchImpl: async () => new Response('{}', { status: 200 }),
  });
  const adapter = createCompletefulProviderAdapter(client);
  await assert.rejects(
    () =>
      adapter.invoke({
        id: 'inv_publish',
        toolKey: 'completeful.product.publish',
        input: { shop_id: 'shop_1', product_id: 'prod_1' },
        requestedAt: Date.now(),
      }),
    /live writes are disabled/i,
  );
});

test('webhook.ensure does not duplicate an existing topic and redacts secrets', async () => {
  let calls = 0;
  const client = createCompletefulClient({
    apiKey: 'capp_test_example',
    fetchImpl: async () => {
      calls += 1;
      return new Response(
        JSON.stringify({
          items: [
            {
              id: 'wh_1',
              topic: 'order:created',
              url: 'https://example.com/webhooks/completeful',
              secret: 'must-not-leak',
            },
          ],
        }),
        { status: 200 },
      );
    },
  });
  const adapter = createCompletefulProviderAdapter(client);
  const result = await adapter.invoke({
    id: 'inv_webhook',
    toolKey: 'completeful.webhook.ensure',
    input: {
      shop_id: 'shop_1',
      topic: 'order:created',
      url: 'https://example.com/webhooks/completeful',
      idempotency_key: 'ensure-order-created-v1',
    },
    requestedAt: Date.now(),
  });
  assert.equal(calls, 1);
  assert.equal(result.output.created, false);
  assert.equal(result.output.webhook.secret, undefined);
});
