import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  RUNTIME_PROTOCOL_SCHEMA,
  capabilitiesSatisfy,
  normalizeLegacyConnection,
  normalizeArch,
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

  it('maps legacy execos transport to adapter + transport', () => {
    const n = normalizeLegacyConnection({ transport: 'execos', transport_provider: 'direct_https' });
    assert.equal(n.runtime_adapter, 'execos_legacy');
    assert.equal(n.transport, 'direct_https');
    assert.equal(n.protocol, 'agentsam.runtime.v1');
  });

  it('normalizes arch vocabulary', () => {
    assert.equal(normalizeArch('x64'), 'x86_64');
    assert.equal(normalizeArch('arm64'), 'arm64');
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
