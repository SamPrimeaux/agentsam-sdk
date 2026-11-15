import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const read = (rel) => readFile(new URL(rel, import.meta.url), "utf8");

test("Account settings render host-backed self-service, not read-only context", async () => {
  const index = await read("../src/frontend/index.tsx");
  const panel = await read("../src/frontend/account.tsx");
  const general = index.slice(index.indexOf("function GeneralView("), index.indexOf("function DesignView("));
  assert.match(general, /host\.account \? <SettingsAccountPanel host=\{host\.account\}/);
  for (const surface of ["ProfileForm", "PasswordForm", "BackupCodes", "Sessions"]) {
    assert.match(panel, new RegExp(`<${surface}[ >]`));
  }
  for (const method of [
    "readAccount", "updateAccountProfile", "changePassword", "listAccountSessions",
    "revokeAccountSession", "revokeOtherAccountSessions", "regenerateBackupCodes", "signOut",
  ]) assert.match(panel, new RegExp(`host\\.${method}\\(`));
  // Brand-flexible: theme tokens, no hard-coded product accent.
  assert.doesNotMatch(panel, /violet|#7c3aed|indigo-/);
  assert.doesNotMatch(general, /bg-violet-600/);
  // Backup codes are shown once and never fetched back.
  assert.match(panel, /won't be shown again/);
});

test("Local Studio account host maps every operation onto the identity routes", async () => {
  const { studioAccountHost } = await import(
    "../../../apps/local-studio/frontend/src/lib/account/account-host.ts"
  );
  const calls = [];
  globalThis.fetch = async (path, init = {}) => {
    calls.push([init.method || "GET", path, init.body ? JSON.parse(init.body) : undefined]);
    const body = path === "/api/account"
      ? { ok: true, account: { profile: { id: "u" } } }
      : path === "/api/account/profile" ? { ok: true, profile: { id: "u" } }
      : path === "/api/account/sessions" ? { ok: true, sessions: [] }
      : path === "/api/account/backup-codes" ? { ok: true, codes: ["AAAA-BBBB-CCCC"], backupCodes: { total: 1, remaining: 1 } }
      : path.endsWith("revoke-others") ? { ok: true, revoked: 2 }
      : { ok: true };
    return new Response(JSON.stringify(body), { status: 200 });
  };
  await studioAccountHost.readAccount();
  await studioAccountHost.updateAccountProfile({ displayName: "New" });
  await studioAccountHost.changePassword({ currentPassword: "a", password: "b", confirmPassword: "b" });
  await studioAccountHost.listAccountSessions();
  await studioAccountHost.revokeAccountSession("sess/1");
  assert.equal(await studioAccountHost.revokeOtherAccountSessions(), 2);
  const generated = await studioAccountHost.regenerateBackupCodes("pw");
  assert.deepEqual(generated.codes, ["AAAA-BBBB-CCCC"]);
  assert.deepEqual(calls, [
    ["GET", "/api/account", undefined],
    ["PATCH", "/api/account/profile", { displayName: "New" }],
    ["POST", "/api/auth/password", { current_password: "a", password: "b", confirm_password: "b" }],
    ["GET", "/api/account/sessions", undefined],
    ["DELETE", "/api/account/sessions/sess%2F1", undefined],
    ["POST", "/api/account/sessions/revoke-others", undefined],
    ["POST", "/api/account/backup-codes", { current_password: "pw" }],
  ]);

  globalThis.fetch = async () => new Response(JSON.stringify({ ok: false, error: "current_password_invalid" }), { status: 403 });
  await assert.rejects(() => studioAccountHost.regenerateBackupCodes("bad"), /current_password_invalid/);
});

test("Design spec sheet is token-driven and mounted in Brand & Design", async () => {
  const index = await read("../src/frontend/index.tsx");
  const sheet = await read("../src/frontend/design-spec.tsx");
  const design = index.slice(index.indexOf("function DesignView("), index.indexOf("function GitView("));
  assert.match(design, /<SettingsDesignSpecSheet themes=\{snapshot\.themes\}/);
  // Colors from any theme, structure from a spec theme; contrast computed, not asserted.
  assert.match(sheet, /Colors from/);
  assert.match(sheet, /Structure from/);
  assert.match(sheet, /function contrast\(/);
  // No baked brand hex in the sheet: every color is a resolved var.
  assert.doesNotMatch(sheet, /#238552|#3DBA7A|#191919|#262626/i);
});

test("charcoal green migration is a platform theme with a full spec", async () => {
  const sql = await read("../../../apps/local-studio/backend/migrations/1369_charcoal_green_ui_theme.sql");
  assert.match(sql, /INSERT OR IGNORE INTO cms_themes/);
  assert.match(sql, /'theme-charcoal-green', 'Charcoal Green', 'charcoal-green'/);
  assert.doesNotMatch(sql, /account_id,/, "platform stock theme: no account owner column written");
  for (const part of ['"scale":', '"radii":', '"spacing":', '"groupedField":', '"compareRow":', '"--color-primary":"#238552"']) {
    assert.ok(sql.includes(part), `missing ${part}`);
  }
});
