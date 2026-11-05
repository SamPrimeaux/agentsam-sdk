import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(
  new URL('../frontend/static/js/theme-project-editor-bootstrap.mjs', import.meta.url), 'utf8',
).replace(/^import .*;$/gm, '');

async function bootEditor(search) {
  const errors = [], calls = [], replaced = [];
  let mountHost = null;
  let frameLoad = null;
  const errorNode = { hidden: true, textContent: '' };
  const frame = {
    srcdoc: '',
    addEventListener(name, cb) {
      assert.equal(name, 'load');
      frameLoad = cb;
    },
  };
  const project = { id: 'theme_right', name: 'My private draft', revision: 1, pages: [{ slug: 'home', title: 'Home' }] };
  const assigned = [];
  const top = { location: { assign(path) { assigned.push(path); }, hash: '' } };
  const href = 'https://cms.test/admin/theme-project-editor' + search;
  const vmWindow = { top };
  const context = {
    console: { error: (...args) => errors.push(args.map(String).join(':')) },
    location: { href, search, replace: path => assigned.push(path) },
    history: { state: null, replaceState: (...args) => replaced.push(args[2]) },
    window: vmWindow,
    document: { getElementById(id) {
      if (id === 'theme-project-error') return errorNode;
      if (id === 'theme-project-editor-frame') return frame;
      return null;
    }},
    URL, URLSearchParams, TextDecoder, FormData,
    fetch: async path => {
      calls.push(path);
      if (path === '/api/admin/cms/theme-projects?site_id=site_a') return Response.json({
        ok: true, projects: [{ id: 'theme_right', pages: [{ slug: 'home' }] }, { id: 'theme_other', pages: [{ slug: 'home' }] }],
      });
      if (path === '/api/admin/cms/theme-projects/theme_right?site_id=site_a') return Response.json({ ok: true, project });
      throw new Error('unexpected_api_request:' + path);
    },
    createThemeProjectAdapter: () => ({}),
    createThemeEditorBridge: () => ({}),
    repairEmptyThemeBlockControls: p => ({ project: p, changed: false }),
    inheritDefaultTemplates: p => ({ project: p, changed: false }),
    mountThemeEditor: (_frame, host) => { mountHost = host; return Promise.resolve(); },
  };
  runInNewContext(source, context, { filename: 'theme-project-editor-bootstrap.mjs' });
  await new Promise(resolve => setTimeout(resolve, 12));
  return { errorNode, errors, calls, replaced, frame, top, getMountHost: () => mountHost, onFrameLoad: () => frameLoad?.(), assigned };
}

test('explicit theme deep link cannot fall through to a different project on the same site', async () => {
  const state = await bootEditor('?site_id=site_a&project=theme_missing');
  assert.equal(state.errorNode.hidden, false);
  assert.ok(state.errors.some(text => text.includes('theme_project_not_found_for_site')));
  assert.deepEqual(state.calls, ['/api/admin/cms/theme-projects?site_id=site_a']);
  assert.equal(state.frame.srcdoc, '');
});

test('project editor refuses missing website identity and ambiguous project selection', async () => {
  const missingSite = await bootEditor('?project=theme_right');
  assert.equal(missingSite.errorNode.hidden, false);
  assert.ok(missingSite.errors.some(text => text.includes('theme_project_site_required')));
  assert.deepEqual(missingSite.calls, []);
  const ambiguous = await bootEditor('?site_id=site_a');
  assert.ok(ambiguous.errors.some(text => text.includes('theme_project_selection_required')));
  assert.equal(ambiguous.frame.srcdoc, '');
});

test('authorized project opens the same site and its existing code editor; desktop stays in SPA', async () => {
  const state = await bootEditor('?site_id=site_a&project=theme_right');
  assert.equal(state.errorNode.hidden, true, state.errors.join(';'));
  assert.equal(state.calls.length, 2);
  assert.match(state.frame.srcdoc, /theme-editor\/editor\.css/);
  state.onFrameLoad();
  await Promise.resolve();
  assert.equal(typeof state.getMountHost()?.onEditCode, 'function');
  state.getMountHost().onEditCode();
  assert.equal(state.assigned.length, 1);
  assert.equal(state.assigned[0], '/apps/ecommerce-cms-agentsam?page=%2Fadmin%2Ftheme-code-editor&project=theme_right&site_id=site_a');
});
