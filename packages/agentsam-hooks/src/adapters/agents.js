import { ensureHookRuntime } from '../runtime.js';

function normalizeAgent(value) {
  const source = typeof value === 'string' ? { id: value } : value;
  const id = String(source?.id || source?.name || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(id)) throw new Error(`invalid_agent_id:${id || '<missing>'}`);
  return Object.freeze({
    id,
    description: String(source.description || `Delegate bounded work to the ${id} agent.`),
    metadata: source.metadata && typeof source.metadata === 'object' ? structuredClone(source.metadata) : {},
  });
}

export async function runWithSubagentHooks(options = {}) {
  if (typeof options.run !== 'function') throw new TypeError('subagent_run_required');
  const agentId = String(options.agentId || options.agent_id || '').trim();
  if (!agentId) throw new TypeError('subagent_agent_id_required');
  const task = String(options.task || '').trim();
  if (!task) throw new TypeError('subagent_task_required');

  const hooks = ensureHookRuntime(options.hooks || options.hookRuntime);
  const context = options.context && typeof options.context === 'object' ? options.context : {};
  const invocation = {
    ...(options.invocation || {}),
    agent_id: agentId,
  };

  await hooks.dispatch('subagent_start', {
    agent_id: agentId,
    task,
    context,
  }, invocation, { cwd: options.cwd });

  try {
    const result = await options.run({ task, context, invocation });
    await hooks.dispatch('subagent_stop', {
      agent_id: agentId,
      task,
      status: 'completed',
      result,
    }, invocation, { cwd: options.cwd });
    return result;
  } catch (error) {
    await hooks.dispatch('subagent_stop', {
      agent_id: agentId,
      task,
      status: 'failed',
      error: { code: error?.code || null, message: String(error?.message || error) },
    }, invocation, { cwd: options.cwd });
    throw error;
  }
}

export function createAgentCapabilityAdapter(options = {}) {
  if (typeof options.runAgent !== 'function') throw new TypeError('run_agent_adapter_required');
  const agents = (options.agents || []).map(normalizeAgent);
  const hooks = ensureHookRuntime(options.hooks || options.hookRuntime);
  const byCapability = new Map(agents.map((agent) => [`agent.delegate.${agent.id}`, agent]));
  const parentInvocation = options.invocation || {};

  return Object.freeze({
    toolDescriptors() {
      return [...byCapability].map(([name, agent]) => Object.freeze({
        name,
        description: agent.description,
        category: 'agents',
        risk: 'write',
        strict: false,
        input_schema: {
          type: 'object',
          properties: {
            task: { type: 'string', minLength: 1, description: 'Bounded objective delegated to the sub-agent.' },
            context: { type: 'object', description: 'Portable context references or structured evidence for the task.' },
          },
          required: ['task'],
          additionalProperties: false,
        },
      }));
    },
    canInvoke(id) { return byCapability.has(String(id)); },
    async invoke(id, input = {}, context = {}) {
      const agent = byCapability.get(String(id));
      if (!agent) throw new Error(`agent_capability_unavailable:${id}`);
      const task = String(input.task || '').trim();
      if (!task) throw new TypeError('subagent_task_required');
      const agentInvocation = {
        ...parentInvocation,
        parent_agent_id: parentInvocation.agent_id || null,
        agent_id: agent.id,
      };
      return runWithSubagentHooks({
        hookRuntime: hooks,
        agentId: agent.id,
        task,
        context: input.context || {},
        invocation: agentInvocation,
        cwd: context.cwd || options.cwd,
        run: () => options.runAgent({
          agent,
          task,
          context: input.context || {},
          parent: context,
          invocation: agentInvocation,
        }),
      });
    },
  });
}
