import type {
  AgentToolPermissionDecision,
  AgentToolPermissionRequest,
  AgentToolRiskLevel,
  AgentToolSideEffectLevel,
} from '@inneranimalmedia/agentsam-contracts';
import {
  invokeStudioService,
  isPackagedDesktop,
  resolveDesktopStudioAccountId,
} from '@/lib/desktop/tauri';

const SESSION_APPROVALS = new Set<string>();

export type PluginToolExecutionInput = {
  toolKey: string;
  arguments?: Record<string, unknown>;
  displayName?: string;
  provider?: string;
  summary?: string;
  scope?: string;
  sharedData?: Array<{ label: string; value: string }>;
  riskLevel?: AgentToolRiskLevel;
  sideEffectLevel?: AgentToolSideEffectLevel;
  destructive?: boolean;
  openWorld?: boolean;
  agentRunId?: string | null;
  conversationId?: string | null;
  callIndex?: number;
};

export type PluginToolPermissionRequester = (
  request: AgentToolPermissionRequest,
) => Promise<AgentToolPermissionDecision>;

export class PluginToolExecutionError extends Error {
  status: number;
  payload: unknown;

  constructor(status: number, message: string, payload: unknown) {
    super(message);
    this.name = 'PluginToolExecutionError';
    this.status = status;
    this.payload = payload;
  }
}

function parseJson(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

function permissionId(toolKey: string) {
  const suffix =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return 'tool-permission-' + toolKey.replace(/[^a-z0-9_-]+/gi, '-') + '-' + suffix;
}

function permissionKey(input: PluginToolExecutionInput) {
  return (input.provider || 'plugin') + ':' + input.toolKey;
}

function permissionRequest(input: PluginToolExecutionInput): AgentToolPermissionRequest {
  return {
    id: permissionId(input.toolKey),
    toolKey: input.toolKey,
    displayName: input.displayName || input.toolKey,
    provider: input.provider,
    summary: input.summary,
    scope: input.scope,
    sharedData: input.sharedData,
    riskLevel: input.riskLevel,
    sideEffectLevel: input.sideEffectLevel,
    destructive: input.destructive,
    openWorld: input.openWorld,
  };
}

function approvalRequired(status: number, payload: unknown) {
  if (status !== 409 || !payload || typeof payload !== 'object') return false;
  const code = String((payload as { error?: unknown }).error || '');
  return code === 'AGENTSAM_TOOL_NOT_APPROVED' || code.includes('tool_not_approved');
}

async function callTool(input: PluginToolExecutionInput, approved: boolean) {
  const body = {
    tool_key: input.toolKey,
    arguments: input.arguments || {},
    approved,
    agent_run_id: input.agentRunId || null,
    conversation_id: input.conversationId || null,
    call_index: input.callIndex,
  };

  if (isPackagedDesktop()) {
    const accountId = await resolveDesktopStudioAccountId();
    const response = await invokeStudioService({
      operation: 'plugins',
      account_id: accountId,
      method: 'POST',
      path: '/api/plugins/tools/execute',
      body,
    });
    return {
      ok: response.ok,
      status: response.status,
      payload: parseJson(response.body),
    };
  }

  const response = await fetch('/api/plugins/tools/execute', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return {
    ok: response.ok,
    status: response.status,
    payload: parseJson(await response.text()),
  };
}

export async function executePluginTool(
  input: PluginToolExecutionInput,
  requestPermission: PluginToolPermissionRequester,
): Promise<unknown> {
  const toolKey = String(input.toolKey || '').trim();
  if (!toolKey) throw new Error('plugin_tool_key_required');
  const normalized = { ...input, toolKey };
  const key = permissionKey(normalized);
  let approved = SESSION_APPROVALS.has(key);

  let response = await callTool(normalized, approved);
  if (approvalRequired(response.status, response.payload)) {
    const decision = await requestPermission(permissionRequest(normalized));
    if (decision === 'deny') {
      throw new PluginToolExecutionError(
        403,
        'tool_permission_denied:' + toolKey,
        { error: 'tool_permission_denied', tool_key: toolKey },
      );
    }
    if (decision === 'allow_session') {
      SESSION_APPROVALS.add(key);
    }
    approved = true;
    response = await callTool(normalized, approved);
  }

  if (!response.ok) {
    const body =
      response.payload && typeof response.payload === 'object'
        ? (response.payload as { error?: unknown })
        : null;
    throw new PluginToolExecutionError(
      response.status,
      String(body?.error || 'plugin_tool_execution_failed'),
      response.payload,
    );
  }

  const body =
    response.payload && typeof response.payload === 'object'
      ? (response.payload as { result?: unknown })
      : null;
  return body?.result;
}

export function clearPluginToolSessionApprovals() {
  SESSION_APPROVALS.clear();
}
