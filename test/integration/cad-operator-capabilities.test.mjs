import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AgentSamClient } from '../../src/sam/client.js';
import { createSamOS } from '../../src/sam/os.js';
import { createCadOperations, CAD_DONOR_OPERATOR_MAPPINGS } from '../../src/sam/packs/cad/index.js';
import { createCadHttpPorts } from '../../src/sam/packs/cad/http-ports.js';

const actor = { actorId: 'editor1', accountId: 'account1', tenantId: 'tenant1' };
function ports(config = {}) {
  const records = { calls: [], approvals: [] };
  const context = {
    resolveTrustedContext: async () => actor,
    authorize: async ({ projectId }) => projectId !== 'other_account',
    requestApproval: async ({ action }) => {
      records.approvals.push(action);
      return config.approve !== false;
    },
    projectTools: {
      execute: async (name, args, scope) => {
        records.calls.push({ name, args, scope });
        return { ok: true, tool: name, revision: args.expected_revision ?? 2 };
      },
    },
    jobs: {
      submit: async (args, scope) => {
        records.calls.push({ action: 'submit', args, scope });
        return { job_id: 'job_1', status: 'script_ready', engine: args.engine };
      },
      get: async (args, scope) => {
        records.calls.push({ action: 'get', args, scope });
        return { job: { id: args.job_id, status: 'script_ready' } };
      },
      execute: async (args, scope) => {
        records.calls.push({ action: 'execute', args, scope });
        return { job_id: args.job_id, status: 'running', dispatch: 'container' };
      },
    },
  };
  return { records, sam: new AgentSamClient({ autoSeed: false, os: createSamOS({ core: false, cad: context }) }) };
}

describe('CAD operator pack — host owned, no scripts typed by users', () => {
  it('refuses to register without trusted host authorization and execution', () => {
    assert.throws(() => createCadOperations(), /host_adapter_required/);
    assert.throws(() => createCadOperations({ jobs: {} }), /trusted_authorization/);
    assert.throws(() => createCadOperations({
      jobs: {}, resolveTrustedContext: async () => actor, authorize: async () => true,
      requestApproval: async () => true,
    }), /job_executor_required/);
    assert.equal(createSamOS({ core: false }).list().length, 0);
  });

  it('advertises only real bound handlers and maps donor operators without duplicating UI', () => {
    const { sam } = ports();
    const ids = sam.os.list().map(op => op.id);
    for (const id of ['cad.project.get', 'cad.project.apply', 'cad.project.restore',
      'cad.model.export', 'cad.job.generate', 'cad.job.status', 'cad.job.execute']) {
      const op = sam.os.get(id);
      assert.equal(typeof op?.handler, 'function');
      assert.ok(op.input_schema);
    }
    assert.equal(ids.length, 12);
    assert.deepEqual(CAD_DONOR_OPERATOR_MAPPINGS.generateFreeCAD, {
      operation: 'cad.job.generate', engine: 'freecad',
    });
    assert.deepEqual(CAD_DONOR_OPERATOR_MAPPINGS.exportGLB, {
      operation: 'cad.model.export', format: 'glb',
    });
    assert.equal(CAD_DONOR_OPERATOR_MAPPINGS.meshyRig.existing_tool, 'meshy_rig');
    assert.equal(CAD_DONOR_OPERATOR_MAPPINGS.addCube.viewport_only, true);
  });

  it('executes the canonical CAD project tool and enforces revisioned approval for edits', async () => {
    const { sam, records } = ports();
    const get = await sam.invoke('cad.project.get', { project_id: 'p1' });
    assert.equal(get.ok, true);
    assert.equal(get.data.tool, 'design_project_get');
    assert.equal(records.calls[0].scope.principal, actor);
    const edit = await sam.invoke('cad.project.apply', {
      project_id: 'p1', expected_revision: 2,
      operation: { type: 'move_wall', wall_id: 'w1', dx: 5 },
    });
    assert.equal(edit.ok, true);
    assert.equal(edit.data.tool, 'design_apply_operation');
    assert.deepEqual(records.approvals, ['design_apply_operation']);
    const exportResult = await sam.invoke('cad.model.export', {
      project_id: 'p1', revision: 3, format: 'glb',
    });
    assert.equal(exportResult.ok, true);
    assert.equal(records.calls.at(-1).name, 'design_model_export');
    assert.ok(records.approvals.includes('design_model_export'));
  });

  it('denies unauthorized projects and rejected write approvals before reaching an executor', async () => {
    const { sam, records } = ports({ approve: false });
    const denied = await sam.invoke('cad.project.get', { project_id: 'other_account' });
    assert.equal(denied.ok, false);
    const rejected = await sam.invoke('cad.job.generate', {
      project_id: 'p1', workspace_id: 'w1', engine: 'freecad', prompt: 'Create a small architectural window frame',
    });
    assert.equal(rejected.ok, false);
    assert.equal(records.calls.length, 0);
    assert.deepEqual(records.approvals, ['job.generate']);
  });

  it('generates, polls and executes existing CAD jobs as separate authorized stages', async () => {
    const { sam, records } = ports();
    const generated = await sam.invoke('cad.job.generate', {
      project_id: 'p1', workspace_id: 'w1', engine: 'freecad',
      prompt: 'Build a parametric structural detail from my BIM project',
    });
    assert.equal(generated.ok, true);
    assert.equal(generated.data.job_id, 'job_1');
    assert.equal(generated.data.status, 'script_ready');
    assert.equal(records.calls[0].args.engine, 'freecad');
    const status = await sam.invoke('cad.job.status', { project_id: 'p1', job_id: 'job_1' });
    assert.equal(status.ok, true);
    const started = await sam.invoke('cad.job.execute', { project_id: 'p1', workspace_id: 'w1', job_id: 'job_1' });
    assert.equal(started.ok, true);
    assert.equal(started.data.dispatch, 'container');
    assert.deepEqual(records.approvals, ['job.generate', 'job.execute']);
    assert.deepEqual(records.calls.map(c => c.action), ['submit', 'get', 'execute']);
  });


  it('is model-discoverable through the existing SAM capability adapter and hooks', async () => {
    const { createCadModelTools } = await import('../../src/sam/packs/cad/model-tools.js');
    const { createHookRuntime } = await import('../../packages/agentsam-hooks/src/runtime.js');
    const records = { calls: 0, toolEvents: [] };
    const hookRuntime = createHookRuntime({ hooks: {
      pre_tool_use: { id: 'cad-policy', handler: ({input}) => {
        records.toolEvents.push(input.tool_name);
        return { permission_decision: 'allow' };
      } },
    } });
    const cad = {
      projectTools: { execute: async (name) => { records.calls++; return { tool: name, valid: true }; } },
      resolveTrustedContext: async () => actor,
      authorize: async () => true,
      requestApproval: async () => true,
    };
    const adapter = createCadModelTools({ cad, modelAuthorize: async () => true, hookRuntime });
    const catalog = adapter.toolDescriptors();
    assert.ok(catalog.some(tool => tool.name === 'cad.project.get' && tool.input_schema?.type === 'object'));
    assert.ok(!catalog.some(tool => tool.name === 'terminal.exec'));
    const result = await adapter.invoke('cad.project.get', { project_id: 'p1' });
    assert.equal(result.ok, true);
    assert.equal(records.calls, 1);
    assert.deepEqual(records.toolEvents, ['cad.project.get']);
    const denied = createCadModelTools({ cad, modelAuthorize: async () => false });
    const blocked = await denied.invoke('cad.project.get', { project_id: 'p1' });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.error, 'sam_tool_not_authorized');
    const reduced = createCadModelTools({ cad, modelAuthorize: async () => true, expose: ['cad.project.get'] });
    assert.deepEqual(reduced.toolDescriptors().map(t => t.name), ['cad.project.get']);
    assert.throws(() => createCadModelTools({cad}), /model_tool_authorization_required/);
  });

  it('rejects arbitrary CAD engine names before touching any host', async () => {
    const { sam, records } = ports();
    const result = await sam.invoke('cad.job.generate', {
      project_id: 'p1', workspace_id: 'w1', engine: 'shell',
      prompt: 'Generate a model',
    });
    assert.equal(result.ok, false);
    assert.equal(records.calls.length, 0);
  });

  it('uses existing host HTTP endpoints and refuses false success from stub workers', async () => {
    const requests = [];
    const request = async (path, opts, principal) => {
      requests.push({ path, opts, principal });
      if (path.includes('/execute')) {
        return new Response(JSON.stringify({ job_id: 'job_1', status: 'running' }), {
          status: 200, headers: { 'content-type': 'application/json' },
        });
      }
      if (path === '/api/cad/freecad/script') {
        return new Response(JSON.stringify({ job_id: 'job_1', status: 'script_ready' }), {
          status: 200, headers: { 'content-type': 'application/json' },
        });
      }
      if (path === '/api/cad/jobs/job_1') {
        return new Response(JSON.stringify({ job: { id: 'job_1', status: 'script_ready' } }), {
          status: 200, headers: { 'content-type': 'application/json' },
        });
      }
      if (path.includes('project/tools')) {
        return new Response(JSON.stringify({ ok: true, result: { revision: 4 } }), {
          status: 200, headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ error: 'cad_host_required' }), {
        status: 501, headers: { 'content-type': 'application/json' },
      });
    };
    const bound = createCadHttpPorts({ request });
    const scope = { principal: actor };
    const generated = await bound.jobs.submit({
      project_id: 'p1', workspace_id: 'w1', engine: 'freecad', prompt: 'frame',
    }, scope);
    assert.equal(generated.job_id, 'job_1');
    assert.equal((await bound.jobs.get({ job_id: 'job_1' }, scope)).job.status, 'script_ready');
    assert.equal((await bound.jobs.execute({ job_id: 'job_1', project_id: 'p1' }, scope)).status, 'running');
    assert.equal((await bound.projectTools.execute('design_project_get', { project_id: 'p1' }, scope)).revision, 4);
    assert.equal(requests[0].path, '/api/cad/freecad/script');
    assert.equal(requests[0].principal, actor);
    assert.equal(requests[0].opts.headers['content-type'], 'application/json');
    assert.throws(() => createCadHttpPorts(), /authenticated_request_required/);
    await assert.rejects(bound.jobs.submit({ engine: 'other' }, scope), /invalid_engine/);
    await assert.rejects(bound.projectTools.execute('terminal.exec', {}, scope), /unrecognized_project_tool/);
    await assert.rejects(bound.jobs.submit({ engine: 'blender' }, scope), /cad_host_required/);
  });
});
