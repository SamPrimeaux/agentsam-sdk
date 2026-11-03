import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('../frontend/static/js/pages-shared.js', import.meta.url), 'utf8');

function mountPageController(host) {
  const navigations = [];
  const window = {
    __agentsamAdminNavigate: host
      ? (path) => { navigations.push(['host', path]); return true; }
      : undefined,
    location: { assign(path) { navigations.push(['document', path]); } },
  };
  runInNewContext(source, { window });
  return { window, navigations };
}

test('installed Page Editor forwards programmatic navigation to Local Studio rather than unloading its webview', () => {
  const { window, navigations } = mountPageController(true);
  window.cmsAdminNavigate('/admin/page-edit?slug=about');
  window.cmsAdminNavigate('/admin/theme-editor?slug=shop');
  assert.deepEqual(navigations, [
    ['host', '/admin/page-edit?slug=about'],
    ['host', '/admin/theme-editor?slug=shop'],
  ]);
});

test('standalone Ecommerce Page Editor retains normal document navigation', () => {
  const { window, navigations } = mountPageController(false);
  window.cmsAdminNavigate('/admin/page-edit?slug=home');
  assert.deepEqual(navigations, [['document', '/admin/page-edit?slug=home']]);
});

test('portable Page Editor never hardcodes a specific merchant brand or domain', () => {
  const editor = readFileSync(new URL('../frontend/static/page-edit.html', import.meta.url), 'utf8');
  assert.ok(!editor.includes('fuelnfreetime.com') && !editor.includes('Fuel & Free Time'));
  assert.ok(editor.includes('Site address not verified'));
  assert.ok(editor.includes('window.cmsAdminNavigate'));
});
