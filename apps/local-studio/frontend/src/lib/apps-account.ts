import { useEffect, useSyncExternalStore } from "react";
import type { AdminInstallableApp } from "@inneranimalmedia/agentsam-nav";
import { navigateApp } from "@/lib/work/navigate";
import { getTauriInvoke, isPackagedDesktop } from "@/lib/desktop/tauri";
import { useWorkStore } from "@/lib/work/store";

type Method = "GET" | "POST" | "DELETE" | "PATCH";

/**
 * Host-owned account Apps API. Settings and the Side Stage App library both
 * go through these calls so the catalog, installs and enable state have one
 * client path.
 */
async function appsRequest(method: Method, body?: Record<string, unknown>, pathOverride?: "/api/apps/open") {
  const path = pathOverride ?? (method === "GET" ? "/api/apps/launcher" : "/api/apps/install");
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: { accept: "application/json", ...(body === undefined ? {} : { "content-type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload = await response.json().catch(() => null);
  if (response.status === 401) throw new Error("apps_account_sign_in_required");
  if (response.status === 503) throw new Error("apps_account_service_unavailable");
  if (!response.ok || !payload?.ok) throw new Error("apps_account_request_failed");
  return payload;
}

export async function loadAccountApps(): Promise<AdminInstallableApp[]> {
  const value = await appsRequest("GET");
  if (!Array.isArray(value.apps)) throw new Error("apps_inventory_invalid");
  return value.apps;
}
export type DeviceAppReceipt = { ready: boolean; version?: string; url?: string };
export async function deviceAppPackage(key: string, action: "install" | "status" | "open"): Promise<DeviceAppReceipt> {
  const invoke = getTauriInvoke();
  if (!invoke) throw new Error("Desktop device installation requires AgentSam Desktop");
  const result = await invoke("desktop_app_package", { key, action }) as DeviceAppReceipt;
  if (!result || typeof result.ready !== "boolean") throw new Error("Invalid device installation response");
  if (action === "open" && result.ready) {
    const url = new URL(result.url || "");
    if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !url.port || url.username || url.password) throw new Error("Invalid installed app origin");
  }
  return result;
}
export async function installAccountApp(key: string, selected?: AdminInstallableApp): Promise<void> {
  const generation = accountAppsGeneration;
  if (isPackagedDesktop()) {
    const app = selected?.key === key ? selected : appsState.apps.find(row => row.key === key) ?? (await loadAccountApps()).find(row => row.key === key);
    if (!app) throw new Error("App is not in the account catalog");
    if (app.delivery?.kind === "npm-static") {
      const receipt = await deviceAppPackage(key, "install");
      if (!receipt.ready) throw new Error("Device package is not ready");
    }
  }
  if (generation !== accountAppsGeneration) throw new Error("Account changed during installation");
  await appsRequest("POST", { key });
  await reloadAccountApps();
  if (!appsState.loaded || appsState.error) throw new Error('apps_mutation_applied_unverified');
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('agentsam:apps-changed'));
}
export async function removeAccountApp(key: string): Promise<void> {
  await appsRequest("DELETE", { key });
  await reloadAccountApps();
  if (!appsState.loaded || appsState.error) throw new Error('apps_mutation_applied_unverified');
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('agentsam:apps-changed'));
}
export async function setAccountAppEnabled(key: string, enabled: boolean): Promise<void> {
  await appsRequest("PATCH", { key, enabled });
  await reloadAccountApps();
  if (!appsState.loaded || appsState.error) throw new Error('apps_mutation_applied_unverified');
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('agentsam:apps-changed'));
}

const SAFE_APP_HREF = /^\/(?!\/)[\w/%?&=.,#:+~-]*$/;
export function isSafeAppHref(href: string): boolean { return SAFE_APP_HREF.test(href); }
export function openAccountApp(href: string, selected?: AdminInstallableApp): void {
  if (!isSafeAppHref(href)) return;
  const app = selected ?? appsState.apps.find(row => row.installed && row.enabled && row.href === href);
  if (app?.installed && app.enabled && isPackagedDesktop() && app.delivery?.kind === "npm-static") {
    useWorkStore.getState().openSideTab("item", { title: app.label, item: { type: "app", key: app.key }, ephemeral: false });
    navigateApp("/admin/agentsam");
    return;
  }
  if (app?.installed && app.enabled) void markAccountAppOpened(app.key);
  navigateApp(href);
}

export async function pinAccountApp(key: string, pinned: boolean): Promise<void> {
  await appsRequest("PATCH", { key, pinned });
  await reloadAccountApps();
  if (!appsState.loaded || appsState.error) throw new Error('apps_mutation_applied_unverified');
}

/** Stamps last_opened_at for ranking recents. Never blocks opening an app. */
export async function markAccountAppOpened(key: string): Promise<void> {
  try { await appsRequest("POST", { key }, "/api/apps/open"); }
  catch { /* ranking is best-effort */ }
}

type AccountAppsState = { apps: AdminInstallableApp[]; loaded: boolean; error: boolean };
const EMPTY_APPS: AccountAppsState = Object.freeze({ apps: [], loaded: false, error: false });
let appsState: AccountAppsState = EMPTY_APPS;
let appsInFlight: Promise<void> | null = null;
let accountAppsGeneration = 0;
const appsListeners = new Set<() => void>();
const publishApps = (next: AccountAppsState) => { appsState = next; appsListeners.forEach((fn) => fn()); };
/** Reset account-owned state on identity changes; stale network responses are discarded. */
export function invalidateAccountApps(): void {
  accountAppsGeneration += 1;
  appsInFlight = null;
  publishApps(EMPTY_APPS);
}

/** Shared, account-scoped catalog snapshot for every surface that shows apps. */
export function reloadAccountApps(): Promise<void> {
  if (appsInFlight) return appsInFlight;
  const generation = accountAppsGeneration;
  appsInFlight = loadAccountApps()
    .then((apps) => {
      if (generation === accountAppsGeneration) publishApps({ apps, loaded: true, error: false });
    })
    .catch(() => {
      if (generation === accountAppsGeneration) publishApps({ apps: [], loaded: true, error: true });
    })
    .finally(() => { if (generation === accountAppsGeneration) appsInFlight = null; });
  return appsInFlight;
}

export function useAccountApps(): AccountAppsState & { reload: () => Promise<void> } {
  const state = useSyncExternalStore(
    (listener) => { appsListeners.add(listener); return () => { appsListeners.delete(listener); }; },
    () => appsState,
    () => EMPTY_APPS,
  );
  useEffect(() => {
    if (!appsState.loaded && !appsInFlight) void reloadAccountApps();
    const refresh = () => { void reloadAccountApps(); };
    window.addEventListener("agentsam:navigation-changed", refresh);
    return () => window.removeEventListener("agentsam:navigation-changed", refresh);
  }, []);
  return { ...state, reload: reloadAccountApps };
}
