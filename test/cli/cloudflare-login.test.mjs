import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCloudflareBrowserOAuthStartUrl,
  runCloudflareBrowserOAuthLogin,
} from '../../src/commands/cloudflare-login.js';

const catalog = {
  ok: true,
  provider: 'cloudflare',
  default_packs: [],
  default_capabilities: ['cloudflare.workers', 'cloudflare.d1'],
  full_catalog_opt_in: true,
  aliases: { media: ['store', 'create'], data: ['store'] },
  registered_packs: [
    { pack_id: 'watch', label: 'Watch', description: 'Observe account activity', requested_scopes: ['workers-tail.read'], capabilities: [] },
    { pack_id: 'store', label: 'Store', description: 'Manage storage', requested_scopes: ['d1.read', 'd1.write'], capabilities: ['cloudflare.d1'] },
    { pack_id: 'build', label: 'Build', description: 'Build and deploy', requested_scopes: ['workers-scripts.write'], capabilities: ['cloudflare.workers'] },
    { pack_id: 'create', label: 'Create', description: 'Create media and AI', requested_scopes: ['images.write'], capabilities: ['cloudflare.images'] },
  ],
  available_capabilities: [
    { id: 'cloudflare.d1', label: 'D1', scopes: ['d1.read', 'd1.write'] },
  ],
};

test('browser OAuth URL forwards pack IDs without expanding scopes in the CLI', () => {
  const plan = buildCloudflareBrowserOAuthStartUrl({
    hostOrigin: 'https://agentsam.example',
    packs: ['media'],
    aliases: catalog.aliases,
    packCatalog: catalog.registered_packs,
  });
  const url = new URL(plan.authorize_url);
  assert.equal(url.searchParams.get('packs'), 'media');
  assert.deepEqual(plan.packs.sort(), ['create', 'store']);
  assert.equal(plan.scope_count, null);
  assert.deepEqual(plan.scopes, []);
  assert.equal(plan.packs_detail.length, 2);
});

test('omitting packs leaves default selection to the host plugin catalog', () => {
  const plan = buildCloudflareBrowserOAuthStartUrl({
    hostOrigin: 'https://agentsam.example',
    defaultPacks: catalog.default_packs,
    defaultCapabilities: catalog.default_capabilities,
    packCatalog: catalog.registered_packs,
  });
  const url = new URL(plan.authorize_url);
  assert.equal(url.searchParams.has('packs'), false);
  assert.deepEqual(plan.packs, []);
  assert.deepEqual(plan.capabilities, ['cloudflare.workers', 'cloudflare.d1']);
});

test('pack listing is fetched from the authenticated host registry', async () => {
  const requests = [];
  const result = await runCloudflareBrowserOAuthLogin(['--list-packs', '--json'], {
    hostOrigin: 'https://agentsam.example',
    authorityLoader: async () => ({ value: 'aak_test' }),
    fetchImpl: async (url, init) => {
      requests.push({ url: String(url), init });
      return { ok: true, status: 200, json: async () => catalog };
    },
    write: () => {},
  });
  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /api\/connections\/cloudflare\/permissions$/);
  assert.equal(requests[0].init.headers.authorization, 'Bearer aak_test');
  assert.deepEqual(result.packs.map((pack) => pack.pack_id), ['watch', 'store', 'build', 'create']);
  assert.deepEqual(result.default_capabilities, ['cloudflare.workers', 'cloudflare.d1']);
});

test('explicit all permission selection is accepted only when the host enables it', async () => {
  const result = await runCloudflareBrowserOAuthLogin(['--pack', 'all', '--no-open', '--json'], {
    hostOrigin: 'https://agentsam.example',
    authorityLoader: async () => ({ value: 'aak_test' }),
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => catalog }),
    write: () => {},
  });
  const url = new URL(result.authorize_url);
  assert.equal(url.searchParams.get('packs'), 'all');
});

test('login validates against the host registry and leaves scope expansion to the host', async () => {
  const result = await runCloudflareBrowserOAuthLogin(['--pack', 'watch', '--no-open', '--json'], {
    hostOrigin: 'https://agentsam.example',
    authorityLoader: async () => ({ value: 'aak_test' }),
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => catalog }),
    write: () => {},
  });
  const url = new URL(result.authorize_url);
  assert.equal(url.searchParams.get('packs'), 'watch');
  assert.deepEqual(result.scopes, []);
  assert.equal(result.scope_count, null);
});


async function assertAgentSamError(promise, reason) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.name, 'AgentSamError');
    assert.equal(error.reason, reason);
    assert.ok(error.envelope);
    return true;
  });
}

test('invalid CLI options return canonical structured input errors', async () => {
  await assertAgentSamError(runCloudflareBrowserOAuthLogin(['--not-a-real-option'], {}), 'input_invalid');
});

test('missing permission-catalog fetch implementation returns a structured transport error', async () => {
  await assertAgentSamError(runCloudflareBrowserOAuthLogin(['--list-packs'], {
    hostOrigin: 'https://agentsam.example',
    authorityLoader: async () => ({ value: 'aak_test' }),
    fetchImpl: {},
    write: () => {},
  }), 'transport_not_configured');
});

test('permission-catalog HTTP failures return structured provider errors', async () => {
  await assertAgentSamError(runCloudflareBrowserOAuthLogin(['--list-packs'], {
    hostOrigin: 'https://agentsam.example',
    authorityLoader: async () => ({ value: 'aak_test' }),
    fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({ ok: false, error: 'service unavailable' }) }),
    write: () => {},
  }), 'provider_unavailable');
});

test('missing account authority returns a structured authentication error', async () => {
  await assertAgentSamError(runCloudflareBrowserOAuthLogin(['--list-packs'], {
    hostOrigin: 'https://agentsam.example',
    authorityLoader: async () => ({ value: null, error: 'Sign in first' }),
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => catalog }),
    write: () => {},
  }), 'auth_missing');
});

test('unknown permission packs return a structured input error with the legacy code retained as detail', async () => {
  await assert.rejects(runCloudflareBrowserOAuthLogin(['--pack', 'missing-pack', '--no-open', '--json'], {
    hostOrigin: 'https://agentsam.example',
    authorityLoader: async () => ({ value: 'aak_test' }),
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => catalog }),
    write: () => {},
  }), (error) => {
    assert.equal(error.name, 'AgentSamError');
    assert.equal(error.reason, 'input_invalid');
    assert.equal(error.envelope.details.legacy_code, 'cloudflare_permission_pack_unavailable');
    return true;
  });
});

test('unknown capabilities return a structured input error', async () => {
  await assertAgentSamError(runCloudflareBrowserOAuthLogin(['--capability', 'cloudflare.missing', '--no-open', '--json'], {
    hostOrigin: 'https://agentsam.example',
    authorityLoader: async () => ({ value: 'aak_test' }),
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => catalog }),
    write: () => {},
  }), 'input_invalid');
});
