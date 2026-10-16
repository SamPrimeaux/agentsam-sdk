import { createSamOS } from '../../os.js';
import { createSamCapabilityAdapter } from '../../model-adapter.js';
import { createHookedCapabilityAdapter } from '../../../../packages/agentsam-hooks/src/adapters/capability.js';

/**
 * Install the real CAD operations into AgentSam's *existing* model tool loop.
 * No second mini-agent, no client-side job credentials, no duplicate compiler.
 * The host supplies trusted CAD ports, model-tool authorization, and optional
 * existing AgentSam Hooks runtime.
 */
export function createCadModelTools({
  cad, modelAuthorize, hookRuntime = null, requestPermission = undefined, invocation = {},
  expose = null,
} = {}) {
  if (typeof modelAuthorize !== 'function') throw new Error('sam_cad_model_tool_authorization_required');
  const os = createSamOS({ core: false, cad });
  const allowed = expose ?? os.list().map(op => op.id);
  const adapter = createSamCapabilityAdapter({ os, expose: allowed, authorize: modelAuthorize });
  return hookRuntime
    ? createHookedCapabilityAdapter(adapter, { hookRuntime, requestPermission, invocation })
    : adapter;
}
