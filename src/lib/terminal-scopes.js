/**
 * AgentSam API credential terminal scopes (CLI/whoami).
 * Legacy terminal scope strings. The agentsam_capabilities registry is the authority.
 */

export const TERMINAL_SCOPES = Object.freeze({
  LOCAL: 'terminal:exec:local',
  REMOTE: 'terminal:exec:remote',
  SANDBOX: 'terminal:exec:sandbox',
  ENROLL: 'terminal:enroll',
  EXEC_ALL: 'terminal:exec:*',
});

export const ALL_TERMINAL_SCOPES = Object.freeze(Object.values(TERMINAL_SCOPES));

export function normalizeScopeList(scopes) {
  if (!Array.isArray(scopes)) return [];
  return scopes.map((s) => String(s || '').trim()).filter(Boolean);
}

export function credentialHasScope(scopes, required) {
  const need = String(required || '').trim();
  if (!need) return false;
  const set = new Set(normalizeScopeList(scopes));
  if (set.has(need) || set.has('*')) return true;
  if (set.has('terminal.*') && need.startsWith('terminal')) return true;
  if (need.startsWith('terminal:exec:') && set.has('terminal.execute')) return true;
  if (need === TERMINAL_SCOPES.ENROLL && set.has('terminal.manage')) return true;
  if (need.startsWith('terminal:exec:') && need !== TERMINAL_SCOPES.EXEC_ALL && set.has(TERMINAL_SCOPES.EXEC_ALL)) {
    return true;
  }
  return false;
}

export function projectTerminalCapability(scopes = []) {
  const list = normalizeScopeList(scopes);
  const local = credentialHasScope(list, TERMINAL_SCOPES.LOCAL);
  const remote = credentialHasScope(list, TERMINAL_SCOPES.REMOTE);
  const sandbox = credentialHasScope(list, TERMINAL_SCOPES.SANDBOX);
  const enroll = credentialHasScope(list, TERMINAL_SCOPES.ENROLL);
  const available = local || remote || sandbox || enroll;
  return {
    available,
    scopes: list.filter((s) => s.startsWith('terminal:')),
    lanes: {
      local,
      remote,
      sandbox,
      enroll,
    },
    next: available
      ? null
      : 'agentsam api-key create --name terminal --scopes terminal:exec:local,terminal:exec:remote,terminal:exec:sandbox,terminal:enroll --store keychain --activate',
  };
}
