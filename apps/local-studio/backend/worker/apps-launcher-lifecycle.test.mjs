import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { listLauncherApps, installNativeAdminApp, removeNativeAdminApp, setNativeAdminAppEnabled, setNativeAdminAppPinned, touchNativeAdminAppOpened } from './apps-launcher.js';

// Schema mirrors the production apps / agentsam_app_installations tables.
function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE apps(id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, app_icon TEXT, icon_url TEXT, launch_url TEXT, editor_url TEXT,
      app_type TEXT, status TEXT DEFAULT 'active', visibility TEXT NOT NULL DEFAULT 'private', featured INTEGER DEFAULT 0,
      config_json TEXT NOT NULL DEFAULT '{}');
    CREATE TABLE agentsam_app_installations(
      id TEXT PRIMARY KEY DEFAULT ('ainst_' || lower(hex(randomblob(8)))),
      account_id TEXT NOT NULL,
      app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
      enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
      config_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(config_json)),
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0,1)),
      last_opened_at INTEGER,
      UNIQUE (account_id, app_id));`);
  const seed = sqlite.prepare('INSERT INTO apps(id,name,launch_url,app_type,status,visibility) VALUES(?,?,?,?,?,?)');
  seed.run('cad', 'CAD Creator', '/cad', 'application', 'active', 'public');
  sqlite.prepare("UPDATE apps SET editor_url = '/cad-creator/' WHERE id = 'cad'").run();
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

test('pinning and opening are account scoped and only apply to installed apps', async () => {
  const { db, sqlite } = fixture();
  await assert.rejects(() => setNativeAdminAppPinned(db, 'alice', 'cad', true), /app_not_installed/);
  await assert.rejects(() => touchNativeAdminAppOpened(db, 'alice', 'cad'), /app_not_installed/);
  await installNativeAdminApp(db, 'alice', 'cad');
  await installNativeAdminApp(db, 'bob', 'cad');

  assert.equal((await setNativeAdminAppPinned(db, 'alice', 'cad', true)).pinned, true);
  const state = (account) => sqlite.prepare('SELECT pinned, last_opened_at FROM agentsam_app_installations WHERE account_id=? AND app_id=?').get(account, 'cad');
  assert.equal(state('alice').pinned, 1);
  assert.equal(state('bob').pinned, 0);

  assert.equal((await touchNativeAdminAppOpened(db, 'alice', 'cad')).opened, true);
  assert.ok(state('alice').last_opened_at > 0);
  assert.equal(state('bob').last_opened_at, null);

  const [aliceView] = await listLauncherApps(db, 'alice');
  assert.deepEqual([aliceView.pinned, aliceView.embed_href], [true, '/cad-creator/']);
  assert.ok(aliceView.last_opened_at > 0);
  const [bobView] = await listLauncherApps(db, 'bob');
  assert.deepEqual([bobView.pinned, bobView.last_opened_at], [false, null]);

  await setNativeAdminAppEnabled(db, 'alice', 'cad', false);
  await assert.rejects(() => touchNativeAdminAppOpened(db, 'alice', 'cad'), /app_not_installed/);
  await assert.rejects(() => setNativeAdminAppPinned(db, 'alice', 'cad', 'yes'), /app_pinned_invalid/);
});

test('an app that is not installed never reports pinned or opened state', async () => {
  const { db } = fixture();
  const [view] = await listLauncherApps(db, 'alice');
  assert.deepEqual([view.installed, view.pinned, view.last_opened_at], [false, false, null]);
});
