import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWhoami, renderCloudflareStatus } from '../../src/commands/cloudflare-status.js';

test('parseWhoami reads wrangler JSON', () => {
  const who = parseWhoami({ loggedIn: true, authType: 'OAuth Token', email: 'a@b.c', accounts: [{ id: 'x1', name: 'Acme' }], tokenPermissions: ['account:read', 'workers:write'] });
  assert.equal(who.loggedIn, true);
  assert.equal(who.granted.size, 2);
  assert.equal(parseWhoami('not json'), null);
});

test('signed-out and signed-in views name a next command and never dump JSON', () => {
  assert.match(renderCloudflareStatus(parseWhoami({ loggedIn: false })), /agentsam login --cloudflare/);
  const out = renderCloudflareStatus(parseWhoami({ loggedIn: true, email: 'a@b.c', accounts: [{ id: 'x1', name: 'Acme' }], tokenPermissions: ['account:read', 'workers:write'] }));
  assert.match(out, /Acme \(x1\)/);
  assert.match(out, /Next:\s+agentsam cloudflare login --list-packs/);
  assert.doesNotMatch(out, /[{}"]/);
});
