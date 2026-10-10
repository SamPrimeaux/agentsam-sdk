/**
 * Model-facing projection of an actual isolated SAM OS.
 * No handler/source/D1 row gets advertised without registration and an explicit
 * host allowlist. Authorize every invocation against trusted host identity.
 */
import { AgentSamClient } from './client.js';

export function createSamCapabilityAdapter({ os, expose = [], authorize, client = null } = {}) {
  if (!os?.list || !os?.get || typeof authorize !== 'function') {
    throw new TypeError('sam_model_adapter_requires_os_and_authorization');
  }
  const allow = new Set(expose);
  const sam = client || new AgentSamClient({ os });
  return Object.freeze({
    runtimeStatus: () => os.status(),
    toolDescriptors({ includeUnavailable = false } = {}) {
      // Only genuinely installed operations with a JSON Schema are model-visible.
      // No guessing schemas or exposing terminal privileges by default.
      return os.list().filter(op => allow.has(op.id) && op.model_visible !== false).filter(op =>
        op.input_schema && typeof op.input_schema === 'object' && op.input_schema.type === 'object'
      ).map(op => ({
        name: op.id, description: op.description || op.summary,
        category: op.module, risk: op.risk,
        input_schema: structuredClone(op.input_schema),
        strict: op.input_schema.additionalProperties === false,
        side_effects: op.execution.sideEffects,
        deterministic: op.execution.model === 'never',
        model_required: false,
      }));
    },
    canInvoke(id) {
      const op = os.get(id);
      return !!op && allow.has(id) && op.model_visible !== false && !!op.input_schema && typeof op.input_schema === 'object';
    },
    async invoke(id, input = {}) {
      if (!this.canInvoke(id)) return { ok:false, error:'sam_tool_unavailable', operation:id };
      if (await authorize({ operation:id, input, risk:os.get(id).risk }) !== true) {
        return { ok:false, error:'sam_tool_not_authorized', operation:id };
      }
      return sam.invoke(id, input);
    },
  });
}
