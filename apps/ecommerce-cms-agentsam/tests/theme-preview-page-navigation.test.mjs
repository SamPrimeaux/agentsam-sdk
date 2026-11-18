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
