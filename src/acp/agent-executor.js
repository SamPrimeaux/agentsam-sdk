import { runWithSubagentHooks } from '../../packages/agentsam-hooks/src/adapters/agents.js';

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

/**
 * Build the provider-neutral Queue Control handler for an `agent.run` job.
 *
 * ACP owns run/job identity and orchestration. The supplied `execute` function
 * owns the actual model/runtime execution. AgentSam Hooks wrap the execution
 * boundary for lifecycle policy/observability, but do not become run authority.
 */
export function createAgentRunJobHandler({
  execute,
  hookRuntime = null,
  cwd = process.cwd(),
  source = 'agentsam-acp',
} = {}) {
  if (typeof execute !== 'function') throw new TypeError('agent_run_execute_required');

  return async function handleAgentRun(job, context = {}) {
    if (!job || job.kind !== 'agent.run') {
      const error = new Error(`agent_run_job_required:${job?.kind || '<missing>'}`);
      error.code = 'agent_run_job_required';
      throw error;
    }

    const payload = object(job.payload);
    const runId = clean(payload.run_id || job.source_run_id);
    if (!runId) throw new TypeError('agent_run_id_required');

    const parentRunId = clean(payload.parent_run_id);
    const role = clean(payload.role) || 'agentsam-child';
    const objective = clean(payload.objective) || `Run child AgentSam ${runId}`;
    const runtimeRequirements = object(payload.runtime_requirements);
    const executionContext = Object.freeze({
      run_id: runId,
      parent_run_id: parentRunId || null,
      role,
      objective,
      work_item_id: clean(payload.work_item_id) || null,
      step_id: clean(payload.step_id || job.step_id) || null,
      runtime_requirements: runtimeRequirements,
      job_id: clean(job.id) || null,
      attempt: Number.isInteger(job.attempt) ? job.attempt : 0,
      metadata: object(job.metadata),
    });

    const invocation = {
      run_id: runId,
      agent_id: role,
      source: clean(context.source) || source,
      metadata: {
        parent_run_id: parentRunId || null,
        job_id: clean(job.id) || null,
        work_item_id: executionContext.work_item_id,
        step_id: executionContext.step_id,
        attempt: executionContext.attempt,
        runtime_requirements: runtimeRequirements,
      },
    };

    const executeRun = () => execute({
      job,
      runId,
      parentRunId: parentRunId || null,
      role,
      objective,
      runtimeRequirements,
      executionContext,
      invocation,
    }, context);

    // Only child AgentSam runs are subagents. Root agent.run jobs retain the
    // normal session/model/tool hook lifecycle owned by the execution host.
    if (!parentRunId) return executeRun();

    return runWithSubagentHooks({
      hookRuntime: context.hookRuntime || hookRuntime,
      agentId: role,
      task: objective,
      context: executionContext,
      invocation,
      cwd: context.cwd || cwd,
      run: executeRun,
    });
  };
}
