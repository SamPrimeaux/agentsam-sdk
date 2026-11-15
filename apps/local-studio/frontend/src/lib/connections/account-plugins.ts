import { useEffect, useSyncExternalStore } from "react";
import { listLocalStudioConnections, type LocalStudioPluginRecord } from "./client.ts";
import { SETTINGS_CATALOG_CHANGED_EVENT } from "../desktop/connection-deep-link.ts";

type State = { plugins: LocalStudioPluginRecord[]; loaded: boolean; error: boolean };
const EMPTY: State = Object.freeze({ plugins: [], loaded: false, error: false });
let state: State = EMPTY;
let inFlight: Promise<void> | null = null;
const listeners = new Set<() => void>();
const publish = (next: State) => { state = next; listeners.forEach((fn) => fn()); };

/** Account-scoped installed plugins (with provider logos and setup/health state). */
export function reloadAccountPlugins(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = listLocalStudioConnections()
    .then((payload) => publish({ plugins: payload.plugins ?? [], loaded: true, error: false }))
    // Fail closed: never keep another account's plugins visible after an auth or network error.
    .catch(() => publish({ plugins: [], loaded: true, error: true }))
    .finally(() => { inFlight = null; });
  return inFlight;
}

export function useAccountPlugins(): State & { reload: () => Promise<void> } {
  const current = useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    () => state,
    () => EMPTY,
  );
  useEffect(() => {
    if (!state.loaded && !inFlight) void reloadAccountPlugins();
    const refresh = () => { void reloadAccountPlugins(); };
    window.addEventListener(SETTINGS_CATALOG_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(SETTINGS_CATALOG_CHANGED_EVENT, refresh);
  }, []);
  return { ...current, reload: reloadAccountPlugins };
}
