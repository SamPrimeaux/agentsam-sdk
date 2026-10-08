import test from 'node:test';
import assert from 'node:assert/strict';
import { createRegistry } from '../../src/registry/index.js';

test('registry joins real command, capability and package catalogs without claiming execution', () => {
  const registry = createRegistry();
  assert.ok(registry.commands().some((row) => row.id === 'terminal'));
  assert.ok(registry.packages().some((row) => row.id === 'agentsam-local-shared'));
  assert.ok(registry.packages().some((row) => row.id === 'agentsam-connector-cloudflare'));
  assert.equal(registry.status('repository.snapshot').readiness, 'unverified');
  assert.equal(registry.search('machine', {type:'command'})[0]?.id,'machine');
});
test('registry refuses invocation without executable binding and host authorization', async () => {
  const adapter = {
    canInvoke: (id) => id === 'repository.snapshot',
    invoke: async (id, input) => ({ capability_id: id, result: input }),
  };
  const registry = createRegistry({ capabilityAdapter: adapter });
  assert.equal(registry.status('repository.snapshot').agent_callable, true);
  assert.equal(registry.status('security.scan').agent_callable, false);
  assert.equal((await registry.invoke('repository.snapshot',{})).error, 'capability_not_authorized');
  assert.equal((await registry.invoke('repository.snapshot',{cwd:'/safe'},{authorize:async()=>true})).ok,true);
  assert.equal((await registry.invoke('security.scan',{}, {authorize:async()=>true})).error,'capability_handler_unavailable');
});
