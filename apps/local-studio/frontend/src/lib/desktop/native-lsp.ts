import type { LspMessage, LspTransport } from "@inneranimalmedia/agentsam-ide/lsp";

/** Native Local Studio bridge into its packaged agentsam-ide LspHost.
 * No public HTTP endpoint, no extra terminal server, no web fallback.
 */
type LspWire = {
  ok: boolean;
  error?: string;
  session_id?: string;
  cursor?: number;
  running?: boolean;
  messages?: Array<{ seq: number; message: LspMessage }>;
};

async function call(request: Record<string, unknown>): Promise<LspWire> {
  const bridge = (window as typeof window & {
    __TAURI__?: { core?: { invoke?: (command: string, args: Record<string, unknown>) => Promise<unknown> } };
  }).__TAURI__?.core?.invoke;
  if (!bridge) throw new Error("native_lsp_requires_local_studio");
  const result = await bridge("local_lsp_bridge", { requestJson: JSON.stringify(request) }) as LspWire;
  if (!result?.ok) throw new Error(result?.error || "native_lsp_host_failed");
  return result;
}

export class NativeLspTransport implements LspTransport {
  constructor(private readonly workspaceRoot: string) {
    if (!workspaceRoot || !workspaceRoot.startsWith("/")) throw new Error("lsp_absolute_workspace_required");
  }

  async start(language: string): Promise<{ session_id: string }> {
    const result = await call({ action: "start", workspace_root: this.workspaceRoot, language });
    if (!result.session_id) throw new Error("lsp_session_id_missing");
    return { session_id: result.session_id };
  }

  async send(sessionId: string, message: LspMessage): Promise<void> {
    await call({ action: "send", session_id: sessionId, message });
  }

  async poll(sessionId: string, after: number) {
    const result = await call({ action: "poll", session_id: sessionId, after });
    return {
      cursor: Number(result.cursor || 0),
      running: Boolean(result.running),
      error: result.error || null,
      messages: result.messages || [],
    };
  }

  async stop(sessionId: string): Promise<void> {
    await call({ action: "stop", session_id: sessionId });
  }
}
