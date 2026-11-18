import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { cmsPageEditorPath } from '../frontend/theme-editor/routes.mjs';

const source = readFileSync(new URL('../frontend/static/js/theme-editor.js', import.meta.url), 'utf8');
const anchor = "window.addEventListener('message', function (event) {";
const begin = source.indexOf(anchor, source.indexOf('// A published storefront is cross-origin'));
const end = source.indexOf('\n  });', begin);
assert.ok(begin >= 0 && end > begin, 'CMS preview bridge must be present in the editor source');
const handlerSource = source.slice(begin, end + '\n  });'.length);

function setup() {
  let listener = null;
  const frameWindow = {};
  const frame = {
    contentWindow: frameWindow,
    getAttribute(key) {
      return key === 'src' ? 'https://inneranimalmedia.com/?preview=1' : null;
    },
  };
  const changes = [];
  const context = {
    window: { addEventListener(type, fn) { if (type === 'message') listener = fn; } },
    host: { siteId: 'inneranimalmedia', pageRoutes: { home: '/', about: '/about' } },
    byId(key) { return key === 'theme-preview' ? frame : null; },
    location: { href: 'https://agentsam.inneranimalmedia.com/admin/sites/inneranimalmedia/pages/page_home/editor' },
    pages: [{ slug: 'home', route_path: '/' }, { slug: 'about', route_path: '/about' }],
    slug: 'home',
    switchPage(next) { changes.push(next); },
    URL,
  };
  runInNewContext(handlerSource, context);
  return { frameWindow, listener, changes };
}

test('verified storefront navigation selects the correct CMS page', () => {
  const { frameWindow, listener, changes } = setup();
  listener({
    source: frameWindow, origin: 'https://inneranimalmedia.com',
    data: { type: 'agentsam:cms-preview:page-navigation', pathname: '/about' },
  });
  assert.deepEqual(changes, ['about']);
  assert.equal(
    cmsPageEditorPath('inneranimalmedia', 'page_inneranimalmedia_about', 'about'),
    '/admin/sites/inneranimalmedia/pages/page_inneranimalmedia_about/editor'
  );
});

test('cross-origin forgery and unknown routes do not switch pages', () => {
  const { frameWindow, listener, changes } = setup();
  listener({
    source: frameWindow, origin: 'https://untrusted.example',
    data: { type: 'agentsam:cms-preview:page-navigation', pathname: '/about' },
  });
  listener({
    source: {}, origin: 'https://inneranimalmedia.com',
    data: { type: 'agentsam:cms-preview:page-navigation', pathname: '/about' },
  });
  listener({
    source: frameWindow, origin: 'https://inneranimalmedia.com',
    data: { type: 'agentsam:cms-preview:page-navigation', pathname: '/unknown' },
  });
  assert.deepEqual(changes, []);
});

const clickAnchor = "doc.addEventListener('click', function(event) {";
const clickBegin = source.indexOf(clickAnchor, source.indexOf('function bindPreviewSelection'));
const clickEnd = source.indexOf('\n      });', clickBegin);
assert.ok(clickBegin >= 0 && clickEnd > clickBegin, 'installed-theme preview click router must be present');
const clickHandlerSource = source.slice(clickBegin, clickEnd + '\n      });'.length);

function setupProjectClick(href) {
  let listener = null;
  const doc = {
    baseURI: 'https://themes.inneranimalmedia.com/theme-packages/iapj/0.3.0/preview/',
    addEventListener(type, fn) { if (type === 'click') listener = fn; },
  };
  const link = { getAttribute(key) { return key === 'href' ? href : null; } };
  const changes = [];
  const notes = [];
  let prevented = false;
  let stopped = false;
  const event = {
    target: { closest() { return link; } },
    metaKey: false, ctrlKey: false, shiftKey: false, altKey: false,
    preventDefault() { prevented = true; },
    stopImmediatePropagation() { stopped = true; },
  };
  const context = {
    doc,
    host: {
      projectId: 'theme_iapj',
      pageRoutes: { home: '/', work: '/work/', about: '/about/', blog: '/blog/' },
    },
    pages: [
      { slug: 'home', route: '/' },
      { slug: 'work', route: '/work/' },
      { slug: 'about', route: '/about/' },
      { slug: 'blog', route: '/blog/' },
    ],
    location: { origin: 'https://agentsam.inneranimalmedia.com', href: 'https://agentsam.inneranimalmedia.com/admin/sites/site/themes/theme_iapj/editor/home' },
    window: { __agentsamCmsGlobalInspectMode: true },
    inspectionEnabled: false,
    slug: 'home',
    switchPage(next) { changes.push(next); },
    setNote(...args) { notes.push(args); },
    URL,
  };
  runInNewContext(clickHandlerSource, context);
  return {
    listener, event, changes, notes,
    get prevented() { return prevented; },
    get stopped() { return stopped; },
  };
}

test('installed-theme navigation still switches pages during global inspect mode', () => {
  const { listener, event, changes, prevented, stopped } = setupProjectClick('/work');
  listener(event);
  assert.deepEqual(changes, ['work']);
  assert.equal(prevented, true);
  assert.equal(stopped, true);
});

test('relative package links resolve to project routes, not the Theme Store preview path', () => {
  const { listener, event, changes, prevented } = setupProjectClick('about');
  listener(event);
  assert.deepEqual(changes, ['about']);
  assert.equal(prevented, true);
});

test('unknown internal theme links fail closed instead of opening the Theme Store', () => {
  const { listener, event, changes, notes, prevented, stopped } = setupProjectClick('/products/example');
  listener(event);
  assert.deepEqual(changes, []);
  assert.equal(prevented, true);
  assert.equal(stopped, true);
  assert.match(notes[0]?.[0] || '', /cannot open the Theme Store/);
});

test('external and fragment links retain their normal behavior', () => {
  const external = setupProjectClick('https://example.com/about');
  external.listener(external.event);
  assert.equal(external.prevented, false);
  assert.deepEqual(external.changes, []);

  const fragment = setupProjectClick('#latest');
  fragment.listener(fragment.event);
  assert.equal(fragment.prevented, false);
  assert.deepEqual(fragment.changes, []);
});
