import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ERROR_CODE,
  ERROR_REASON,
  canonicalCodeFromGrpcStatus,
  classifyCloudflareFailure,
  classifyOAuthFailure,
  classifyOpenAIError,
  createErrorEnvelope,
  createOpenAIHttpError,
  diagnosticFromError,
  grpcStatusForCode,
} from '../src/errors/index.js';
import { createOpenAIResponsesAdapter } from '../src/providers/openai-responses.js';

function response(status, body, headers = {}) { return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } }); }

test('OpenAI compatibility error exposes the canonical envelope and preserves native evidence safely', () => {
  const error = createOpenAIHttpError({
    status: 429,
    body: { error: { type: 'rate_limit_error', code: 'slow_down', message: 'slow down Bearer abc.def.ghi', param: null }, api_key: 'sk-secret-value-123456789' },
    headers: new Headers({ 'retry-after': '2', 'x-request-id': 'req_123' }),
    requestedServiceTier: 'fast',
  });
  assert.equal(error.diagnostic, error.envelope);
  assert.equal(error.envelope.code, ERROR_CODE.RESOURCE_EXHAUSTED);
  assert.equal(error.envelope.reason, ERROR_REASON.PROVIDER_RATE_LIMITED);
  assert.equal(error.envelope.provider, 'openai');
  assert.equal(error.envelope.provider_code, 'slow_down');
  assert.equal(error.envelope.request_id, 'req_123');
  assert.equal(error.envelope.retry_after_ms, 2000);
  assert.equal(error.envelope.retryable, true);
  assert.equal(error.envelope.resolution_owner, 'provider');
  assert.equal(error.envelope.details.requested_service_tier, 'fast');
  assert.ok(!JSON.stringify(error.envelope).includes('sk-secret-value'));
  assert.ok(!error.envelope.message.includes('abc.def.ghi'));
});

test('legacy OpenAI classifier delegates to canonical provider semantics', () => {
  for (const code of ['credit_balance_exhausted', 'organization_spend_limit_exceeded', 'project_spend_limit_exceeded', 'organization_usage_limit_exceeded']) {
    assert.equal(classifyOpenAIError({ status: 429, code }).retriable, false);
  }
  assert.deepEqual(classifyOpenAIError({ status: 503, code: 'server_is_overloaded' }), { category: 'provider_overload', retriable: true, retry_strategy: 'retry_after_backoff' });
  assert.equal(classifyOpenAIError({ status: 401 }).category, 'authentication');
});

test('OpenAI compatibility retry labels remain stable while canonical reasons are authoritative', () => {
  assert.deepEqual(classifyOpenAIError({ status: 400, message: 'Invalid service_tier argument' }), { category: 'service_tier', retriable: false, retry_strategy: 'change_configuration' });
  assert.deepEqual(classifyOpenAIError({ status: 400, code: 'previous_response_not_found' }), { category: 'continuation', retriable: true, retry_strategy: 'retry_full_context' });
  assert.deepEqual(classifyOpenAIError({ status: 400, code: 'websocket_connection_limit_reached' }), { category: 'connection_lifetime', retriable: true, retry_strategy: 'reconnect' });
  assert.deepEqual(classifyOpenAIError({ status: 429, type: 'rate_limit_error', code: 'slow_down' }), { category: 'ramp_rate', retriable: true, retry_strategy: 'retry_after_backoff' });
  assert.deepEqual(classifyOpenAIError({ status: 500 }), { category: 'provider_server', retriable: true, retry_strategy: 'retry_backoff' });
  assert.deepEqual(classifyOpenAIError({ status: 403 }), { category: 'authorization_or_region', retriable: false, retry_strategy: 'inspect_error' });
});

test('Responses adapter keeps provider budget evidence in one canonical failure contract', async () => {
  const adapter = createOpenAIResponsesAdapter({
    apiKey: 'sk-test',
    fetchImpl: async () => response(429, { error: { type: 'insufficient_quota', code: 'project_spend_limit_exceeded', message: 'budget reached' } }, { 'x-request-id': 'req_budget' }),
  });
  await assert.rejects(
    adapter.create({ model: 'gpt-6-astra', reasoningEffort: 'low', serviceTier: 'default', input: 'hi' }),
    (error) => {
      const d = diagnosticFromError(error);
      assert.equal(d.code, ERROR_CODE.RESOURCE_EXHAUSTED);
      assert.equal(d.reason, ERROR_REASON.PROVIDER_BUDGET_EXHAUSTED);
      assert.equal(d.provider_code, 'project_spend_limit_exceeded');
      assert.equal(d.request_id, 'req_budget');
      assert.equal(d.retryable, false);
      assert.equal(d.resolution_owner, 'user');
      assert.equal(d.remediation.action, 'add_budget');
      return true;
    },
  );
});

test('canonical error contract preserves transport-neutral code and reason mappings', () => {
  const envelope = createErrorEnvelope({
    code: ERROR_CODE.UNAVAILABLE,
    reason: ERROR_REASON.TUNNEL_CONNECTOR_UNAVAILABLE,
    message: 'Local terminal tunnel has no healthy connector.',
    retryable: true,
    http_status: 530,
    provider: 'cloudflare',
    provider_code: '1033',
    transport: 'cloudflare_tunnel',
  });
  assert.equal(envelope.ok, false);
  assert.equal(envelope.code, 'UNAVAILABLE');
  assert.equal(envelope.reason, 'tunnel_connector_unavailable');
  assert.equal(envelope.http_status, 530);
  assert.equal(envelope.grpc_status, 14);
  assert.equal(envelope.retryable, true);
  assert.equal(canonicalCodeFromGrpcStatus(14), ERROR_CODE.UNAVAILABLE);
  assert.equal(grpcStatusForCode(ERROR_CODE.UNAUTHENTICATED), 16);
});

test('Cloudflare and OAuth classifiers emit the same canonical envelope shape', () => {
  const tunnel = classifyCloudflareFailure({ httpStatus: 530, cloudflareCode: 1033 });
  assert.equal(tunnel.code, ERROR_CODE.UNAVAILABLE);
  assert.equal(tunnel.reason, ERROR_REASON.TUNNEL_CONNECTOR_UNAVAILABLE);
  assert.equal(tunnel.retryable, true);
  assert.equal(tunnel.http_status, 530);
  assert.equal(tunnel.provider, 'cloudflare');

  const tls = classifyCloudflareFailure({ httpStatus: 526 });
  assert.equal(tls.code, ERROR_CODE.UNAVAILABLE);
  assert.equal(tls.reason, ERROR_REASON.TLS_CERTIFICATE_INVALID);
  assert.equal(tls.retryable, false);

  const invalidGrant = classifyOAuthFailure('invalid_grant');
  assert.equal(invalidGrant.code, ERROR_CODE.UNAUTHENTICATED);
  assert.equal(invalidGrant.reason, ERROR_REASON.PROVIDER_CREDENTIAL_INVALID);
  assert.equal(invalidGrant.retryable, false);

  const accessDenied = classifyOAuthFailure('access_denied');
  assert.equal(accessDenied.code, ERROR_CODE.PERMISSION_DENIED);
  assert.equal(accessDenied.reason, ERROR_REASON.USER_PERMISSION_DENIED);
  assert.equal(accessDenied.resolution_owner, 'user');
});
