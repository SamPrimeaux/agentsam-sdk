export type BrowserHistoryEntry = {
  url: string;
  title: string;
  icon_url: string;
  visit_count: number;
  last_visited_at: number;
};

/** The account's recent pages, newest first. Failures read as "no history", never as an error state. */
export async function loadBrowserHistory(limit = 8): Promise<BrowserHistoryEntry[]> {
  try {
    const response = await fetch(`/api/browser/history?limit=${encodeURIComponent(String(limit))}`, {
      credentials: "same-origin",
      headers: { accept: "application/json" },
    });
    const payload = await response.json().catch(() => null);
    return response.ok && Array.isArray(payload?.history) ? payload.history : [];
  } catch { return []; }
}

let lastRecorded = "";
/** Records a settled page visit. Best-effort: browsing never waits on or fails because of history. */
export async function recordBrowserVisit(url: string, title?: string | null): Promise<void> {
  if (!/^https?:\/\//i.test(url)) return;
  const signature = `${url}\n${title ?? ""}`;
  if (signature === lastRecorded) return;
  lastRecorded = signature;
  try {
    await fetch("/api/browser/history", {
      method: "POST",
      credentials: "same-origin",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ url, title: title ?? "" }),
    });
  } catch { /* best-effort */ }
}

export async function removeBrowserHistoryEntry(url: string): Promise<boolean> {
  try {
    const response = await fetch("/api/browser/history", {
      method: "DELETE",
      credentials: "same-origin",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ url }),
    });
    return response.ok;
  } catch { return false; }
}
