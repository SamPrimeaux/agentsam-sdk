import type { CadSelectionContext } from "@/lib/cad-host-bridge";
import type { useWorkStore } from "@/lib/work/store";

export interface CadAssistantTurn {
  request_id: string;
  prompt: string;
  selection: CadSelectionContext | null;
}

export type CadAssistantUpdate = (text: string, done: boolean) => void;
type CadWorkStore = Pick<typeof useWorkStore, "getState" | "subscribe">;

const CAD_CHAT_TITLE = "CAD AgentSam";

export function formatCadAssistantPrompt(turn: CadAssistantTurn): string {
  if (!turn.request_id || turn.request_id.length > 128 || !turn.prompt.trim() || turn.prompt.length > 8000) {
    throw new Error("invalid_cad_assistant_request");
  }
  const sel = turn.selection;
  const context = sel
    ? `Selected CAD object: ${sel.object.label} (${sel.object.type}, ${sel.object.id}).
Workspace: ${sel.workspace}. Project: ${sel.project_id}. Revision: ${sel.revision}. Units: ${sel.object.units}.`
    : "No CAD object selected.";
  return `CAD Creator request:
${turn.prompt.trim()}

${context}

Use the selected revision as authoritative context. Propose edits precisely; do not claim an edit was applied or execute a write without explicit approval in the CAD host.`;
}

/** Uses the existing Work side-conversation stream; never creates a second model client. */
export async function runCadAssistantTurn(
  turn: CadAssistantTurn,
  update: CadAssistantUpdate,
  store?: CadWorkStore,
): Promise<string> {
  const prompt = formatCadAssistantPrompt(turn);
  const connected = store ?? (await import("@/lib/work/store")).useWorkStore;
  const before = connected.getState();
  const existing = before.sideTabs.find((tab) => tab.kind === "chat" && tab.title === CAD_CHAT_TITLE
    && !before.pausedQueueTargets.includes(tab.id));
  const tabId = existing?.id ?? before.openSideTab("chat", {
    title: CAD_CHAT_TITLE,
    parentTrailId: null,
    reportToLead: false,
  });
  if (existing) {
    before.setSideOpen(true);
    before.setActiveSideTab(tabId);
  }
  const ready = connected.getState();
  if (ready.streamingIds.includes(tabId)) throw new Error("cad_assistant_busy");
  const initialCount = ready.sideTabs.find((tab) => tab.id === tabId)?.messages.length ?? 0;
  let last = "";
  const unsubscribe = connected.subscribe((state) => {
    if (state.offlineQueue.some((item) => item.targetId === tabId)) return;
    const tab = state.sideTabs.find((item) => item.id === tabId);
    const assistant = tab?.messages.slice(initialCount).filter((msg) => msg.role === "assistant").at(-1);
    const text = assistant?.content ?? "";
    if (text && text !== last) {
      last = text;
      update(text, false);
    }
  });
  try {
    await connected.getState().send(tabId, "side", prompt, { runMode: "ask" });
    const state = connected.getState();
    if (state.offlineQueue.some((item) => item.targetId === tabId)) throw new Error("cad_assistant_offline_queued");
    if (state.pausedQueueTargets.includes(tabId)) throw new Error("cad_assistant_model_failed");
    const tab = state.sideTabs.find((item) => item.id === tabId);
    const result = tab?.messages.slice(initialCount).filter((msg) => msg.role === "assistant").at(-1)?.content ?? "";
    if (!result.trim()) throw new Error("cad_assistant_no_response");
    update(result, true);
    return result;
  } finally {
    unsubscribe();
  }
}
