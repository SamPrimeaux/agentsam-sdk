/**
 * Account-scoped browsing history for the Side Stage New tab "Suggested" tiles.
 * Identity is auth_users.id (au_*) only. Every column is written on every visit.
 */
const MAX_URL = 2048;
const MAX_TITLE = 160;
const need = (db, accountId) => {
  if (!db?.prepare || !accountId) throw new Error("browser_history_context_missing");
};

/** Normalize one visit. Only http(s) pages without embedded credentials are recorded. */
export function normalizeHistoryEntry(input) {
  let parsed;
  try { parsed = new URL(String(input?.url ?? "")); } catch { throw new Error("history_url_invalid"); }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password)
    throw new Error("history_url_invalid");
  parsed.hash = "";
  if (parsed.href.length > MAX_URL) throw new Error("history_url_invalid");
  const host = parsed.hostname.replace(/^www\./, "");
  const title = String(input?.title ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_TITLE) || host;
  return { url: parsed.href, title, icon_url: parsed.origin + "/favicon.ico" };
}

export async function recordBrowserVisit(db, accountId, input) {
  need(db, accountId);
  const entry = normalizeHistoryEntry(input);
  // A page that settles twice within 30s (title update after load) counts as one visit.
  await db.prepare(
    "INSERT INTO agentsam_browser_history (account_id, url, title, icon_url) VALUES (?, ?, ?, ?) " +
    "ON CONFLICT(account_id, url) DO UPDATE SET title = excluded.title, icon_url = excluded.icon_url, " +
    "visit_count = visit_count + CASE WHEN unixepoch() - last_visited_at > 30 THEN 1 ELSE 0 END, " +
    "last_visited_at = unixepoch()"
  ).bind(accountId, entry.url, entry.title, entry.icon_url).run();
  return entry;
}

export async function listBrowserHistory(db, accountId, limit = 12) {
  need(db, accountId);
  const bounded = Math.min(Math.max(Number.isInteger(limit) ? limit : 12, 1), 50);
  const { results } = await db.prepare(
    "SELECT url, title, icon_url, visit_count, last_visited_at FROM agentsam_browser_history " +
    "WHERE account_id = ? ORDER BY last_visited_at DESC, visit_count DESC LIMIT ?"
  ).bind(accountId, bounded).all();
  return (results || []).map(row => ({
    url: row.url, title: row.title, icon_url: row.icon_url,
    visit_count: Number(row.visit_count), last_visited_at: Number(row.last_visited_at),
  }));
}

/** Removing a suggestion is the owner's call; it never touches other accounts' rows. */
export async function removeBrowserHistoryEntry(db, accountId, url) {
  need(db, accountId);
  const entry = normalizeHistoryEntry({ url });
  const res = await db.prepare(
    "DELETE FROM agentsam_browser_history WHERE account_id = ? AND url = ?"
  ).bind(accountId, entry.url).run();
  return { url: entry.url, removed: (res?.meta?.changes || 0) > 0 };
}
