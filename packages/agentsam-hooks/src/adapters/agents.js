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
      await hooks.dispatch('subagent_start', {
        agent_id: agent.id,
        task,
        context: input.context || {},
      }, agentInvocation, { cwd: context.cwd || options.cwd });
      try {
        const result = await options.runAgent({
          agent,
          task,
          context: input.context || {},
          parent: context,
          invocation: agentInvocation,
        });
        await hooks.dispatch('subagent_stop', {
          agent_id: agent.id,
          task,
          status: 'completed',
          result,
        }, agentInvocation, { cwd: context.cwd || options.cwd });
        return result;
      } catch (error) {
        await hooks.dispatch('subagent_stop', {
          agent_id: agent.id,
          task,
          status: 'failed',
          error: { code: error?.code || null, message: String(error?.message || error) },
        }, agentInvocation, { cwd: context.cwd || options.cwd });
        throw error;
      }
    },
  });
}
