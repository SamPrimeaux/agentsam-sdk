import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { handleStudioThemes } from './studio-themes.js';

class D1Statement {
  constructor(db, sql) { this.db = db; this.sql = sql; this.values = []; }
  bind(...values) { this.values = values; return this; }
  async first() { return this.db.prepare(this.sql).get(...this.values) ?? null; }
  async all() { return { results: this.db.prepare(this.sql).all(...this.values) }; }
  async run() {
    const result = this.db.prepare(this.sql).run(...this.values);
    return { success: true, meta: { changes: Number(result.changes) } };
  }
}
class D1Memory {
  constructor() {
    this.sqlite = new DatabaseSync(':memory:');
    this.sqlite.exec('PRAGMA foreign_keys = ON');
    this.sqlite.exec('CREATE TABLE cms_sites (id TEXT PRIMARY KEY, theme_id TEXT)');
    this.sqlite.exec(readFileSync(new URL('./fixtures/cms-theme-registry.sql', import.meta.url), 'utf8'));
  }
  prepare(sql) { return new D1Statement(this.sqlite, sql); }
  async batch(statements) {
    this.sqlite.exec('BEGIN');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) {
      this.sqlite.exec('ROLLBACK');
      throw error;
    }
  }
  close() { this.sqlite.close(); }
}
const accountA = 'au_user_theme_a';
const accountB = 'au_user_theme_b';
const origin = 'https://studio.example';
function request(method, path, body, extraHeaders = {}) {
  const headers = { ...extraHeaders };
  if (method !== 'GET') {
    headers.origin ||= origin;
    headers['content-type'] ||= 'application/json';
  }
  return new Request(origin + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
async function json(response) { return { status: response.status, body: await response.json() }; }
function fixture() {
  const DB = new D1Memory();
  const sql = DB.sqlite;
  sql.prepare('INSERT INTO accounts (id,display_name) VALUES (?,?)').run(accountA, 'User A');
  sql.prepare('INSERT INTO accounts (id,display_name) VALUES (?,?)').run(accountB, 'User B');
  sql.prepare("INSERT INTO cms_themes (id,name,slug,config,theme_family,workspace_id,css_vars_json,account_id,visibility,status) VALUES (?,?,?,?,?,NULL,?,NULL,'public','active')").run(
    'theme-preset', 'Arctic Preset', 'arctic-preset', JSON.stringify({ cssVars: { '--bg-canvas': '#101010', '--color-primary': '#2878dd' } }),
    'dark', JSON.stringify({ '--bg-canvas': '#101010', '--color-primary': '#2878dd' }),
  );
  sql.prepare("INSERT INTO cms_themes (id,name,slug,config,theme_family,workspace_id,css_vars_json,account_id,visibility,status) VALUES (?,?,?,?,?,NULL,?,?, 'private','active')").run(
    'theme-other-user', 'Other User Secret', 'other-user-secret', '{}', 'custom',
    JSON.stringify({ '--bg-canvas': '#eeeeee' }), accountB,
  );
  sql.prepare("INSERT INTO cms_themes (id,name,slug,config,theme_family,workspace_id,css_vars_json,account_id,visibility,status) VALUES (?,?,?,?,?,NULL,?,?, 'public','active')").run(
    'theme-workspace-public', 'Workspace scoped', 'workspace-scoped', '{}', 'custom',
    JSON.stringify({ '--bg-canvas': '#eeeeee' }), null,
  );
  sql.prepare('UPDATE cms_themes SET workspace_id = ? WHERE id = ?').run('ws_private', 'theme-workspace-public');
  sql.prepare("INSERT INTO cms_theme_preferences (id,account_id,theme_id,theme_slug,scope,is_active) VALUES (?,?,?,?,'account',1)").run('pref-user-b', accountB, 'theme-other-user', 'other-user-secret');
  return DB;
}
async function call(DB, method, path, body, accountId = accountA, headers = {}) {
  return handleStudioThemes(request(method, path, body, headers), { DB }, accountId);
}

test('theme registry lists shared global presets and only the signed-in account private themes', async () => {
  const DB = fixture();
  try {
    const result = await json(await call(DB, 'GET', '/api/studio/themes'));
    assert.equal(result.status, 200);
    const ids = result.body.themes.map(theme => theme.id);
    assert.ok(ids.includes('theme-preset'));
    assert.ok(!ids.includes('theme-other-user'));
    assert.ok(!ids.includes('theme-workspace-public'));
    assert.equal(result.body.themes.find(theme => theme.id === 'theme-preset').source, 'catalog');
  } finally { DB.close(); }
});

test('customizing a preset creates an isolated private copy and never mutates the shared source', async () => {
  const DB = fixture();
  try {
    const created = await json(await call(DB, 'POST', '/api/studio/themes', {
      name: 'Sam Arctic', source_theme_id: 'theme-preset', theme_family: 'dark',
      css_vars: { '--bg-canvas': '#121212', '--color-primary': '#ff7619' },
    }));
    assert.equal(created.status, 201);
    assert.equal(created.body.theme.source, 'account-custom');
    assert.equal(created.body.theme.accountOwned, true);
    assert.equal(created.body.theme.visibility, 'private');
    assert.equal(created.body.theme.aliasOfThemeId, 'theme-preset');
    assert.equal(created.body.theme.cssVars['--color-primary'], '#ff7619');
    const source = DB.sqlite.prepare('SELECT css_vars_json,account_id FROM cms_themes WHERE id=?').get('theme-preset');
    assert.equal(JSON.parse(source.css_vars_json)['--color-primary'], '#2878dd');
    assert.equal(source.account_id, null);
    const copy = DB.sqlite.prepare('SELECT account_id,workspace_id,visibility,status FROM cms_themes WHERE id=?').get(created.body.theme.id);
    assert.deepEqual({ ...copy }, { account_id: accountA, workspace_id: null, visibility: 'private', status: 'active' });
  } finally { DB.close(); }
});

test('updates are owner-only and reject unsafe CSS token values', async () => {
  const DB = fixture();
  try {
    const created = await json(await call(DB, 'POST', '/api/studio/themes', { name: 'Owned theme' }));
    const id = created.body.theme.id;
    const denied = await json(await call(DB, 'PUT', '/api/studio/themes/' + id, { name: 'Stolen' }, accountB));
    assert.equal(denied.status, 404);
    const unsafe = await json(await call(DB, 'PUT', '/api/studio/themes/' + id, {
      css_vars: { '--bg-canvas': 'url(javascript:alert(1))' },
    }));
    assert.equal(unsafe.status, 400);
    const saved = await json(await call(DB, 'PUT', '/api/studio/themes/' + id, {
      name: 'Owned theme v2', theme_family: 'dashboard', css_vars: { '--bg-canvas': '#202020' },
    }));
    assert.equal(saved.status, 200);
    assert.equal(saved.body.theme.name, 'Owned theme v2');
    assert.equal(saved.body.theme.cssVars['--bg-canvas'], '#202020');
  } finally { DB.close(); }
});

test('applying a theme updates only this account preference; active themes cannot be archived', async () => {
  const DB = fixture();
  try {
    const created = await json(await call(DB, 'POST', '/api/studio/themes', { name: 'Owned theme' }));
    const id = created.body.theme.id;
    const applied = await json(await call(DB, 'POST', '/api/studio/themes/' + id + '/apply', {}));
    assert.equal(applied.status, 200);
    assert.equal(applied.body.activeThemeId, id);
    const prefA = DB.sqlite.prepare("SELECT theme_id FROM cms_theme_preferences WHERE account_id=? AND scope='account' AND is_active=1").get(accountA);
    const prefB = DB.sqlite.prepare("SELECT theme_id FROM cms_theme_preferences WHERE account_id=? AND scope='account' AND is_active=1").get(accountB);
    assert.equal(prefA.theme_id, id);
    assert.equal(prefB.theme_id, 'theme-other-user');
    const blocked = await json(await call(DB, 'DELETE', '/api/studio/themes/' + id));
    assert.equal(blocked.status, 409);
    await call(DB, 'POST', '/api/studio/themes/theme-preset/apply', {});
    const archived = await json(await call(DB, 'DELETE', '/api/studio/themes/' + id));
    assert.equal(archived.status, 200);
    assert.equal(archived.body.theme.status, 'archived');
    const restored = await json(await call(DB, 'POST', '/api/studio/themes/' + id + '/restore', {}));
    assert.equal(restored.status, 200);
    assert.equal(restored.body.theme.status, 'active');
  } finally { DB.close(); }
});

test('unauthorized and cross-origin mutations are rejected', async () => {
  const DB = fixture();
  try {
    const unauthorized = await json(await handleStudioThemes(request('GET', '/api/studio/themes'), { DB }, null));
    assert.equal(unauthorized.status, 401);
    const deniedOrigin = await json(await call(DB, 'POST', '/api/studio/themes', { name: 'Nope' }, accountA, { origin: 'https://evil.example' }));
    assert.equal(deniedOrigin.status, 403);
  } finally { DB.close(); }
});
