/**
 * Host side of CAD Creator preview bridge (Local Studio owns conversation + write authority).
 * Validates origin/source/channel/version. Guest messages are requests only:
 * cad.proposal is surfaced for host approval, never auto-applied by this module.
 */
export const CAD_BRIDGE_CHANNEL = "agentsam-preview-bridge" as const;
export const CAD_WORKSPACES = ["plan", "model", "parametric", "robotics", "render"] as const;
export interface CadSelectionContext { source: "cad-creator"; workspace: string; project_id: string; revision: number; object: { id: string; type: string; label: string; units: "in" } }
export interface CadHostHandlers {
  onSelection?: (s: CadSelectionContext) => void;
  onAssistantRequest?: (r: { request_id: string; prompt: string; selection: CadSelectionContext | null }) => void | Promise<void>;
  onProposal?: (p: { summary: string; tool: "design_apply_operation"; args: Record<string, unknown> }) => void;
  onReady?: (workspaces: string[]) => void;
}
const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === "object";
export function validateCadGuestMessage(event: MessageEvent, iframe: HTMLIFrameElement | null): Record<string, any> | null {
  if (!iframe?.contentWindow || event.source !== iframe.contentWindow) return null;
  if (event.origin !== window.location.origin) return null;
  const d = event.data;
  if (!isObj(d) || d.channel !== CAD_BRIDGE_CHANNEL || d.version !== 1 || typeof d.type !== "string") return null;
  if (d.type === "cad.selection") {
    const s = d.selection; if (!isObj(s) || s.source !== "cad-creator" || !isObj(s.object) || typeof s.object.id !== "string" || !s.object.id) return null;
  }
  if (d.type === "assistant.request" && (typeof d.request_id !== "string" || typeof d.prompt !== "string")) return null;
  if (d.type === "cad.proposal" && (!isObj(d.proposal) || d.proposal.tool !== "design_apply_operation" || !isObj(d.proposal.args))) return null;
  return d;
}
export function installCadHostBridge(iframe: () => HTMLIFrameElement | null, handlers: CadHostHandlers): () => void {
  const onMessage = (event: MessageEvent) => {
    const d = validateCadGuestMessage(event, iframe()); if (!d) return;
    if (d.type === "ready") handlers.onReady?.(Array.isArray(d.workspaces) ? d.workspaces : []);
    else if (d.type === "cad.selection") handlers.onSelection?.(d.selection);
    else if (d.type === "assistant.request") void handlers.onAssistantRequest?.({ request_id: d.request_id, prompt: d.prompt, selection: d.selection ?? null });
    else if (d.type === "cad.proposal") handlers.onProposal?.(d.proposal);
  };
  window.addEventListener("message", onMessage);
  return () => window.removeEventListener("message", onMessage);
}
export function postToCadGuest(iframe: HTMLIFrameElement | null, msg: { type: string; [k: string]: unknown }) {
  iframe?.contentWindow?.postMessage({ ...msg, channel: CAD_BRIDGE_CHANNEL, version: 1 }, window.location.origin);
}
