import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionGatewayAuth } from '../../src/commands/autorag-node-api.js';
import { createSupabaseNodeApiClient } from '../../packages/agentsam-knowledge/src/backends/supabase-node-api.js';

const studio = 'https://studio.example.com/api/knowledge/node-api';
test('CLI OAuth tokens are never used as a Studio-native session substitute', async () => {
  await assert.rejects(sessionGatewayAuth(studio, { 'session-auth': true, 'trusted-origin': 'https://studio.example.com' }, {}), /studio_session_required/);
  await assert.rejects(sessionGatewayAuth(studio, { 'session-auth': true, 'trusted-origin': 'https://attacker.example' }, { AGENTSAM_STUDIO_SESSION_TOKEN: 'fake' }), /trusted_origin_required/);
});

test('explicit trusted Studio session injects bearer and paid consent only into authenticated gateway routes', async () => {
  const seen = [];
  const auth = await sessionGatewayAuth(studio, { 'session-auth': true, 'trusted-origin': 'https://studio.example.com' }, { AGENTSAM_STUDIO_SESSION_TOKEN: 'fixture-studio-session' });
  const fetchImpl = async (url, opts) => {
    seen.push({ url: String(url), headers: opts.headers });
    if (String(url).endsWith('/capabilities')) return Response.json({ ok: true, embedding: { default_model: 'gemini-embedding-2', default_dimensions: 1536 } });
    if (String(url).includes('vectors/query')) return Response.json({ ok: true, result_count: 0, results: [] });
    return Response.json({ ok: true, version: 'test' });
  };
  const client = createSupabaseNodeApiClient({ endpoint: studio, ...auth, fetchImpl });
  await client.capabilities();
  await client.query({ accountId: 'a', repositoryId: 'r', query: 'hello' });
  assert.equal(seen[0].headers.Authorization, 'Bearer fixture-studio-session');
  assert.equal(seen[0].headers['x-agentsam-paid-approved'], undefined);
  assert.equal(seen[1].headers['x-agentsam-paid-approved'], 'true');
  assert.equal(seen[1].headers['x-agentsam-bridge-key'], undefined);
});
