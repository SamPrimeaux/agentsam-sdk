/**
 * Local stdio interop is an explicit, operation-owned contract.
 *
 * No operation becomes callable merely because it is registered or claims to
 * be read-only. Host-scoped, process-running, network and write operations
 * must use the existing authenticated host capability transport instead.
 */
export function stdioMode(operation) {
  if (!operation || typeof operation.handler !== 'function' ||
      operation.status !== 'stable' || operation.risk !== 'read_only') return null;
  const exec = operation.execution;
  if (!exec || exec.sideEffects !== 'none' || !exec.lanes?.includes('local') ||
      operation.authority?.length || operation.auth?.account ||
      operation.auth?.provider?.length) return null;

  const mode = operation.interop?.stdio;
  if (mode === 'pure' || mode === 'workspace_read') {
    if (exec.model !== 'never' || exec.network !== 'none' ||
        exec.provider_spend !== 'never') return null;
    // Workspace-scoped reads must also have a closed input schema.
    if (mode === 'workspace_read' &&
        (operation.input_schema?.type !== 'object' ||
         operation.input_schema.additionalProperties !== false)) return null;
    return mode;
  }
  // This isolated SAM OS has no model/provider binding. Only the built-in,
  // deterministic/heuristic decision path may be requested over stdio.
  if (mode === 'decision' && exec.model === 'optional' &&
      exec.network === 'optional' && exec.provider_spend === 'optional') {
    return mode;
  }
  return null;
}

export function assertLocalDecisionInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('sam_bridge_invalid_input');
  if (Object.hasOwn(input, 'evaluators') || Object.hasOwn(input, 'activity') ||
      Object.hasOwn(input, 'model') || Object.hasOwn(input, 'provider'))
    throw new Error('sam_bridge_decision_evaluator_not_allowed');
  const questions = Array.isArray(input.questions)
    ? input.questions
    : input.questions && typeof input.questions === 'object'
      ? Object.values(input.questions)
      : [];
  if (questions.some(q => q && typeof q === 'object' &&
      (q.evaluator_hint === 'semantic' || q.evaluator === 'semantic')))
    throw new Error('sam_bridge_decision_semantic_not_allowed');
  return input;
}
