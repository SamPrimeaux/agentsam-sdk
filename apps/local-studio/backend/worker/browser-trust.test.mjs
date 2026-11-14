import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { listEmbedPolicy, listTrustedOrigins, normalizeTrustOrigin, trustOrigin, untrustOrigin } from "./browser-trust.js";

// Schema mirrors production (account-owned trust; platform-wide embed policy).
function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`CREATE TABLE agentsam_browser_trusted_origin (
    account_id TEXT NOT NULL, origin TEXT NOT NULL, cert_fingerprint_sha256 TEXT,
    trust_scope TEXT NOT NULL DEFAULT 'persistent',
    created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (account_id, origin));
    CREATE TABLE agentsam_browser_embed_policy (host_suffix TEXT PRIMARY KEY, embed_mode TEXT NOT NULL, source TEXT, note TEXT);
    INSERT INTO agentsam_browser_embed_policy VALUES ('github.com','browser_run','seed',NULL),('example.org','passive','seed',NULL);`);
  const db = { prepare(sql) { const stmt = sqlite.prepare(sql); return { bind(...args) { return {
    all: async () => ({ results: stmt.all(...args) }),
    run: async () => ({ meta: { changes: Number(stmt.run(...args).changes) } }),
  }; } }; } };
  return { sqlite, db };
}

test("only web origins are trusted; paths and credentials are dropped or refused", () => {
  assert.equal(normalizeTrustOrigin("Example.com/some/path?x=1"), "https://example.com");
  assert.equal(normalizeTrustOrigin("http://sub.example.com:8080/x"), "http://sub.example.com:8080");
  for (const bad of ["javascript:alert(1)", "https://u:p@example.com", "localhost", "ftp://example.com", "", "not a url"])
    assert.throws(() => normalizeTrustOrigin(bad), /trust_origin_invalid/);
});

test("trust is account scoped, idempotent and updates scope in place", async () => {
  const { db, sqlite } = fixture();
  await trustOrigin(db, "alice", { origin: "example.com" });
  await trustOrigin(db, "bob", { origin: "https://example.com", trust_scope: "session" });
  await trustOrigin(db, "alice", { origin: "https://example.com/", trust_scope: "debug" });
  assert.deepEqual(await listTrustedOrigins(db, "alice"), [{ origin: "https://example.com", trust_scope: "debug", created_at: sqlite.prepare("SELECT created_at FROM agentsam_browser_trusted_origin WHERE account_id='alice'").get().created_at }]);
  assert.equal((await listTrustedOrigins(db, "bob"))[0].trust_scope, "session");
  await assert.rejects(() => trustOrigin(db, "alice", { origin: "example.com", trust_scope: "forever" }), /trust_scope_invalid/);
});

test("removal only affects the caller; embed rules are readable by everyone and need no account", async () => {
  const { db } = fixture();
  await trustOrigin(db, "alice", { origin: "example.com" });
  await trustOrigin(db, "bob", { origin: "example.com" });
  assert.deepEqual(await untrustOrigin(db, "alice", "https://example.com"), { origin: "https://example.com", removed: true });
  assert.equal((await untrustOrigin(db, "alice", "https://example.com")).removed, false);
  assert.equal((await listTrustedOrigins(db, "bob")).length, 1);
  assert.deepEqual((await listEmbedPolicy(db)).map(r => r.host_suffix), ["example.org", "github.com"]);
  await assert.rejects(() => listTrustedOrigins(db, ""), /browser_trust_context_missing/);
});
