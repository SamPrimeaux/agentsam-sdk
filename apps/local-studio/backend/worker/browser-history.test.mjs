import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { listBrowserHistory, normalizeHistoryEntry, recordBrowserVisit, removeBrowserHistoryEntry } from "./browser-history.js";

// Schema mirrors production agentsam_browser_history (migration 1367).
function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`CREATE TABLE agentsam_browser_history (
    account_id TEXT NOT NULL, url TEXT NOT NULL, title TEXT NOT NULL, icon_url TEXT NOT NULL,
    visit_count INTEGER NOT NULL DEFAULT 1 CHECK (visit_count >= 1),
    last_visited_at INTEGER NOT NULL DEFAULT (unixepoch()), PRIMARY KEY (account_id, url));`);
  const db = { prepare(sql) { const stmt = sqlite.prepare(sql); return { bind(...args) { return {
    all: async () => ({ results: stmt.all(...args) }),
    run: async () => ({ meta: { changes: Number(stmt.run(...args).changes) } }),
  }; } }; } };
  return { sqlite, db };
}

test("only http(s) pages without credentials are recorded; fragments are dropped", () => {
  assert.deepEqual(normalizeHistoryEntry({ url: "https://www.github.com/a/b#readme", title: "  Repo \n page " }),
    { url: "https://www.github.com/a/b", title: "Repo page", icon_url: "https://www.github.com/favicon.ico" });
  assert.equal(normalizeHistoryEntry({ url: "https://example.com/x" }).title, "example.com");
  for (const url of ["javascript:alert(1)", "about:srcdoc", "https://u:p@example.com/", "not a url", ""])
    assert.throws(() => normalizeHistoryEntry({ url }), /history_url_invalid/);
});

test("visits upsert per account, count once per settle window and list newest first", async () => {
  const { db, sqlite } = fixture();
  await recordBrowserVisit(db, "alice", { url: "https://a.test/", title: "A" });
  await recordBrowserVisit(db, "alice", { url: "https://a.test/", title: "A (loaded)" });
  await recordBrowserVisit(db, "bob", { url: "https://a.test/", title: "Bob A" });
  const row = sqlite.prepare("SELECT title, visit_count FROM agentsam_browser_history WHERE account_id='alice'").get();
  assert.deepEqual([row.title, row.visit_count], ["A (loaded)", 1]);

  sqlite.prepare("UPDATE agentsam_browser_history SET last_visited_at = last_visited_at - 120 WHERE account_id='alice'").run();
  await recordBrowserVisit(db, "alice", { url: "https://a.test/", title: "A" });
  assert.equal(sqlite.prepare("SELECT visit_count FROM agentsam_browser_history WHERE account_id='alice'").get().visit_count, 2);

  sqlite.prepare("UPDATE agentsam_browser_history SET last_visited_at = last_visited_at - 500 WHERE account_id='alice'").run();
  await recordBrowserVisit(db, "alice", { url: "https://b.test/p", title: "B" });
  const alice = await listBrowserHistory(db, "alice");
  assert.deepEqual(alice.map(item => item.url), ["https://b.test/p", "https://a.test/"]);
  assert.deepEqual((await listBrowserHistory(db, "bob")).map(item => item.title), ["Bob A"]);
});

test("removing a suggestion only affects the caller and requires context", async () => {
  const { db } = fixture();
  await recordBrowserVisit(db, "alice", { url: "https://a.test/", title: "A" });
  await recordBrowserVisit(db, "bob", { url: "https://a.test/", title: "A" });
  assert.deepEqual(await removeBrowserHistoryEntry(db, "alice", "https://a.test/"), { url: "https://a.test/", removed: true });
  assert.equal((await removeBrowserHistoryEntry(db, "alice", "https://a.test/")).removed, false);
  assert.equal((await listBrowserHistory(db, "bob")).length, 1);
  await assert.rejects(() => listBrowserHistory(db, ""), /browser_history_context_missing/);
});
