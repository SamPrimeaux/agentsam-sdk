import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { createShellSamAdapter } from '../../../src/sam/shell-host.js';
import { createCapabilityAdapter } from '../../../src/agent/capability-adapter.js';
import { createProcedureCatalog, createPrimeTechProcedureHandler } from '../src/index.js';

test('PrimeTech creative SAM operations run only through approved packaged procedures', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'primetech-sam-'));
  try {
    const catalog = createProcedureCatalog();
    const procedureOperationIds = catalog.list().flatMap(row => {
      if (!row.available) return [];
      const runtime = catalog.get(row.id, row.version).manifest.runtime;
      return runtime.kind === 'sam_operation' ? [runtime.operation] : [];
    });
    const adapter = createShellSamAdapter({
      state: { cwd: root, home: root, projectRoot: root },
      trustedIdentity: { accountId: 'acct_test', actorId: 'actor_test', installationId: 'local_test' },
      procedureOperationIds,
      authorize: async () => true,
    });
    assert.ok(adapter);
    assert.equal(adapter.canInvokeProcedureOperation('primetech.production-board.manage'), true);
    assert.equal(adapter.canInvoke('primetech.production-board.manage'), false);
    assert.equal(adapter.toolDescriptors().some(tool => tool.name === 'primetech.production-board.manage'), false);

    const calls = [];
    const handler = createPrimeTechProcedureHandler({
      catalog,
      projectRoot: root,
      receiptDir: path.join(root, '.agentsam', 'receipts'),
      invokeSamOperation: (operation, input) => adapter.invokeProcedureOperation(operation, input),
      isCapabilityAvailable: operation => adapter.canInvokeProcedureOperation(operation),
      authorizeProcedure: async request => {
        calls.push(request);
        return true;
      },
    });
    const capabilityAdapter = createCapabilityAdapter({
      projectRoot: root,
      samAdapter: adapter,
      handlers: { 'primetech.procedure.run': handler },
      authorizeCapability: async () => true,
    });
    assert.equal(capabilityAdapter.canInvoke('primetech.procedure.run'), true);
    assert.equal(capabilityAdapter.toolDescriptors().some(tool => tool.name === 'primetech.procedure.run'), true);
    const wrapped = await capabilityAdapter.invoke('primetech.procedure.run', {
      id: 'primetech.production-board.manage',
      version: '1.0.0',
      input: {
        action: 'create',
        title: 'Brand identity production',
        objective: 'Create and verify a complete brand identity package.',
        brief: 'A focused test board for the PrimeTech procedure runtime.',
      },
    });
    const result = wrapped.result;
    assert.equal(result.status, 'completed');
    assert.equal(result.id, 'primetech.production-board.manage');
    assert.equal(result.verification.ok, true);
    assert.equal(result.output.ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].id, 'primetech.production-board.manage');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
