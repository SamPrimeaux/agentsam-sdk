import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createRuntimeSelector,
  matchRuntimeCandidate,
  normalizeRuntimeRequirements,
  selectRuntimeCandidate,
} from '../../src/acp/runtime-selection.js';

const runtimes = [
  {
    id: 'runtime_local',
    schema: 'agentsam.runtime.v1',
    provider: 'local',
    substrate: 'host',
    lifecycle: 'persistent',
    runtime_adapter: 'agentsamd',
    status: 'ready',
    capabilities: { exec: true, filesystem: true, process: true, git: true, pty: true },
    transport: 'local_socket',
  },
  {
    id: 'runtime_gcp',
    schema: 'agentsam.runtime.v1',
    provider: 'google_cloud',
    substrate: 'vm',
    provider_product: 'compute_engine',
    lifecycle: 'persistent',
    runtime_adapter: 'agentsamd',
    status: 'online',
    capabilities: { exec: true, filesystem: true, process: true, git: true, docker: true },
    transport: 'direct_https',
  },
  {
    id: 'runtime_cloudflare',
    schema: 'agentsam.runtime.v1',
    provider: 'cloudflare',
    substrate: 'container',
    provider_product: 'containers',
    lifecycle: 'scale_to_zero',
    runtime_adapter: 'cloudflare_sandbox',
    status: 'sleeping',
    capabilities: { exec: true, filesystem: true, process: true },
    transport: 'service_binding',
  },
  {
    id: 'runtime_docker',
    schema: 'agentsam.runtime.v1',
    provider: 'local',
    substrate: 'container',
    provider_product: 'docker',
    lifecycle: 'job',
    runtime_adapter: 'docker_engine',
    status: 'ready',
    capabilities: { exec: true, filesystem: true, process: true, docker: true },
    transport: 'local_socket',
  },
];

test('runtime requirements accept ergonomic capability arrays but normalize to protocol booleans', () => {
  const req = normalizeRuntimeRequirements({
    capabilities: ['exec', 'filesystem'],
    preferred_providers: ['google_cloud', 'cloudflare', 'local'],
  });
  assert.deepEqual(req.capabilities, { exec: true, filesystem: true });
  assert.deepEqual(req.preferredProviders, ['google_cloud', 'cloudflare', 'local']);
  assert.equal(matchRuntimeCandidate(runtimes[0], req).ok, true);
});

test('ACP runtime selection is provider-neutral and explicit preference chooses among eligible hosts', () => {
  const defaultSelection = selectRuntimeCandidate(runtimes, {
    capabilities: ['exec', 'filesystem'],
  });
  assert.equal(defaultSelection.runtime_id, 'runtime_docker');

  const gcpFirst = selectRuntimeCandidate(runtimes, {
    capabilities: ['exec', 'filesystem'],
    preferred_providers: ['google_cloud', 'cloudflare', 'local'],
  });
  assert.equal(gcpFirst.runtime_id, 'runtime_gcp');

  const cloudflareRequired = selectRuntimeCandidate(runtimes, {
    provider: 'cloudflare',
    capabilities: { exec: true, filesystem: true },
  });
  assert.equal(cloudflareRequired.runtime_id, 'runtime_cloudflare');

  const dockerRequired = selectRuntimeCandidate(runtimes, {
    substrate: 'container',
    provider_product: 'docker',
    capabilities: ['docker'],
  });
  assert.equal(dockerRequired.runtime_id, 'runtime_docker');
});

test('runtime selection fails closed with diagnostics when no runtime satisfies hard constraints', () => {
  assert.throws(
    () => selectRuntimeCandidate(runtimes, { capabilities: ['gpu', 'exec'] }),
    (error) => {
      assert.equal(error.code, 'runtime_unavailable');
      assert.equal(error.diagnostics.length, runtimes.length);
      assert.equal(error.diagnostics.every((row) => row.mismatches.some((m) => m.field === 'capabilities.gpu')), true);
      return true;
    },
  );
});

test('runtime selector consumes any registry implementation, not a Cloudflare-specific registry', async () => {
  const selector = createRuntimeSelector({
    listRuntimes: async ({ account_id }) => {
      assert.equal(account_id, 'acct_1');
      return runtimes;
    },
  });
  const selection = await selector(
    { provider: 'google_cloud', capabilities: ['exec'] },
    { account_id: 'acct_1' },
  );
  assert.equal(selection.runtime_id, 'runtime_gcp');
});
