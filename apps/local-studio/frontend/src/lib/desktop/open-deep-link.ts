/**
 * `agentsam .` / `agentsam <dir>` open Local Studio through agentsamstudio://open?path=<abs>.
 * This is only a first filter on an untrusted link; the native side re-validates the path
 * (absolute, real directory) before it becomes the workspace. Pure helpers, no app imports.
 */
export const OPEN_WORKSPACE_EVENT = "agentsam:workspace-opened";
export const OPEN_WORKSPACE_FAILED_EVENT = "agentsam:workspace-open-failed";

const MAX_PATH = 4096;

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
