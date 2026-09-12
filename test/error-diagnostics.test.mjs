import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyOpenAIError, createOpenAIHttpError, diagnosticFromError } from '../src/errors/index.js';
import { createOpenAIResponsesAdapter } from '../src/providers/openai-responses.js';

function response(status, body, headers = {}) { return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } }); }

test('OpenAI diagnostics preserve machine code, request id, retry metadata and redact secrets', () => {
  const error = createOpenAIHttpError({
    status: 429,
    body: { error: { type: 'rate_limit_error', code: 'slow_down', message: 'slow down Bearer abc.def.ghi', param: null }, api_key: 'sk-secret-value-123456789' },
    headers: new Headers({ 'retry-after': '2', 'x-request-id': 'req_123' }),
    requestedServiceTier: 'fast',
  });
  assert.equal(error.diagnostic.http_status, 429);
  assert.equal(error.diagnostic.type, 'rate_limit_error');
  assert.equal(error.diagnostic.code, 'slow_down');
  assert.equal(error.diagnostic.request_id, 'req_123');
  assert.equal(error.diagnostic.retry_after_ms, 2000);
  assert.equal(error.diagnostic.retriable, true);
  assert.equal(error.diagnostic.retry_strategy, 'retry_after_backoff');
  assert.equal(error.diagnostic.requested_service_tier, 'fast');
  assert.ok(!JSON.stringify(error.diagnostic).includes('sk-secret-value'));
  assert.ok(!error.diagnostic.message.includes('abc.def.ghi'));
});

test('billing and spend errors are explicitly non-retriable while provider overload is retriable', () => {
  for (const code of ['credit_balance_exhausted', 'organization_spend_limit_exceeded', 'project_spend_limit_exceeded', 'organization_usage_limit_exceeded']) {
    assert.equal(classifyOpenAIError({ status: 429, code }).retriable, false);
  }
  assert.deepEqual(classifyOpenAIError({ status: 503, code: 'server_is_overloaded' }), { category: 'provider_overload', retriable: true, retry_strategy: 'retry_after_backoff' });
  assert.equal(classifyOpenAIError({ status: 401 }).category, 'authentication');
});

test('Responses adapter throws a diagnostic error instead of flattening the provider response', async () => {
  const adapter = createOpenAIResponsesAdapter({
    apiKey: 'sk-test',
    fetchImpl: async () => response(429, { error: { type: 'insufficient_quota', code: 'project_spend_limit_exceeded', message: 'budget reached' } }, { 'x-request-id': 'req_budget' }),
  });
  await assert.rejects(
    adapter.create({ model: 'gpt-6-astra', reasoningEffort: 'low', serviceTier: 'default', input: 'hi' }),
    (error) => {
      const d = diagnosticFromError(error);
      assert.equal(d.code, 'project_spend_limit_exceeded');
      assert.equal(d.request_id, 'req_budget');
      assert.equal(d.retriable, false);
      return true;
    },
  );
});
