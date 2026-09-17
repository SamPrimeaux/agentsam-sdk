import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createErrorEnvelope,
  fromHttpError,
  retryDelayMs,
  shouldRetry,
  toHttpError,
} from '../src/index.js';

test('HTTP transport preserves the complete canonical envelope', () => {
  const error = createErrorEnvelope({
    reason: 'provider_rate_limited',
    message: 'Slow down',
    source: { kind: 'provider', name: 'openai' },
    provider: 'openai',
    provider_code: 'slow_down',
    request_id: 'req_1',
    retry_after_ms: 2000,
    domain: 'provider',
  });
  const http = toHttpError(error);
  const decoded = fromHttpError({ status: http.status, body: http.body, headers: http.headers });
  assert.deepEqual(decoded, error);
});

test('fallback HTTP failures still normalize without provider-specific code', () => {
  const error = fromHttpError({ status: 503, body: { message: 'upstream down' }, provider: 'example' });
  assert.equal(error.code, 'UNAVAILABLE');
  assert.equal(error.reason, 'transport_unreachable');
  assert.equal(error.retryable, true);
});

test('retry policy honors provider Retry-After before exponential fallback', () => {
  const explicit = createErrorEnvelope({ reason: 'provider_rate_limited', message: 'wait', retry_after_ms: 2500 });
  const fallback = createErrorEnvelope({ reason: 'provider_unavailable', message: 'down' });
  assert.equal(shouldRetry(explicit), true);
  assert.equal(retryDelayMs(explicit, 4), 2500);
  assert.equal(retryDelayMs(fallback, 3, { baseMs: 500 }), 2000);
});

test('fingerprints exclude volatile request ids and messages', () => {
  const a = createErrorEnvelope({ reason: 'provider_unavailable', message: 'first', source: { kind: 'provider', name: 'openai' }, provider: 'openai', request_id: 'req_a' });
  const b = createErrorEnvelope({ reason: 'provider_unavailable', message: 'different wording', source: { kind: 'provider', name: 'openai' }, provider: 'openai', request_id: 'req_b' });
  assert.equal(a.fingerprint, b.fingerprint);
});
