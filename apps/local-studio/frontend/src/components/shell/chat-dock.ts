export type ChatDock = "left" | "right";

export interface ChatDockResizeResult {
  dock: ChatDock;
  width: number;
  docked: boolean;
}

/** Resize the existing chat/stage split; an intentional over-drag swaps their sides. */
export function calculateChatDockResize(
  dock: ChatDock,
  currentWidth: number,
  deltaPx: number,
  availableMax: number,
  dockChangedDuringDrag = false,
): ChatDockResizeResult {
  const maxWidth = Math.max(280, Math.min(1100, availableMax));
  const proposed = currentWidth - deltaPx;
  if (!dockChangedDuringDrag && dock === "left" && proposed > maxWidth + 72) {
    return { dock: "right", width: maxWidth, docked: true };
  }
  if (!dockChangedDuringDrag && dock === "right" && proposed < 208) {
    return { dock: "left", width: 420, docked: true };
  }
  return { dock, width: Math.max(280, Math.min(maxWidth, proposed)), docked: false };
}
