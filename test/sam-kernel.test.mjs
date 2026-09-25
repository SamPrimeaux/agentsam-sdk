import assert from 'node:assert/strict';
import { describe, it, before } from 'node:test';
import {
  AgentSamClient,
  defineSamOperation,
  ensureSeedOperations,
  getSamOperation,
  listSamOperations,
  SAM_EXPANSION,
  SAM_RESULT_SCHEMA,
} from '../src/sam/index.js';

describe('SAM kernel seed', () => {
  before(() => {
    ensureSeedOperations();
  });

  it('names Systematic Autonomous Machinery', () => {
    assert.equal(SAM_EXPANSION, 'Systematic Autonomous Machinery');
    assert.equal(SAM_RESULT_SCHEMA, 'agentsam.result.v1');
  });

  it('registers seed operations including planning', () => {
    const ids = listSamOperations().map((o) => o.id);
    for (const id of [
      'repository.inspect',
      'brand.scan',
      'security.scan',
      'terminal.exec',
      'cad.blender.inspect',
      'codebaseindex.ingest',
      'planning.astar',
      'planning.goap',
    ]) {
      assert.ok(ids.includes(id), `missing ${id}`);
    }
    assert.equal(getSamOperation('repository.inspect')?.execution.model, 'never');
    assert.equal(getSamOperation('planning.astar')?.execution.model, 'never');
    assert.equal(getSamOperation('codebaseindex.ingest')?.execution.model, 'optional');
  });

  it('defineSamOperation rejects incomplete defs', () => {
    assert.throws(() => defineSamOperation({ id: 'x.y', handler: () => {} }), /module and action/);
  });

  it('describe returns metadata without executing', async () => {
    const sam = new AgentSamClient();
    const info = await sam.describe('security.scan');
    assert.equal(info.ok, true);
    assert.equal(info.id, 'security.scan');
    assert.equal(info.execution.model, 'never');
    assert.equal(info.risk, 'read_only');
  });

  it('discover finds blender inspect by query', async () => {
    const sam = new AgentSamClient();
    const found = await sam.discover({ query: 'blender inspect' });
    assert.equal(found.ok, true);
    assert.ok(found.operations.some((c) => c.id === 'cad.blender.inspect'));
  });

  it('invoke repository.inspect returns SamResult envelope', async () => {
    const sam = new AgentSamClient({ cwd: process.cwd() });
    const result = await sam.invoke('repository.inspect', { root: process.cwd() });
    assert.equal(result.schema, SAM_RESULT_SCHEMA);
    assert.equal(result.operation, 'repository.inspect');
    assert.equal(result.ok, true);
    assert.ok(result.receipt?.id?.startsWith('samr_'));
    assert.equal(result.receipt.execution.model_used, false);
    assert.equal(result.receipt.execution.deterministic, true);
    assert.ok(result.data?.snapshot || result.data?.merkle_root);
  });

  it('domain projection matches invoke', async () => {
    const sam = new AgentSamClient();
    const viaModule = await sam.security.scan({ root: process.cwd(), offline: true });
    assert.equal(viaModule.ok, true);
    assert.equal(viaModule.operation, 'security.scan');
    assert.equal(viaModule.data?.scanner, 'agentsam-sca');
  });

  it('invoke unknown operation fails cleanly', async () => {
    const sam = new AgentSamClient();
    const result = await sam.invoke('no.such.op', {});
    assert.equal(result.ok, false);
    assert.equal(result.error?.code, 'sam_operation_not_found');
  });

  it('terminal.exec via invoke', async () => {
    const sam = new AgentSamClient();
    const result = await sam.invoke('terminal.exec', {
      command: 'node',
      args: ['-e', 'process.stdout.write("ok")'],
      cwd: process.cwd(),
    });
    assert.equal(result.ok, true);
    assert.match(String(result.data?.stdout || ''), /ok/);
  });
});
