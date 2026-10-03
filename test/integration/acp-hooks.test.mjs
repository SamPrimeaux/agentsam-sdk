import assert from 'node:assert/strict';
import test from 'node:test';
import { createHookRuntime } from '../../packages/agentsam-hooks/src/runtime.js';
import { createJobEnvelope } from '../../packages/agentsam-queue-control/src/contracts.js';
import { createAgentRunJobHandler } from '../../src/acp/agent-executor.js';

function childJob(overrides = {}) {
  return createJobEnvelope({
    id: 'job_agent_run_arun_child',
    account_id: 'acct_1',
    kind: 'agent.run',
    logical_queue: 'jobs',
    source_run_id: 'arun_child',
    step_id: 'step_backend',
    idempotency_key: 'agent-run:arun_child',
    payload: {
      run_id: 'arun_child',
      parent_run_id: 'arun_parent',
      objective: 'Implement the backend slice',
      role: 'backend',
      work_item_id: 'work_backend',
      step_id: 'step_backend',
      runtime_requirements: { capabilities: ['exec', 'filesystem'] },
    },
    ...overrides,
  });
}

test('ACP agent.run execution reuses AgentSam subagent lifecycle hooks without making hooks run authority', async () => {
  const seen = [];
  const hooks = createHookRuntime({
    hooks: {
      subagent_start: ({ input, invocation }) => {
        seen.push({
          event: 'start',
          agent: input.agent_id,
          run: invocation.run_id,
          parent: invocation.metadata?.parent_run_id,
        });
      },
      subagent_stop: ({ input, invocation }) => {
        seen.push({
          event: 'stop',
          status: input.status,
          run: invocation.run_id,
        });
      },
    },
  });

  const handler = createAgentRunJobHandler({
    hookRuntime: hooks,
    execute: async ({ runId, parentRunId, role, objective, runtimeRequirements }) => ({
      run_id: runId,
      parent_run_id: parentRunId,
      role,
      objective,
      capabilities: runtimeRequirements.capabilities,
    }),
  });

  const result = await handler(childJob());

  assert.equal(result.run_id, 'arun_child');
  assert.equal(result.parent_run_id, 'arun_parent');
  assert.deepEqual(result.capabilities, ['exec', 'filesystem']);
  assert.deepEqual(seen, [
    { event: 'start', agent: 'backend', run: 'arun_child', parent: 'arun_parent' },
    { event: 'stop', status: 'completed', run: 'arun_child' },
  ]);
});

test('ACP agent.run execution emits subagent_stop failed while preserving the execution error', async () => {
  const seen = [];
  const hooks = createHookRuntime({
    hooks: {
      subagent_start: ({ invocation }) => seen.push(['start', invocation.run_id]),
      subagent_stop: ({ input, invocation }) => seen.push(['stop', input.status, invocation.run_id, input.error?.code]),
    },
  });

  const handler = createAgentRunJobHandler({
    hookRuntime: hooks,
    execute: async () => {
      const error = new Error('provider exploded');
      error.code = 'provider_unavailable';
      throw error;
    },
  });

  await assert.rejects(handler(childJob()), (error) => {
    assert.equal(error.code, 'provider_unavailable');
    return true;
  });
  assert.deepEqual(seen, [
    ['start', 'arun_child'],
    ['stop', 'failed', 'arun_child', 'provider_unavailable'],
  ]);
});

test('root agent.run jobs do not masquerade as subagent lifecycle events', async () => {
  const seen = [];
  const hooks = createHookRuntime({ hooks: {
    subagent_start: () => seen.push('start'),
    subagent_stop: () => seen.push('stop'),
  } });
  const handler = createAgentRunJobHandler({
    hookRuntime: hooks,
    execute: async ({ runId, parentRunId }) => ({ runId, parentRunId }),
  });
  const job = createJobEnvelope({
    id: 'job_agent_run_root',
    account_id: 'acct_1',
    kind: 'agent.run',
    source_run_id: 'arun_root',
    payload: { run_id: 'arun_root', objective: 'Run the root objective', role: 'lead' },
  });
  const result = await handler(job);
  assert.equal(result.runId, 'arun_root');
  assert.equal(result.parentRunId, null);
  assert.deepEqual(seen, []);
});
