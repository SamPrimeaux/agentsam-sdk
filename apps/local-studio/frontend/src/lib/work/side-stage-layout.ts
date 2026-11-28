export type SideDock = "auto" | "left" | "right";

export function normalizeSideDock(value: unknown): SideDock {
  return value === "left" || value === "right" ? value : "auto";
}

/** Move a tab to the source-relative side of its drop target without changing tab identity. */
export function reorderSideTabs<T extends { id: string }>(tabs: T[], id: string, targetId: string): T[] {
  if (!id || !targetId || id === targetId) return tabs;
  const from = tabs.findIndex((tab) => tab.id === id);
  const to = tabs.findIndex((tab) => tab.id === targetId);
  if (from < 0 || to < 0) return tabs;
  const next = [...tabs];
  const [moved] = next.splice(from, 1);
  if (!moved) return tabs;
  next.splice(to, 0, moved);
  return next;
}
