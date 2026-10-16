/** Bridge between CAD Creator (iframe guest) and the host-owned AgentSam conversation.
 * Mirrors lib/database/assistantContext: events can fire before chat mounts — buffer latest. */
export interface CadAssistantPayload { request_id: string; prompt: string; selection: unknown }
let pending: CadAssistantPayload | null = null;
export function publishCadAssistantContext(ctx: CadAssistantPayload) {
  pending = ctx;
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("agentsam:cad-assistant-context", { detail: ctx }));
}
export function consumePendingCadAssistantContext(): CadAssistantPayload | null { const n = pending; pending = null; return n; }
export function peekPendingCadAssistantContext(): CadAssistantPayload | null { return pending; }
