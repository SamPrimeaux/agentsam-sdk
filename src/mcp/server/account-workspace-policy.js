// D1-backed host policy for optional MCP workspace reads. This module has no
// filesystem or credential access. The authenticated native host must supply
// a current device grant; database preferences alone never grant a folder.
const READ_TOOLS = Object.freeze({
  'workspace.read': 'fs_read_file',
  'workspace.stat': 'fs_get_file_info',
  'workspace.list': 'workspace_list_files',
});
const deny = reason => ({ allowed: false, reason });
const riskRank = { low: 0, medium: 1, high: 2, critical: 3 };

export function createAccountWorkspaceAuthorizer({ db, accountId, workspaceId, connectionId, resolveDeviceGrant }) {
  if (!db?.prepare || !accountId || !workspaceId || !connectionId || typeof resolveDeviceGrant !== 'function') {
    throw new Error('mcp_account_workspace_context_required');
  }
  return async ({ principal, operation, input }) => {
    const toolKey = READ_TOOLS[operation];
    if (!toolKey || principal?.kind === 'public' || principal?.account_id !== accountId) return deny('mcp_account_scope_denied');
    try {
      const [account, connection, blocked, policies, grants, tools] = await Promise.all([
        db.prepare("SELECT id FROM accounts WHERE id=? AND status='active'").bind(accountId).first(),
        db.prepare("SELECT id FROM terminal_connections WHERE id=? AND account_id=? AND is_active=1").bind(connectionId,accountId).first(),
        db.prepare("SELECT workspace_id FROM agentsam_workspace_blocklist WHERE workspace_id=? AND owner_user_id=?").bind(workspaceId,accountId).first(),
        db.prepare("SELECT workspace_id,require_allowlist_for_mcp,mcp_tools_protection,external_file_protection,tool_risk_level_max FROM agentsam_user_policy WHERE user_id=? AND workspace_id IN ('',?)").bind(accountId,workspaceId).all(),
        db.prepare("SELECT is_allowed,requires_approval,agent_id,max_calls_per_day,risk_level_override FROM agentsam_mcp_allowlist WHERE user_id=? AND workspace_id IN ('',?) AND tool_key=?").bind(accountId,workspaceId,toolKey).all(),
        db.prepare("SELECT t.id,t.risk_level,t.requires_approval,t.requires_confirmation,t.max_calls_per_session,p.risk_level AS policy_risk,p.requires_approval AS policy_approval,p.requires_confirmation AS policy_confirmation,p.max_calls_per_session AS policy_max FROM agentsam_tools t LEFT JOIN agentsam_tool_policy p ON p.tool_id=t.id WHERE t.tool_key=? AND t.is_active=1 AND (t.account_id IS NULL OR t.account_id=?)").bind(toolKey,accountId).all(),
      ]);
      if (!account || !connection || blocked) return deny('mcp_workspace_context_denied');
      const policy = policies.results || [];
      const allow = grants.results || [];
      const registered = tools.results || [];
      // Explicit account policy and an unambiguous active registration required.
      // Until the host wires quotas/approval, deny operations subject to them.
      if (!policy.length || registered.length !== 1) return deny('mcp_policy_unavailable');
      if (!allow.some(g => g.is_allowed === 1 && !g.agent_id) || allow.some(g => g.is_allowed !== 1 || g.requires_approval === 1 || g.max_calls_per_day != null)) return deny('mcp_allowlist_denied');
      const tool = registered[0];
      const risks = [tool.risk_level,tool.policy_risk,...allow.map(g=>g.risk_level_override)].filter(Boolean);
      if (!risks.length || risks.some(r => !Object.hasOwn(riskRank,r)) || policy.some(p => !Object.hasOwn(riskRank,p.tool_risk_level_max) || risks.some(r => riskRank[r] > riskRank[p.tool_risk_level_max]))) return deny('mcp_risk_denied');
      if (tool.requires_approval || tool.requires_confirmation || tool.policy_approval || tool.policy_confirmation || tool.max_calls_per_session != null || tool.policy_max != null) return deny('mcp_approval_or_quota_required');
      // The device grant resolver is responsible for checking workspace membership
      // and the current OS/FSA handle. It receives authenticated, fixed context.
      const grant = await resolveDeviceGrant({ accountId, workspaceId, connectionId, operation, input });
      if (grant?.allowed !== true || grant.accountId !== accountId || grant.workspaceId !== workspaceId || grant.connectionId !== connectionId || typeof grant.root !== 'string' || !grant.root) return deny('mcp_device_grant_required');
      return { allowed: true, root: grant.root };
    } catch { return deny('mcp_policy_unavailable'); }
  };
}
