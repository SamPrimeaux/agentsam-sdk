import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { readFileSync } from 'node:fs';

const hostConfig = readFileSync(new URL('../frontend/public/admin/host-config.js', import.meta.url), 'utf8');

function extractFunction(startMarker, endMarker) {
  const start = hostConfig.indexOf(startMarker);
  const end = hostConfig.indexOf(endMarker, start);
  assert.ok(start >= 0, 'Missing host helper: ' + startMarker);
  assert.ok(end > start, 'Missing host helper boundary: ' + endMarker);
  return hostConfig.slice(start, end);
}

test('static Console conversation pin and rename preserve the existing Work store', () => {
  const code = extractFunction(
    '  function updateStoredTrail(id, transform) {',
    '  async function patchRegisteredProject(',
  );
  const persisted = {
    version: 5,
    state: {
      trails: [{ id: 'trail-1', title: 'Original', pinned: false, updatedAt: 10, messages: [{ role: 'user' }] }],
      drafts: { 'trail-1': 'keep this draft' },
      unrelatedPreference: { keep: true },
    },
  };
  let eventName = '';
  const storage = new Map([['agentsam-work-v1', JSON.stringify(persisted)]]);
  const context = {
    window: {
      localStorage: {
        getItem: key => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, value),
      },
      dispatchEvent: event => { eventName = event.type; },
    },
    CustomEvent: class CustomEvent { constructor(type) { this.type = type; } },
  };
  runInNewContext(code + '\nthis.updateStoredTrail = updateStoredTrail;', context);

  assert.equal(context.updateStoredTrail('trail-1', trail => ({ ...trail, pinned: !trail.pinned })), true);
  let saved = JSON.parse(storage.get('agentsam-work-v1'));
  assert.equal(saved.state.trails[0].pinned, true);
  assert.equal(saved.state.drafts['trail-1'], 'keep this draft');
  assert.deepEqual(saved.state.unrelatedPreference, { keep: true });
  assert.equal(saved.version, 5);
  assert.equal(eventName, 'agentsam:workspace-navigation');

  assert.equal(context.updateStoredTrail('trail-1', trail => ({ ...trail, title: 'Renamed', updatedAt: 42 })), true);
  saved = JSON.parse(storage.get('agentsam-work-v1'));
  assert.equal(saved.state.trails[0].title, 'Renamed');
  assert.equal(saved.state.trails[0].updatedAt, 42);
  assert.equal(context.updateStoredTrail('missing', trail => trail), false);
});

test('static Console project pin and rename use the existing authenticated project API', async () => {
  const code = extractFunction(
    '  async function patchRegisteredProject(id, patch, failureMessage) {',
    '  function workspaceNavigation() {',
  );
  const requests = [];
  const alerts = [];
  let refreshes = 0;
  let fail = false;
  const context = {
    fetch: async (url, init) => {
      requests.push({ url, init });
      return { ok: !fail, status: fail ? 403 : 200 };
    },
    refreshWorkspaceProjects: async () => { refreshes += 1; },
    encodeURIComponent,
    window: { alert: message => alerts.push(message) },
    console: { error: () => {} },
  };
  runInNewContext(code + '\nthis.patchRegisteredProject = patchRegisteredProject;', context);

  assert.equal(await context.patchRegisteredProject('project 1', { starred: true }, 'Could not pin.'), true);
  assert.equal(requests[0].url, '/api/projects/project%201');
  assert.equal(requests[0].init.method, 'PATCH');
  assert.equal(requests[0].init.credentials, 'same-origin');
  assert.deepEqual(JSON.parse(requests[0].init.body), { starred: true });
  assert.equal(refreshes, 1);

  fail = true;
  assert.equal(await context.patchRegisteredProject('project 1', { name: 'Renamed' }, 'Could not rename.'), false);
  assert.equal(alerts[0], 'Could not rename.');
  assert.equal(refreshes, 1);
});

test('both shell hosts expose the same workspace rename and pin actions', () => {
  const reactShell = readFileSync(new URL('../frontend/agentsam/AgentSamShell.tsx', import.meta.url), 'utf8');
  assert.match(hostConfig, /onPinConversation:id=>/);
  assert.match(hostConfig, /onRenameConversation:\(id,title\)=>/);
  assert.match(hostConfig, /onPinProject:id=>/);
  assert.match(hostConfig, /onRenameProject:\(id,name\)=>/);
  assert.match(reactShell, /onPinProject:/);
  assert.match(reactShell, /onRenameProject:/);
  assert.match(reactShell, /onPinConversation: state\.pinTrail, onRenameConversation: state\.renameTrail/);
});
