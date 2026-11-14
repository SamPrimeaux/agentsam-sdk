import type { AdminInstallableApp } from "@inneranimalmedia/agentsam-nav";
import { navigateApp } from "@/lib/work/navigate";

type Method = "GET" | "POST" | "DELETE" | "PATCH";

/**
 * Host-owned account Apps API. Settings and the Side Stage App library both
 * go through these calls so the catalog, installs and enable state have one
 * client path.
 */
async function appsRequest(method: Method, body?: Record<string, unknown>) {
  const response = await fetch(method === "GET" ? "/api/apps/launcher" : "/api/apps/install", {
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
