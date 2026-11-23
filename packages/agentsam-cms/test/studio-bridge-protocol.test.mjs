import test from 'node:test';
import assert from 'node:assert/strict';
import { signCmsBridgeRequest, verifyCmsBridgeRequest, isAllowedStudioCmsBridgeRoute } from '../src/studio-bridge-protocol.js';

const secret = 'studio-cms-integration-' + 'k'.repeat(40);
const scope = { actor: 'au_ownedaccount01', project: 'proj_ownedsiterow', now: 1810000000, nonce: '12345678-1234-4abc-9abc-123456789abc' };

test('portable CMS bridge accepts only allowlisted site authoring operations', () => {
  assert.equal(isAllowedStudioCmsBridgeRoute('pages/site-home/sections', 'POST'), true);
  assert.equal(isAllowedStudioCmsBridgeRoute('theme-projects', 'GET'), true);
  assert.equal(isAllowedStudioCmsBridgeRoute('orders', 'GET'), false);
  assert.equal(isAllowedStudioCmsBridgeRoute('pages/site-home/publish', 'GET'), false);
});

test('bridge authentication is bound to signed payload, actor, project and expiry', async () => {
  const original = new Request('https://cms-worker.internal/api/internal/studio-cms/pages/a?version=8', {
    method: 'PUT', headers: { 'content-type':'application/json' }, body: JSON.stringify({ headline: 'Original' }),
  });
  const signedHeaders = await signCmsBridgeRequest(original, { secret, ...scope });
  const signed = new Request(original, { headers: { ...Object.fromEntries(original.headers), ...signedHeaders } });
  assert.equal((await verifyCmsBridgeRequest(signed,{secret,expectedProject:scope.project,now:scope.now})).ok,true);
  const altered = new Request(original.url, { method:'PUT',headers:signed.headers,body:JSON.stringify({ headline:'Changed' }) });
  assert.equal((await verifyCmsBridgeRequest(altered,{secret,expectedProject:scope.project,now:scope.now})).ok,false);
  assert.equal((await verifyCmsBridgeRequest(signed,{secret,expectedProject:'proj_foreignsite',now:scope.now})).ok,false);
  assert.equal((await verifyCmsBridgeRequest(signed,{secret,expectedProject:scope.project,now:scope.now+65})).ok,false);
});
