import { getTauriInvoke } from '@/lib/desktop/tauri';
import type { AutoRagWorkflowHost, AutoRagWorkflowView, AutoRagExecutionReceipt } from '@inneranimalmedia/agentsam-workbench/knowledge';

/** Local Studio owns execution and project authority; UI is a portable workbench component. */
async function request<T>(operation: 'inspect' | 'configure' | 'execute', root: string, extras: Record<string, unknown> = {}): Promise<T> {
  const invoke = getTauriInvoke();
  if (!invoke) throw new Error('AutoRAG execution is available in Local Studio Desktop. Hosted projects need a connected, authorized terminal host.');
  const raw = await invoke('autorag_workflow_bridge', { requestJson: JSON.stringify({ operation, root, ...extras }) });
  const response = JSON.parse(String(raw)) as { ok: boolean; result?: T; error?: string };
  if (!response.ok || !response.result) throw new Error(response.error || 'autorag_workflow_failed');
  return response.result;
}

export const localStudioAutoRagHost: AutoRagWorkflowHost = Object.freeze({
  inspect(root: string) { return request<AutoRagWorkflowView>('inspect', root); },
  configure(root: string, input: Parameters<AutoRagWorkflowHost['configure']>[1]) { return request<unknown>('configure', root, input); },
  execute(root: string, options = { semantic: false, allowPaid: false }) { return request<AutoRagExecutionReceipt>('execute', root, { semantic: options.semantic, allow_paid: options.allowPaid }); },
  async pickRoot() { const invoke = getTauriInvoke(); return invoke ? (await invoke('autorag_choose_repository')) as string | null : null; },
});
