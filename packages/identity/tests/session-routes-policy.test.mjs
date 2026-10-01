import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SESSION_POLICY, clampAgentSessionTtl, shouldRenewDesktopSession } from '../src/core/session-policy.js';
import { IDENTITY_ROUTE_IDS } from '../src/contracts/route-ids.js';

describe('SESSION_POLICY', () => {
  it('keeps browser and agent TTLs distinct', () => {
    assert.equal(SESSION_POLICY.browser.ttlSeconds, 30 * 24 * 60 * 60);
    assert.equal(SESSION_POLICY.desktop.ttlSeconds, 30 * 24 * 60 * 60);
    assert.equal(SESSION_POLICY.desktop.renewWindowSeconds, 7 * 24 * 60 * 60);
    assert.equal(SESSION_POLICY.agent.defaultTtlSeconds, 15 * 60);
    assert.equal(clampAgentSessionTtl(30), 60);
    assert.equal(clampAgentSessionTtl(900), 900);
    assert.equal(clampAgentSessionTtl(999999), 24 * 60 * 60);
  });
});

describe('IDENTITY_ROUTE_IDS', () => {
  it('exposes semantic IDs only', () => {
    assert.equal(IDENTITY_ROUTE_IDS.LOGIN, 'identity.login');
    assert.ok(!String(IDENTITY_ROUTE_IDS.LOGIN).startsWith('/'));
  });
});

describe('desktop session renewal', () => {
  it('only renews in the final seven days', () => {
  const now = 2_000_000;
  assert.equal(shouldRenewDesktopSession({ type: 'desktop', expires_at: now + 6 * 24 * 60 * 60 }, now), true);
  assert.equal(shouldRenewDesktopSession({ type: 'desktop', expires_at: now + 8 * 24 * 60 * 60 }, now), false);
  assert.equal(shouldRenewDesktopSession({ type: 'browser', expires_at: now + 60 }, now), false);
  assert.equal(shouldRenewDesktopSession({ type: 'desktop', expires_at: now - 1 }, now), false);
  });
});
