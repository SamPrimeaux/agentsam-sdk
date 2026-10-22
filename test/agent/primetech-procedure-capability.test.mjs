import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCapabilityAdapter } from '../../src/agent/capability-adapter.js';

test('PrimeTech procedure is exposed only when the existing host binds its handler', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'primetech-capability-'));
  const calls = [];
  const handler = async input => {
    calls.push(input);
    return {
      schema: 'inneranimalmedia.primetech.procedure-run.v1',
      id: input.id,
      version: input.version,
      status: 'completed',
      verification: { kind: 'output_schema', ok: true },
    };
  };
  try {
    const adapter = createCapabilityAdapter({
      projectRoot: root,
      handlers: { 'primetech.procedure.run': handler },
      authorizeCapability: async () => true,
    });
    assert.equal(adapter.canInvoke('primetech.procedure.run'), true);
    assert.ok(adapter.toolDescriptors().some(row => row.name === 'primetech.procedure.run'));
    const input = { id: 'repo.asset.inventory', version: '0.1.0', input: {} };
    const direct = await adapter.invoke('primetech.procedure.run', input);
    assert.equal(direct.result.schema, 'inneranimalmedia.primetech.procedure-run.v1');
    assert.equal(direct.result.id, input.id);
    const mediated = await adapter.invoke('capability.invoke', {
      capability_id: 'primetech.procedure.run',
      input,
    });
    assert.notEqual(mediated.result?.error, 'capability_not_allowlisted');
    assert.equal(calls.length, 2);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
