import { useEffect, useSyncExternalStore } from "react";
import {
  listLocalStudioConnections,
  type LocalStudioSideStageRecord,
} from "../src/lib/connections/client.ts";
import { SETTINGS_CATALOG_CHANGED_EVENT } from "../src/lib/desktop/connection-deep-link.ts";

/**
 * Side Stage registration is account-scoped plugin catalog data, not a JSX
 * menu, env toggle, or compile-time list of installed plugins. Native renderers
 * stay inside their owning apps; new plugins use the generic stage host.
 */
export type SideStageAction = LocalStudioSideStageRecord;
type Registry = { actions: SideStageAction[]; loaded: boolean; error: boolean };
const EMPTY: Registry = Object.freeze({ actions: [], loaded: false, error: false });
let current: Registry = EMPTY;
let inFlight: Promise<Registry> | null = null;
const listeners = new Set<() => void>();
const validId = /^[a-z0-9][a-z0-9-]{1,79}$/;
const validPlugin = /^plg_[a-f0-9]{8,}$/i;
const hostKinds = new Set([
  "chat", "browser", "files", "artifacts", "app", "design",
  "media", "database", "terminal", "goal",
]);

function publish(next: Registry) {
  current = next;
  listeners.forEach(listener => listener());
}

export function receiveSideStageRegistry(input: unknown) {
  if (!Array.isArray(input)) throw new Error("side_stage_registry_invalid");
  const seen = new Set<string>();
  const actions = input.filter((entry): entry is SideStageAction => {
    if (!entry || typeof entry !== "object") return false;
    const stage = entry as Partial<SideStageAction>;
    if (!validId.test(stage.id || "") || !validPlugin.test(stage.pluginId || "") ||
        !validId.test(stage.stageId || "") || typeof stage.label !== "string" ||
        !stage.label.trim() || seen.has(stage.id!)) return false;
    if (stage.renderer === "builtin") {
      if (!hostKinds.has(stage.tabKind || "")) return false;
    } else if (stage.renderer === "embed") {
      if (stage.tabKind !== "plugin" || typeof stage.href !== "string" ||
          !stage.href.startsWith("https://")) return false;
    } else if (stage.renderer === "workspace") {
      if (stage.tabKind !== "plugin") return false;
    } else return false;
    seen.add(stage.id!);
    return true;
  });
  publish({ actions, loaded: true, error: false });
  return actions;
}

export async function reloadSideStageRegistry(): Promise<Registry> {
  if (inFlight) return inFlight;
  inFlight = listLocalStudioConnections()
    .then(payload => {
      receiveSideStageRegistry(payload.side_stages ?? []);
      return current;
    })
    .catch(() => {
      // Fail closed on authorization or network errors; never show a
      // previous account's plugins as if they were connected.
      publish({ actions: [], loaded: true, error: true });
      return current;
    })
    .finally(() => { inFlight = null; });
  return inFlight;
}

export function sideStageRegistrySnapshot() { return current; }
export function subscribeSideStageRegistry(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSideStageRegistry() {
  const snapshot = useSyncExternalStore(
    subscribeSideStageRegistry, sideStageRegistrySnapshot, () => EMPTY,
  );
  useEffect(() => {
    void reloadSideStageRegistry();
    const refresh = () => { void reloadSideStageRegistry(); };
    const visible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener(SETTINGS_CATALOG_CHANGED_EVENT, refresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener(SETTINGS_CATALOG_CHANGED_EVENT, refresh);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);
  return snapshot;
}

export function sideStageComposerWidgets() {
  return current.actions.map(stage => ({
    id: stage.id,
    label: stage.label,
    mention: "@" + stage.stageId,
    description: stage.description,
    icon: stage.icon,
    iconUrl: stage.iconUrl || undefined,
    ready: true,
    status: "available",
    action: { type: "open-side-stage" as const, tab: stage.tabKind },
  }));
}
