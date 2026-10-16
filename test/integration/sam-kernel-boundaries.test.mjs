import assert from 'node:assert/strict';
import test from 'node:test';
import { AgentSamClient } from '../../src/sam/client.js';
import { createSamOS } from '../../src/sam/os.js';

const operation = (id, handler = async input => input) => ({
  id, module: 'test', action: 'probe', summary: 'Portable SAM kernel test',
  execution: { lanes: ['local'], model: 'never', network: 'none', sideEffects: 'none' },
  risk: 'read_only', handler,
});

test('domain convenience API defaults to configured client root, not ambient process root', async () => {
  const root = '/fixture/repository-b';
  const os = createSamOS({ core: false });
  os.install([operation('repository.inspect', async (input, ctx) => ({ input, cwd: ctx.cwd }))]);
  const sam = new AgentSamClient({ os, cwd: root });
  const result = await sam.repository.inspect();
  assert.equal(result.ok, true);
  assert.equal(result.data.input.root, root);
  assert.equal(result.data.input.cwd, root);
  assert.equal(result.data.cwd, root);
  const explicit = await sam.repository.inspect({ root: '/fixture/repository-a' });
  assert.equal(explicit.data.input.root, '/fixture/repository-a');
});

test('SAM isolated OS installs operations atomically', () => {
  const os = createSamOS({ core: false });
  os.install([operation('test.existing')]);
  const before = os.status();
  assert.throws(() => os.install([operation('test.new'), operation('test.existing')]), /duplicate/);
  assert.equal(os.get('test.new'), null);
  assert.deepEqual(os.status(), before);
  assert.throws(() => os.install([operation('test.repeat'), operation('test.repeat')]), /duplicate/);
  assert.equal(os.get('test.repeat'), null);
  assert.throws(() => os.install([operation('test.valid'), { id: 'bad.id' }]), /handler must be a function/);
  assert.equal(os.get('test.valid'), null);
});
