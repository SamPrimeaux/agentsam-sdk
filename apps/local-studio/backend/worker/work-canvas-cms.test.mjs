import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { createCmsTestDb, seedCmsAccountAndSite } from '../../../ecommerce-cms-agentsam/tests/cms-test-db.mjs';
import { getThemeProject, saveThemeProject, listThemeProjectHistory } from '../../../ecommerce-cms-agentsam/backend/cms/theme-project-store.mjs';
import { createThemeProjectAdapter, renderThemePage } from '../../../ecommerce-cms-agentsam/frontend/theme-editor/project.mjs';
import { canvasToThemeProject, inspectCanvasCmsCompatibility, safeCanvasCmsUrl, createCanvasCmsDraft, handleCanvasCms } from './work-canvas-cms.js';

const require = createRequire(new URL('../../../ecommerce-cms-agentsam/package.json', import.meta.url));
const { JSDOM } = require('jsdom');
const owner = 'au_canvas_test';
const node = (id, type, props = {}) => ({ id, type, name: id, x: 0, y: 0, width: 400, height: 70, style: {}, ...props });
function document() {
  return { version: 1, name: 'Independent creation', host: 'web', tokens: { '--brand': '#253aff' },
    assets: [], dataRequirements: [], provenance: { run_id: 'run_actual' },
    artboards: [
      { id: 'home', name: 'Home', width: 1200, height: 800, nodes: [
        node('hero', 'frame', { width: 1200, height: 650, style: { backgroundColor: '#111222' }, children: [
          node('heading', 'text', { text: 'Original heading', x: 40, y: 40, style: { color: '#ffffff', fontSize: 40 } }),
          node('cta', 'button', { text: 'Read more', x: 40, y: 140, action: { type: 'navigate', target: 'about' } }),
          node('media', 'image', { x: 600, y: 40, width: 500, height: 500, src: 'https://assets.example.test/art.webp' }),
        ] }),
      ] },
      { id: 'about', name: 'About', width: 1200, height: 700, nodes: [
        node('about_section', 'frame', { width: 1200, height: 600, text: 'Group label', children: [
          node('about_text', 'text', { text: 'Actual authored content', x: 40, y: 40 }),
        ] }),
      ] },
    ] };
}
const source = { id: 'canvas_saved', revision: 4, content_hash: 'a'.repeat(64) };
function environment(db) {
  const objects = new Map();
  return { objects, env: {
    DB: { prepare(sql) {
      let params = [];
      const statement = {
        bind(...values) { params = values; return statement; },
        async first() { return db.prepare(sql).get(...params) || null; },
        async all() { return { results: db.prepare(sql).all(...params) }; },
        async run() { return { meta: { changes: db.prepare(sql).run(...params).changes } }; },
      };
      return statement;
    } },
    WEBSITE_ASSETS: {
      async put(key, body) { objects.set(key, String(body)); },
      async get(key) { return objects.has(key) ? { text: async () => objects.get(key) } : null; },
    },
  } };
}

test('conversion creates canonical editable sections/blocks and preserves source identities', () => {
  const original = document(), frozen = structuredClone(original);
  const result = canvasToThemeProject(original, source, 'canvas_converted');
  assert.deepEqual(original, frozen, 'Conversion must never mutate the Canvas');
  assert.deepEqual(result.sourceCanvas, source);
  assert.deepEqual(result.pages.map(page => page.slug), ['home', 'about']);
  assert.equal(result.pages[0].sections[0].key, 'hero');
  assert.deepEqual(result.pages[0].sections[0].content.__editor.blocks.map(block => block.id), ['heading', 'cta', 'media']);
  assert.equal(result.pages[0].sections[0].content.cta.node_cta_href, '/about');
  assert.match(result.pages[0].template, /@media\(max-width:640px\)/);
  assert.ok(result.pages[0].sections[0].schema.blocks.find(block => block.key === 'media').fields.some(field => field.type === 'media'));
  assert.doesNotMatch(JSON.stringify(result), /<script|javascript:/i);
});

test('canonical editor modifies an individual block, duplicates it, previews and reopens', async () => {
  const win = new JSDOM('').window, previous = globalThis.DOMParser;
  globalThis.DOMParser = win.DOMParser;
  let stored = canvasToThemeProject(document(), source, 'canvas_converted');
  stored.revision = 1;
  const store = { get: async () => structuredClone(stored), save: async (value, options) => {
    assert.equal(options.expectedVersion, stored.revision);
    stored = structuredClone(value);
    return structuredClone(stored);
  } };
  try {
    const adapter = createThemeProjectAdapter(stored, store);
    const page = await adapter.getPage('home'), content = structuredClone(page.sections[0].content);
    content.heading.node_heading_text = 'Updated heading';
    await adapter.saveDraft('home', 'hero', content, 0);
    await adapter.duplicateBlock('home', 'hero', 'heading');
    const reopened = createThemeProjectAdapter(await store.get(), store);
    const edited = await reopened.getPage('home');
    assert.equal(edited.sections[0].content.heading.node_heading_text, 'Updated heading');
    assert.equal(edited.sections[0].content.cta.node_cta_text, 'Read more');
    assert.equal(edited.sections[0].content.__editor.blocks.length, 4);
    const dom = new win.DOMParser().parseFromString(renderThemePage(edited), 'text/html');
    assert.equal(dom.querySelector('[data-theme-block-id="heading"]').textContent, 'Updated heading');
    assert.equal(dom.querySelector('[data-theme-block-id="cta"]').getAttribute('href'), '/about');
    assert.equal(dom.querySelector('[data-theme-block-id="media"]').getAttribute('src'), 'https://assets.example.test/art.webp');
    const about = new win.DOMParser().parseFromString(renderThemePage(await reopened.getPage('about')), 'text/html');
    assert.match(about.body.textContent, /Group label/);
    assert.match(about.body.textContent, /Actual authored content/, 'Root text editing cannot erase child blocks');
    await assert.rejects(() => reopened.publish('home'), /theme_publish_adapter_not_configured/);
  } finally { globalThis.DOMParser = previous; win.close(); }
});

test('unsupported bindings, interactions, unsafe assets and styles block conversion', () => {
  const cases = [
    doc => { doc.dataRequirements = [{ operation: 'checkout' }]; },
    doc => { doc.artboards[0].nodes[0].binding = { resource: 'products' }; },
    doc => { doc.artboards[0].nodes[0].children[1].action = { type: 'submit', target: '/pay' }; },
    doc => { doc.artboards[0].nodes[0].children[2].src = 'javascript:alert(1)'; },
    doc => { doc.artboards[0].nodes[0].style.background = 'url(https://tracker.test/x)'; },
    doc => { doc.artboards[0].nodes[0].children[0].id = 'hero'; },
    doc => { doc.artboards[0].nodes[0].children[1].action = undefined; },
  ];
  for (const mutate of cases) {
    const input = document(); mutate(input);
    assert.equal(inspectCanvasCmsCompatibility(input).compatible, false);
    assert.throws(() => canvasToThemeProject(input, source, 'converted'), /canvas_cms_incompatible/);
  }
  for (const unsafe of ['//outside.test', 'javascript:alert(1)', 'data:text/html,x', 'https://user:pass@outside.test', '/\\outside.test']) {
    assert.equal(safeCanvasCmsUrl(unsafe), false, unsafe);
  }
});

test('canonical D1/R2 draft creation is idempotent, isolated by owner/site, and never publishes', async () => {
  const db = createCmsTestDb(), { env, objects } = environment(db);
  seedCmsAccountAndSite(db, { accountId: owner, siteId: 'site_canvas' });
  seedCmsAccountAndSite(db, { accountId: 'au_someone_else', siteId: 'site_other' });
  const snapshot = { canvas: { id: source.id, revision: source.revision, contentHash: source.content_hash }, document: document() };
  const original = structuredClone(snapshot);
  try {
    const first = await createCanvasCmsDraft(env, owner, snapshot, 'site_canvas');
    assert.equal(first.ok, true);
    assert.equal(first.published, false);
    assert.equal(first.unchanged, false);
    assert.match(first.editor_url, /^\/admin\/theme-project-editor\?project=canvas_/);
    const initial = await getThemeProject(env, owner, first.project_id, 'site_canvas');
    assert.deepEqual(initial.project.sourceCanvas, source);
    const changed = structuredClone(initial.project);
    changed.pages[0].sections[0].content.heading.node_heading_text = 'CMS-only revision';
    assert.equal((await saveThemeProject(env, owner, first.project_id, changed, 1, 'site_canvas')).ok, true);
    const retry = await createCanvasCmsDraft(env, owner, snapshot, 'site_canvas');
    assert.equal(retry.project_id, first.project_id);
    assert.equal(retry.unchanged, true);
    assert.equal(retry.revision, 2);
    const reopened = await getThemeProject(env, owner, first.project_id, 'site_canvas');
    assert.equal(reopened.project.pages[0].sections[0].content.heading.node_heading_text, 'CMS-only revision');
    assert.equal((await listThemeProjectHistory(env, owner, first.project_id, 'site_canvas')).revisions.length, 2);
    assert.deepEqual(snapshot, original);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM cms_publications').get().n, 0);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM cms_globals WHERE status='published'").get().n, 0);
    assert.ok(objects.size >= 2);
    await assert.rejects(() => createCanvasCmsDraft(env, owner, snapshot, 'site_other'), /cms_site_not_found/);
    assert.equal((await getThemeProject(env, 'au_someone_else', first.project_id, 'site_canvas')).ok, false);
  } finally { db.close(); }
});

test('conversion handler rejects unauthenticated, cross-origin and publish requests before writes', async () => {
  const request = (body = {}, origin = 'https://studio.test') => new Request('https://studio.test/api/work/canvases/canvas_saved/cms/convert', {
    method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  assert.equal((await handleCanvasCms(request(), {}, null, 'canvas_saved', 'convert')).status, 401);
  assert.equal((await handleCanvasCms(request({}, 'https://outside.test'), {}, owner, 'canvas_saved', 'convert')).status, 403);
  assert.equal((await handleCanvasCms(request({ site_id: 'site_canvas', expected_revision: 4, publish: true }), {}, owner, 'canvas_saved', 'convert')).status, 400);
  assert.equal((await handleCanvasCms(request(), {}, owner, 'canvas_saved', 'publish')).status, 404);
});
