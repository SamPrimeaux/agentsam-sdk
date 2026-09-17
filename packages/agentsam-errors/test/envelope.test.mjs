import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AgentSamError,
  ERROR_CODE,
  ERROR_REASON,
  createErrorEnvelope,
  normalizeError,
  parseError,
  serializeError,
} from '../src/index.js';

test('reason policy supplies canonical code severity owner and remediation', () => {
  const error = createErrorEnvelope({
    reason: ERROR_REASON.PROVIDER_CREDENTIAL_MISSING,
    message: 'OpenAI is not configured.',
    source: { kind: 'user', name: 'project_configuration', service: 'openai' },
    domain: 'provider',
    provider: 'openai',
  });
  assert.equal(error.code, ERROR_CODE.FAILED_PRECONDITION);
  assert.equal(error.severity, 'blocking_user_fixable');
  assert.equal(error.resolution_owner, 'user');
  assert.equal(error.remediation.action, 'configure_provider_credential');
  assert.equal(error.retryable, false);
});

test('known reasons cannot drift to a contradictory canonical code', () => {
  assert.throws(() => createErrorEnvelope({
    reason: ERROR_REASON.PROVIDER_CREDENTIAL_MISSING,
    code: ERROR_CODE.INTERNAL,
    message: 'wrong',
  }), /requires canonical code/);
});

test('blocking internal failures cannot prescribe user infrastructure edits', () => {
  assert.throws(() => createErrorEnvelope({
    reason: ERROR_REASON.INTERNAL,
    message: 'bad internal state',
    remediation: { action: 'change_configuration' },
  }), /cannot prescribe user remediation/);
});

test('canonical envelopes round-trip without semantic loss', () => {
  const source = createErrorEnvelope({
    reason: ERROR_REASON.IDENTITY_RESOLUTION_FAILED,
    message: 'Control plane identity lookup failed.',
    source: { kind: 'agentsam', name: 'inneranimalmedia', service: 'terminal_control_plane' },
    domain: 'device',
    trace_id: 'trace_1',
  });
  const roundTrip = parseError(serializeError(source));
  assert.deepEqual(roundTrip, source);
});

test('AgentSamError is a throwable view over the immutable envelope', () => {
  const error = new AgentSamError({ reason: ERROR_REASON.INTERNAL_ADAPTER_FAILED, message: 'adapter failed' });
  assert.equal(error.code, 'INTERNAL');
  assert.equal(error.reason, 'internal_adapter_failed');
  assert.equal(error.envelope.fingerprint, error.fingerprint);
  assert.equal(Object.isFrozen(error.envelope), true);
});

test('unknown native Errors normalize to an AgentSam-owned internal failure', () => {
  const error = normalizeError(Object.assign(new Error('boom'), { code: 'EBOOM' }));
  assert.equal(error.reason, 'internal');
  assert.equal(error.source.kind, 'agentsam');
  assert.equal(error.resolution_owner, 'agentsam');
  assert.equal(error.native.code, 'EBOOM');
});
