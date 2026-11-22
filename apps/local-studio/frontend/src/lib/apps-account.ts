import { useEffect, useSyncExternalStore } from "react";
import type { AdminInstallableApp } from "@inneranimalmedia/agentsam-nav";
import { navigateApp } from "@/lib/work/navigate";
import { invokeStudioService, isPackagedDesktop } from "@/lib/desktop/tauri";

type Method = "GET" | "POST" | "DELETE" | "PATCH";

/**
 * Host-owned account Apps API. Settings and the Side Stage App library both
 * go through these calls so the catalog, installs and enable state have one
 * client path.
 */
async function appsRequest(method: Method, body?: Record<string, unknown>, pathOverride?: "/api/apps/open") {
  const path = pathOverride ?? (method === "GET" ? "/api/apps/launcher" : "/api/apps/install");
  if (isPackagedDesktop()) {
    // The packaged app has no same-origin session cookie. Native attaches its
    // verified bearer session; the server resolves the account from that token.
    // Never send a client-provided X-User-Id (or the studio-local fallback).
    const native = await invokeStudioService({
      operation: "apps", path, method,
      ...(body === undefined ? {} : { body }),
    });
    let nativePayload: any = null;
    try { nativePayload = JSON.parse(native.body || "null"); } catch { /* handled below */ }
    if (native.status === 401) throw new Error("apps_account_sign_in_required");
    if (native.status === 503) throw new Error("apps_account_service_unavailable");
    if (native.status >= 400 || !nativePayload?.ok) throw new Error("apps_account_request_failed");
    return nativePayload;
  }
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: { accept: "application/json", ...(body ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) throw new Error("apps_account_request_failed");
  return payload;
}

export async function loadAccountApps(): Promise<AdminInstallableApp[]> {
  const value = await appsRequest("GET");
  if (!Array.isArray(value.apps)) throw new Error("apps_inventory_invalid");
  return value.apps;
}
export async function installAccountApp(key: string): Promise<void> { await appsRequest("POST", { key }); }
export async function removeAccountApp(key: string): Promise<void> { await appsRequest("DELETE", { key }); }
export async function setAccountAppEnabled(key: string, enabled: boolean): Promise<void> {
  await appsRequest("PATCH", { key, enabled });
}

const SAFE_APP_HREF = /^\/(?!\/)[\w/%?&=.,#:+~-]*$/;
export function isSafeAppHref(href: string): boolean { return SAFE_APP_HREF.test(href); }
export function openAccountApp(href: string): void { if (isSafeAppHref(href)) navigateApp(href); }

export async function pinAccountApp(key: string, pinned: boolean): Promise<void> {
  await appsRequest("PATCH", { key, pinned });
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
const appsListeners = new Set<() => void>();
const publishApps = (next: AccountAppsState) => { appsState = next; appsListeners.forEach((fn) => fn()); };

/** Shared, account-scoped catalog snapshot for every surface that shows apps. */
export function reloadAccountApps(): Promise<void> {
  if (appsInFlight) return appsInFlight;
  appsInFlight = loadAccountApps()
    .then((apps) => publishApps({ apps, loaded: true, error: false }))
    .catch(() => publishApps({ apps: appsState.apps, loaded: true, error: true }))
    .finally(() => { appsInFlight = null; });
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
