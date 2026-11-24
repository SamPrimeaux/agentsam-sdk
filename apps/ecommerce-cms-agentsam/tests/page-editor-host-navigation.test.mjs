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

test('Pages leads to content editor and keeps theme composition separate', () => {
  const pages = readFileSync(new URL('../frontend/static/pages.html', import.meta.url), 'utf8');
  assert.ok(pages.includes('const editHref = `/admin/page-edit?${query}`'));
  assert.ok(pages.includes('allPages=canonicalPages'), 'merchant Pages lists real site-owned pages');
  assert.ok(!pages.includes('const themePage = p.source'), 'theme-project placeholders must not navigate merchants to Theme Studio');
  assert.ok(!pages.includes('id="pages-site-select"'), 'store selection belongs to the global profile menu');
  assert.ok(!pages.includes('id="cms-bootstrap-btn"'));
  assert.ok(pages.includes('id="add-page-btn"'), 'the real Add Page API now has a matching control');
  assert.ok(pages.includes('window.cmsAdminNavigate("/admin/page-edit?" + query.toString())'),
    'new pages should open their own Page Editor');
  assert.ok(!pages.includes("cmsAdminFetch('/api/admin/cms/theme-projects"), 'page inventory must not fetch Theme Studio projects');
  assert.ok(pages.includes('new:"1"'), 'Add Page opens the full independent Page Editor');
  assert.ok(pages.includes('pages-visibility-filter'), 'visibility filter belongs to native Pages list');
  assert.ok(!pages.includes('id="pages-select-all"'));
});

test('merchant Page Editor is a separate, responsive content and SEO surface', () => {
  const editor = readFileSync(new URL('../frontend/static/page-edit.html', import.meta.url), 'utf8');
  const js = readFileSync(new URL('../frontend/static/js/page-editor-review.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../frontend/static/css/page-editor-review.css', import.meta.url), 'utf8');
  assert.match(editor, /page-editor-review\.js/);
  assert.match(editor, /page-editor-review\.css/);
  assert.ok(!editor.includes('fuelnfreetime.com') && !js.includes('Fuel & Free Time'));
  assert.ok(!js.includes('No editor schema for this section yet'));
  assert.ok(!js.includes('/admin/theme-editor'), 'page editor must not redirect to Theme Studio');
  for (const control of ['pe-title','pe-body','pe-format','pe-seo-fields','pe-handle','pe-template',
    'pe-save','pe-preview-action','pe-publish-action','pe-duplicate','pe-more-menu']) {
    assert.ok(js.includes(control), 'missing interactive Page Editor control '+control);
  }
  assert.match(js, /content-draft/);
  assert.ok(js.includes('pe-section-source-note'), 'section-based pages must not look like empty body-only pages');
  assert.ok(js.includes('savedSections'), 'Page Editor must report the canonical saved section count');
  assert.ok(js.includes('Edit sections in Theme Studio'), 'Page Editor must link to the actual section owner');
  assert.ok(js.includes('Edit inherited theme template'), 'empty pages must link to their selected theme template');
  assert.ok(js.includes('projectResult?.project?.pages'), 'the inherited template link must resolve against the real theme project');
  assert.doesNotMatch(js, /\/route/, 'saving a draft must not move a published route');
  assert.ok(css.includes('.pe-section-source-note'), 'the section source notice uses the existing theme tokens');
  assert.ok(js.includes('initialNewPage'), 'new pages share the same editor as existing pages');
  assert.ok(js.includes('cmsAdminFetch("/api/admin/cms/pages",{'), 'first save creates a canonical CMS draft');
  assert.match(js, /cmsAdminFetch/);
  assert.match(js, /cmsPublicPageUrl/);
  assert.match(js, /document\.execCommand/);
  assert.match(css, /@media\(max-width:700px\)/);
  assert.match(css, /var\(--c-surface\)/);
});

test('page review drafts are tenant-scoped and cannot silently publish', () => {
  const api = readFileSync(new URL('../backend/cms/api.js', import.meta.url), 'utf8');
  assert.match(api, /cms_page_drafts/);
  assert.match(api, /getPageAdminForSite\(env, context\.accountId/);
  assert.match(api, /ON CONFLICT\(page_id,user_id\)/);
  assert.match(api, /publish_ready: false/);
});

test('merchant page URL edits stay private until the verified publication commits the new route and redirect', () => {
  const frontend = readFileSync(new URL('../frontend/static/js/page-editor-review.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../frontend/static/css/page-editor-review.css', import.meta.url), 'utf8');
  const api = readFileSync(new URL('../backend/cms/api.js', import.meta.url), 'utf8');
  assert.match(frontend, /currentRoute\(d\.url_handle\)/);
  assert.match(frontend, /content-draft/);
  assert.doesNotMatch(frontend, /\/route/);
  assert.match(frontend, /new URL stays in your draft until you publish/);
  assert.match(frontend, /new URL and old-URL redirect will go live together when you publish/);
  assert.match(frontend, /created\?\.page\?\.id/);
  assert.match(frontend, /page_id",page\.id/);
  assert.match(frontend, /pe-discard/);
  assert.match(frontend, /publishDockEdit\?\.\(\{active:false/);
  assert.match(css, /\.pe-savebar\[hidden\]\{display:none!important;\}/);
  assert.match(css, /position:fixed;top:125px/);
  assert.match(api, /m = path\.match\(\/\^\\\/api\\\/admin\\\/cms\\\/pages/);
  assert.match(api, /metadata\.route_redirects/);
  assert.match(api, /WHERE id=\? AND site_id=\? AND slug=\? AND route_path=\?/);
  assert.match(api, /A page already uses that URL/);
  assert.match(api, /cms_page_route_change_requires_publish/);
});
