import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { listLauncherApps, installNativeAdminApp, removeNativeAdminApp, setNativeAdminAppEnabled } from './apps-launcher.js';

// Schema mirrors the production apps / agentsam_app_installations tables.
function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE apps(id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, app_icon TEXT, icon_url TEXT, launch_url TEXT,
      app_type TEXT, status TEXT DEFAULT 'active', visibility TEXT NOT NULL DEFAULT 'private', featured INTEGER DEFAULT 0);
    CREATE TABLE agentsam_app_installations(
      id TEXT PRIMARY KEY DEFAULT ('ainst_' || lower(hex(randomblob(8)))),
      account_id TEXT NOT NULL,
      app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
      enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
      config_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(config_json)),
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE (account_id, app_id));`);
  const seed = sqlite.prepare('INSERT INTO apps(id,name,launch_url,app_type,status,visibility) VALUES(?,?,?,?,?,?)');
  seed.run('cad', 'CAD Creator', '/cad', 'application', 'active', 'public');
  seed.run('private-app', 'Private', '/private', 'application', 'active', 'private');
  seed.run('draft-app', 'Draft', '/draft', 'application', 'draft', 'public');
  seed.run('a-site', 'Not an app', '/site', 'site', 'active', 'public');
  const db = { prepare(sql) { const stmt = sqlite.prepare(sql); return { bind(...args) { return {
    first: async () => stmt.get(...args),
    all: async () => ({ results: stmt.all(...args) }),
    run: async () => ({ meta: { changes: Number(stmt.run(...args).changes) } }),
  }; } }; } };
  const row = (account, app) => sqlite.prepare('SELECT enabled FROM agentsam_app_installations WHERE account_id=? AND app_id=?').get(account, app);
  const count = (account) => sqlite.prepare('SELECT count(*) AS n FROM agentsam_app_installations WHERE account_id=?').get(account).n;
  return { sqlite, db, row, count };
}

test('install, disable, enable and remove are scoped to one account', async () => {
  const { db, sqlite, row, count } = fixture();
  await installNativeAdminApp(db, 'alice', 'cad');
  await installNativeAdminApp(db, 'bob', 'cad');
  await installNativeAdminApp(db, 'alice', 'cad');
  assert.equal(count('alice'), 1);

  assert.equal((await setNativeAdminAppEnabled(db, 'alice', 'cad', false)).enabled, false);
  assert.equal(row('alice', 'cad').enabled, 0);
  assert.equal(row('bob', 'cad').enabled, 1);
  const [aliceView] = await listLauncherApps(db, 'alice');
  assert.deepEqual([aliceView.installed, aliceView.enabled, aliceView.setup_status], [true, false, 'disabled']);

  assert.equal((await setNativeAdminAppEnabled(db, 'alice', 'cad', true)).enabled, true);
  assert.equal(row('alice', 'cad').enabled, 1);

  assert.equal((await removeNativeAdminApp(db, 'alice', 'cad')).removed, true);
  assert.equal(count('alice'), 0);
  assert.equal(count('bob'), 1);
  assert.equal((await removeNativeAdminApp(db, 'alice', 'cad')).removed, false);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM apps').get().n, 4);
});

test('re-installing a disabled app re-enables it for that account only', async () => {
  const { db, row } = fixture();
  await installNativeAdminApp(db, 'alice', 'cad');
  await installNativeAdminApp(db, 'bob', 'cad');
  await setNativeAdminAppEnabled(db, 'alice', 'cad', false);
  await setNativeAdminAppEnabled(db, 'bob', 'cad', false);
  await installNativeAdminApp(db, 'alice', 'cad');
  assert.equal(row('alice', 'cad').enabled, 1);
  assert.equal(row('bob', 'cad').enabled, 0);
});

test('only public, active applications in the catalog can be installed or listed', async () => {
  const { db, count } = fixture();
  for (const key of ['private-app', 'draft-app', 'a-site', 'missing']) {
    await assert.rejects(() => installNativeAdminApp(db, 'alice', key), /app_install_unavailable/);
  }
  assert.equal(count('alice'), 0);
  assert.deepEqual((await listLauncherApps(db, 'alice')).map(app => app.key), ['cad']);
});

test('lifecycle calls validate their inputs', async () => {
  const { db } = fixture();
  await assert.rejects(() => setNativeAdminAppEnabled(db, 'alice', 'cad', true), /app_not_installed/);
  await installNativeAdminApp(db, 'alice', 'cad');
  await assert.rejects(() => setNativeAdminAppEnabled(db, 'alice', 'cad', 'true'), /app_enabled_invalid/);
  await assert.rejects(() => removeNativeAdminApp(db, 'alice', '../bad'), /app_install_key_invalid/);
  await assert.rejects(() => removeNativeAdminApp(db, '', 'cad'), /apps_launcher_context_missing/);
});
