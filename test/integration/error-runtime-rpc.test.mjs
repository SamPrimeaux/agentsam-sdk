import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AgentSamError,
  createErrorEnvelope,
} from '../../packages/agentsam-errors/src/index.js';
import {
  decodeErrorDetail,
  decodeJob,
  encodeErrorDetail,
  encodeJob,
  fromGrpcError,
  toGrpcError,
} from '../../src/knowledge/service/grpc-codec.js';

function sampleEnvelope() {
  return createErrorEnvelope({
    reason: 'provider_budget_exhausted',
    message: 'Provider account budget is exhausted.',
    source: { kind: 'provider', name: 'openai', service: 'responses' },
    resolution_owner: 'agentsam',
    severity: 'blocking_internal',
    remediation: { action: 'inspect_platform', message: 'AgentSam must inspect its platform-owned OpenAI account.' },
    domain: 'provider',
    tool: 'openai',
    stage: 'request',
    provider: 'openai',
    provider_code: 'project_spend_limit_exceeded',
    request_id: 'req_123',
    trace_id: 'trace_123',
    transport: 'grpc',
    resource: { type: 'provider_account', id: 'platform', name: 'OpenAI' },
    native: { code: 'project_spend_limit_exceeded', exception_type: 'insufficient_quota' },
    environment: { component: 'responses', runtime: 'node', platform: 'linux' },
    details: { tier: 'default' },
  });
}

test('protobuf ErrorDetail preserves the canonical AgentSam envelope', () => {
  const source = sampleEnvelope();
  const roundTrip = decodeErrorDetail(encodeErrorDetail(source));
  assert.deepEqual(roundTrip, source);
});

test('gRPC exception metadata round-trips one canonical AgentSamError', () => {
  const source = sampleEnvelope();
  const wireError = toGrpcError(new AgentSamError(source));
  const decoded = fromGrpcError(wireError);
  assert.ok(decoded instanceof AgentSamError);
  assert.deepEqual(decoded.envelope, source);
  assert.equal(decoded.grpcCode, 8);
  assert.equal(decoded.rpcCode, 'RESOURCE_EXHAUSTED');
});

test('durable job protobuf retains structured failure and compatibility message', () => {
  const failure = sampleEnvelope();
  const message = encodeJob({
    id: '11111111-1111-1111-1111-111111111111',
    status: 'failed',
    attempts: 2,
    created_at: '2026-09-17T00:00:00.000Z',
    updated_at: '2026-09-17T00:01:00.000Z',
    result: null,
    failure,
  });
  const decoded = decodeJob(message);
  assert.equal(decoded.status, 'failed');
  assert.deepEqual(decoded.failure, failure);
  assert.equal(decoded.error, failure.message);
});
