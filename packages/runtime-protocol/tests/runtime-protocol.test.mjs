import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  RUNTIME_PROTOCOL_SCHEMA,
  capabilitiesSatisfy,
  substrateFromLegacyKind,
} from '../src/index.js';

describe('agentsam.runtime.v1', () => {
  it('names the protocol schema', () => {
    assert.equal(RUNTIME_PROTOCOL_SCHEMA, 'agentsam.runtime.v1');
  });

  it('maps legacy terminal kinds to substrate', () => {
    assert.equal(substrateFromLegacyKind('local_device').substrate, 'host');
    assert.equal(substrateFromLegacyKind('vm').substrate, 'vm');
    assert.equal(substrateFromLegacyKind('sandbox').substrate, 'sandbox');
  });

  it('hard-fails missing required capabilities', () => {
    const r = capabilitiesSatisfy(
      { pty: true, docker: true },
      { pty: true, docker: false },
    );
    assert.equal(r.ok, false);
    assert.deepEqual(r.missing, ['docker']);
  });
});
