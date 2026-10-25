/**
 * Provider connections (Cloudflare, Gmail, ...) finish in the system browser. The connector
 * callback can return to the desktop through agentsamstudio://connection/callback, which is the
 * only app link the server accepts for a connection return. Pure helpers, no app imports.
 */
export const SETTINGS_CATALOG_CHANGED_EVENT = "agentsam:settings-catalog-changed";
export const CONNECTION_CALLBACK_BASE = "agentsamstudio://connection/callback";

const SETTINGS_TARGET = /^\/settings\/[A-Za-z0-9/_-]*(\?[A-Za-z0-9_=&%.-]*)?$/;

export type ConnectionDeepLink = {
  provider: string;
  result: "connected" | "error" | "";
  error: string;
  /** Validated in-app settings path to return to, or "" when the link carries none. */
  to: string;
};

function isSettingsTarget(value: string): boolean {
  return SETTINGS_TARGET.test(value) && !value.includes("//");
}

/** The return_to a desktop connect sends, so the callback lands back in the app instead of the web. */
export function buildConnectionReturnUrl(provider: string, to?: string): string {
  const url = new URL(CONNECTION_CALLBACK_BASE);
  url.searchParams.set("provider", provider);
  if (to && isSettingsTarget(to)) url.searchParams.set("to", to);
  return url.toString();
}

export function parseConnectionDeepLink(value: string): ConnectionDeepLink | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "agentsamstudio:" || url.hostname !== "connection" || url.pathname !== "/callback") return null;
  const provider = (url.searchParams.get("connection") || url.searchParams.get("provider") || "").toLowerCase();
  if (!/^[a-z0-9_-]{1,40}$/.test(provider)) return null;
  const rawResult = url.searchParams.get("result") || "";
  const result = rawResult === "connected" ? "connected" : rawResult === "error" ? "error" : "";
  const error = (url.searchParams.get("error") || "").replace(/[^a-z0-9_.-]/gi, "").slice(0, 80);
  const to = url.searchParams.get("to") || "";
  return { provider, result, error, to: isSettingsTarget(to) ? to : "" };
}

/** In-app location to open after a connection returns; carries the same result params the web redirect does. */
export function connectionReturnLocation(link: ConnectionDeepLink): string {
  if (!link.to) return "";
  const target = new URL(link.to, "https://app.invalid");
  target.searchParams.set("connection", link.provider);
  if (link.result) target.searchParams.set("result", link.result);
  if (link.error) target.searchParams.set("error", link.error);
  return target.pathname + target.search;
}
