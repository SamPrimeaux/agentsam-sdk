import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createToolExecutor,
  createToolRegistry,
} from '../../src/tools/index.js';
import {
  COMPLETEFUL_TOOL_DEFINITIONS,
  createCompletefulClient,
  createCompletefulProviderAdapter,
} from '../../packages/providers/completeful/src/index.js';

test('tool runtime owns idempotency, redacts durable receipts, and emits safe events', async () => {
  let captured = null;
  const client = createCompletefulClient({
    apiKey: 'capp_test_example',
    fetchImpl: async (url, init) => {
      captured = { url, init };
      return new Response(
        JSON.stringify({
          id: 'ord_1',
          email: 'customer@example.com',
          shipping_address: { line1: 'private street' },
          notes: 'private note',
        }),
        { status: 201, headers: { 'x-request-id': 'req_order_1' } },
      );
    },
  });

  const registry = createToolRegistry({
    tools: COMPLETEFUL_TOOL_DEFINITIONS,
    adapters: [createCompletefulProviderAdapter(client)],
  });

  const recorded = [];
  const observed = [];
  let sequence = 0;
  const executor = createToolExecutor({
    registry,
    makeId: (prefix) => `${prefix}_test_${++sequence}`,
    now: (() => {
      let value = 1_800_000_000_000;
      return () => ++value;
    })(),
    recordReceipt: (receipt) => recorded.push(receipt),
    onEvent: (event) => observed.push(event),
  });

  const result = await executor.execute({
    toolKey: 'completeful.order.create',
    accountId: 'acct_1',
    correlationId: 'corr_1',
    input: {
      shop_id: 'shop_1',
      body: {
        shipping_address: { line1: 'private street' },
        email: 'customer@example.com',
        notes: 'private note',
        line_items: [{ product_id: 'prod_1', quantity: 1 }],
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.output.email, 'customer@example.com');
  assert.equal(captured.init.headers.get('Idempotency-Key'), result.invocation.id);
  assert.equal(result.receipt.input.body.email, '[REDACTED]');
  assert.equal(result.receipt.input.body.shipping_address, '[REDACTED]');
  assert.equal(result.receipt.output.email, '[REDACTED]');
  assert.equal(result.receipt.output.shipping_address, '[REDACTED]');
  assert.equal(recorded.length, 1);
  assert.equal(observed.length, 1);
  assert.equal(observed[0].eventKey, 'completeful.order.created');
  assert.equal(observed[0].payload.output.email, '[REDACTED]');
  assert.equal(observed[0].causationId, result.invocation.id);
  assert.equal(observed[0].correlationId, 'corr_1');
});

test('tool runtime converts provider errors into the canonical AgentSam envelope', async () => {
  const client = createCompletefulClient({
    apiKey: 'capp_test_example',
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          error: 'too many requests',
          code: 'rate_limited',
          request_id: 'req_rate',
        }),
        { status: 429 },
      ),
  });

  const registry = createToolRegistry({
    tools: COMPLETEFUL_TOOL_DEFINITIONS,
    adapters: [createCompletefulProviderAdapter(client)],
  });
  const executor = createToolExecutor({
    registry,
    makeId: (prefix) => `${prefix}_failure`,
  });

  const result = await executor.execute({
    toolKey: 'completeful.catalog.list',
    input: { limit: 1 },
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.reason, 'provider_rate_limited');
  assert.equal(result.error.code, 'RESOURCE_EXHAUSTED');
  assert.equal(result.error.provider, 'completeful');
  assert.equal(result.error.provider_code, 'rate_limited');
  assert.equal(result.error.request_id, 'req_rate');
  assert.equal(result.receipt.status, 'failed');
});

test('registry rejects duplicate tool keys instead of silently shadowing definitions', () => {
  const definition = COMPLETEFUL_TOOL_DEFINITIONS[0];
  assert.throws(
    () => createToolRegistry({ tools: [definition, definition] }),
    /duplicate tool definition/,
  );
});
