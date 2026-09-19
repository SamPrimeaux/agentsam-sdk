import assert from 'node:assert/strict';
import test from 'node:test';
import { redactErrorValue, redactString } from '../src/index.js';

test('redaction never leaks machine credential values', () => {
  const leaked = redactString('key=aak_liveMachineKey12345678 secret=sk-testKey1234567890');
  assert.ok(!leaked.includes('aak_liveMachineKey12345678'), 'agent API key must be redacted');
  assert.ok(!leaked.includes('sk-testKey1234567890'), 'provider key must be redacted');
  assert.ok(leaked.includes('[REDACTED]'), 'redaction marker must be present');
});

test('redaction strips credential-named object keys at any depth', () => {
  const value = redactErrorValue({
    provider: 'openai',
    credentials: { api_key: 'sk-testKey1234567890', mode: 'byok' },
    nested: { list: [{ authorization: 'Bearer abcdef123456' }] },
  });
  assert.equal(value.credentials, '[REDACTED]', 'credential-named objects redact wholesale');
  assert.equal(value.nested.list[0].authorization, '[REDACTED]');
  assert.equal(value.provider, 'openai');
});
