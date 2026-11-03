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
    location: { search: '', assign(path) { navigations.push(['document', path]); } },
  };
  runInNewContext(source, { window, URLSearchParams, URL });
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

test('Pages leads to content editor and exposes the visual editor without unsafe bulk controls', () => {
  const pages = readFileSync(new URL('../frontend/static/pages.html', import.meta.url), 'utf8');
  assert.ok(pages.includes('const editHref = `/admin/page-edit?${query}`'));
  assert.ok(pages.includes('const designHref = `/admin/theme-editor?${query}`'));
  assert.ok(!pages.includes('id="cms-bootstrap-btn"'));
  assert.ok(pages.includes('id="add-page-btn"'), 'the real Add Page API now has a matching control');
  assert.ok(pages.includes('window.cmsAdminNavigate("/admin/page-edit?" + query.toString())'),
    'new pages should open their own Page Editor');
  assert.ok(!pages.includes('id="pages-select-all"'));
});

test('portable Page Editor never hardcodes a specific merchant brand or domain', () => {
  const editor = readFileSync(new URL('../frontend/static/page-edit.html', import.meta.url), 'utf8');
  assert.ok(!editor.includes('fuelnfreetime.com') && !editor.includes('Fuel & Free Time'));
  assert.ok(editor.includes('Site address not verified'));
  assert.ok(editor.includes('window.cmsAdminNavigate'));
  assert.ok(editor.includes('viewButton.removeAttribute("href")'));
  assert.ok(editor.includes('const isPublicPage = pageData.status === "published"'));
  assert.ok(!editor.includes('const liveUrl = PAGE_ROUTES[slug] || "/"'));
  assert.ok(!editor.includes('Use Publish or run CMS bootstrap'));
});
