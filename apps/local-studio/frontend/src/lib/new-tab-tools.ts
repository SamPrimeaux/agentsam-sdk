import { useCallback, useSyncExternalStore } from "react";

/** Device-local pins and recents for New tab tool tiles, kept per account so accounts never mix. */
export type ToolUsage = { pinned: string[]; opened: Record<string, number> };

const EVENT = "agentsam:new-tab-tools";
const EMPTY: ToolUsage = Object.freeze({ pinned: [], opened: {} }) as ToolUsage;
const storageKey = (accountId: string | null | undefined) => `agentsam:new-tab-tools:${accountId || "anonymous"}`;

export function parseToolUsage(raw: string | null): ToolUsage {
  if (!raw) return EMPTY;
  try {
    const value = JSON.parse(raw) as Partial<ToolUsage>;
    const pinned = Array.isArray(value.pinned) ? value.pinned.filter((id): id is string => typeof id === "string") : [];
    const opened: Record<string, number> = {};
    for (const [id, at] of Object.entries(value.opened ?? {})) if (typeof at === "number") opened[id] = at;
    return { pinned, opened };
  } catch { return EMPTY; }
}

/** Pinned first (in pin order), then most recently opened, then the registry's own order. */
export function orderTools<T extends { id: string }>(tools: T[], usage: ToolUsage): T[] {
  const rank = new Map(tools.map((tool, index) => [tool.id, index]));
  const pinned = usage.pinned.map((id) => tools.find((tool) => tool.id === id)).filter((tool): tool is T => Boolean(tool));
  const pinnedIds = new Set(pinned.map((tool) => tool.id));
  const recent = tools
    .filter((tool) => !pinnedIds.has(tool.id) && usage.opened[tool.id] != null)
    .sort((a, b) => usage.opened[b.id]! - usage.opened[a.id]! || rank.get(a.id)! - rank.get(b.id)!);
  const recentIds = new Set(recent.map((tool) => tool.id));
  return [...pinned, ...recent, ...tools.filter((tool) => !pinnedIds.has(tool.id) && !recentIds.has(tool.id))];
}

let cache: { key: string; raw: string | null; value: ToolUsage } | null = null;
function snapshot(accountId: string | null | undefined): ToolUsage {
  if (typeof window === "undefined") return EMPTY;
  const key = storageKey(accountId);
  let raw: string | null = null;
  try { raw = window.localStorage.getItem(key); } catch { /* private mode */ }
  if (cache && cache.key === key && cache.raw === raw) return cache.value;
  cache = { key, raw, value: parseToolUsage(raw) };
  return cache.value;
}
function write(accountId: string | null | undefined, next: ToolUsage) {
  try { window.localStorage.setItem(storageKey(accountId), JSON.stringify(next)); } catch { /* private mode */ }
  window.dispatchEvent(new Event(EVENT));
}

export function useToolUsage(accountId: string | null | undefined) {
  const usage = useSyncExternalStore(
    (listener) => { window.addEventListener(EVENT, listener); window.addEventListener("storage", listener); return () => { window.removeEventListener(EVENT, listener); window.removeEventListener("storage", listener); }; },
    () => snapshot(accountId),
    () => EMPTY,
  );
  const togglePin = useCallback((id: string) => {
    const current = snapshot(accountId);
    write(accountId, { ...current, pinned: current.pinned.includes(id) ? current.pinned.filter((item) => item !== id) : [...current.pinned, id] });
  }, [accountId]);
  const markOpened = useCallback((id: string) => {
    const current = snapshot(accountId);
    write(accountId, { ...current, opened: { ...current.opened, [id]: Date.now() } });
  }, [accountId]);
  return { usage, togglePin, markOpened };
}
