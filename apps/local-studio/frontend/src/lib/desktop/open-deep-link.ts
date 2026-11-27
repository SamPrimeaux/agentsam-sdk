/**
 * `agentsam .` / `agentsam <dir>` open Local Studio through agentsamstudio://open?path=<abs>.
 * This is only a first filter on an untrusted link; the native side re-validates the path
 * (absolute, real directory) before it becomes the workspace. Pure helpers, no app imports.
 */
export const OPEN_WORKSPACE_EVENT = "agentsam:workspace-opened";
export const OPEN_WORKSPACE_FAILED_EVENT = "agentsam:workspace-open-failed";

const MAX_PATH = 4096;
const APP_ORIGIN = "https://agentsam.local";

function safeAppPath(path: string): string | null {
  if (!path || path.length > MAX_PATH || !path.startsWith("/") || path.startsWith("//") || path.includes("\\") || /[\u0000-\u001f]/.test(path)) return null;
  try {
    const resolved = new URL(path, APP_ORIGIN);
    if (resolved.origin !== APP_ORIGIN) return null;
    return resolved.pathname + resolved.search + resolved.hash;
  } catch {
    return null;
  }
}

/** Build a same-app route handoff from the browser into the installed Local Studio app. */
export function buildNavigateDeepLink(path: string): string | null {
  const safePath = safeAppPath(path);
  if (!safePath) return null;
  return `agentsamstudio://navigate?to=${encodeURIComponent(safePath)}`;
}

/** Parse only same-app navigation requests; OAuth and workspace links keep their own handlers. */
export function parseNavigateDeepLink(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "agentsamstudio:" || url.hostname !== "navigate") return null;
  if (url.pathname !== "" && url.pathname !== "/") return null;
  const target = url.searchParams.get("to") ?? "";
  return safeAppPath(target);
}

export function parseOpenDeepLink(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "agentsamstudio:" || url.hostname !== "open") return null;
  if (url.pathname !== "" && url.pathname !== "/") return null;
  const path = url.searchParams.get("path") ?? "";
  if (!path || path.length > MAX_PATH || path.includes("\0")) return null;
  if (!/^(\/|[A-Za-z]:[\\/])/.test(path)) return null;
  return path;
}
