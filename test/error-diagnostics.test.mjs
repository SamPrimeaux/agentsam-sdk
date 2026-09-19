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


test('public errors subpath preserves canonical and legacy diagnostic APIs', async () => {
  const errors = await import('@inneranimalmedia/agentsam-sdk/errors');
  assert.equal(typeof errors.createErrorEnvelope, 'function');
  assert.equal(typeof errors.classifyCloudflareFailure, 'function');
  assert.equal(typeof errors.classifyOpenAIError, 'function');
  assert.equal(typeof errors.diagnosticFromError, 'function');
});

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

test('OpenAI retry classifier distinguishes configuration, continuation, rate, server, and operator-action failures', () => {
  assert.deepEqual(classifyOpenAIError({ status: 400, message: 'Invalid service_tier argument' }), { category: 'service_tier', retriable: false, retry_strategy: 'change_configuration' });
  assert.deepEqual(classifyOpenAIError({ status: 400, code: 'previous_response_not_found' }), { category: 'continuation', retriable: true, retry_strategy: 'retry_full_context' });
  assert.deepEqual(classifyOpenAIError({ status: 400, code: 'websocket_connection_limit_reached' }), { category: 'connection_lifetime', retriable: true, retry_strategy: 'reconnect' });
  assert.deepEqual(classifyOpenAIError({ status: 429, type: 'rate_limit_error', code: 'slow_down' }), { category: 'ramp_rate', retriable: true, retry_strategy: 'retry_after_backoff' });
  assert.deepEqual(classifyOpenAIError({ status: 500 }), { category: 'provider_server', retriable: true, retry_strategy: 'retry_backoff' });
  assert.deepEqual(classifyOpenAIError({ status: 403 }), { category: 'authorization_or_region', retriable: false, retry_strategy: 'operator_action' });
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

test('Cloudflare and OAuth boundary classifiers map native failures into canonical AgentSam semantics', () => {
  assert.deepEqual(classifyCloudflareFailure({ httpStatus: 530, cloudflareCode: 1033 }), {
    code: ERROR_CODE.UNAVAILABLE,
    reason: ERROR_REASON.TUNNEL_CONNECTOR_UNAVAILABLE,
    retryable: true,
  });
  assert.deepEqual(classifyCloudflareFailure({ httpStatus: 526 }), {
    code: ERROR_CODE.UNAVAILABLE,
    reason: ERROR_REASON.TLS_CERTIFICATE_INVALID,
    retryable: false,
  });
  assert.deepEqual(classifyOAuthFailure('invalid_grant'), {
    code: ERROR_CODE.UNAUTHENTICATED,
    reason: ERROR_REASON.AUTH_INVALID,
    retryable: false,
  });
  assert.deepEqual(classifyOAuthFailure('access_denied'), {
    code: ERROR_CODE.PERMISSION_DENIED,
    reason: ERROR_REASON.PERMISSION_DENIED,
    retryable: false,
  });
});
