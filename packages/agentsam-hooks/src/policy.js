export class HookPermissionError extends Error {
  constructor(kind, name, decision = {}) {
    const reason = decision.permission_decision_reason || `Hook policy ${decision.permission_decision || 'denied'} ${kind} '${name}'`;
    super(reason);
    this.name = 'HookPermissionError';
    this.code = decision.permission_decision === 'ask'
      ? 'AGENTSAM_HOOK_APPROVAL_REQUIRED'
      : 'AGENTSAM_HOOK_PERMISSION_DENIED';
    this.kind = kind;
    this.target = name;
    this.decision = decision.permission_decision || 'deny';
  }
}

export async function resolveHookPermission({ output = {}, kind, name, requestPermission, envelope }) {
  const decision = output.permission_decision;
  if (!decision || decision === 'allow') return true;
  if (decision === 'deny') throw new HookPermissionError(kind, name, output);
  if (typeof requestPermission !== 'function') throw new HookPermissionError(kind, name, output);
  const result = await requestPermission({
    kind,
    name,
    reason: output.permission_decision_reason || null,
    envelope,
  });
  const responseDecision = typeof result === 'string' ? result : (result?.decision || result?.kind);
  const approved = result === true || result?.allowed === true || ['allow', 'approve', 'approve_once', 'approve-once', 'approve_always', 'approve-always'].includes(responseDecision);
  if (!approved) throw new HookPermissionError(kind, name, {
    ...output,
    permission_decision: 'deny',
    permission_decision_reason: result?.reason || output.permission_decision_reason || `Approval was not granted for ${kind} '${name}'`,
  });
  return true;
}
