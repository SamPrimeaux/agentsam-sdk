import test from 'node:test';
import assert from 'node:assert/strict';
import { handleStudioCompanionSettings } from './studio-user-preferences.js';

function memoryDb(initial = {}) {
  const rows = new Map(Object.entries(initial));
  return {
    rows,
    prepare(sql) {
      return {
        bind(...args) {
          if (sql.startsWith('SELECT')) {
            return { first: async () => rows.has(args[0]) ? { ui_preferences_json: rows.get(args[0]) } : null };
          }
          return { run: async () => { rows.set(args[0], args[1]); return { success: true }; } };
        },
      };
    },
  };
}

const request = (method = 'GET', body) => new Request('https://agentsam.inneranimalmedia.com/api/settings/companions', {
  method,
  headers: method === 'PUT' ? { origin: 'https://agentsam.inneranimalmedia.com', 'content-type': 'application/json' } : {},
  body: body === undefined ? undefined : JSON.stringify(body),
});

const defaults = { activeId: 'geaux', secondaryId: null, desktopBuddyEnabled: false, onboarding: null, customCompanions: [] };

const custom = {
  id: 'custom_12345678-1234-4234-8234-123456789abc',
  name: 'Moss', animal: 'Red panda', role: 'Research companion',
  description: 'A patient research partner who gathers clues and organizes discoveries.',
  personality: 'Curious and thoughtful', visualNotes: 'Rust red coat, cream face, dark paws.',
  signatureAction: 'Unrolls a field notebook', imageUrl: null,
  stateAssets: { idle: '/brand/inneranimal-companions/v1/custom/moss/idle.png', working: '/brand/inneranimal-companions/v1/custom/moss/working.png' },
  brandName: '', commissioningMode: 'personal',
};

test('companion settings default to Geaux without creating a second storage table', async () => {
  const db = memoryDb();
  const response = await handleStudioCompanionSettings(request(), { DB: db }, 'acct-1');
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).settings, defaults);
  assert.equal(db.rows.size, 0, 'GET does not create or mutate the preference row');
});

test('Bella is accepted as a built-in companion and can be selected without a custom profile', async () => {
  const db = memoryDb();
  const saved = await handleStudioCompanionSettings(request('PUT', { activeId: 'bella', customCompanions: [] }), { DB: db }, 'acct-bella');
  assert.equal(saved.status, 200);
  assert.deepEqual((await saved.json()).settings, { ...defaults, activeId: 'bella' });
  const loaded = await handleStudioCompanionSettings(request(), { DB: db }, 'acct-bella');
  assert.deepEqual((await loaded.json()).settings, { ...defaults, activeId: 'bella' });
});

test('companion selection and custom creation preserve unrelated account preferences', async () => {
  const db = memoryDb({ 'acct-1': JSON.stringify({ settings_general: { openLastProject: true }, account_avatar_url: '/brand/avatar.png' }) });
  const body = { activeId: custom.id, customCompanions: [custom] };
  const saved = await handleStudioCompanionSettings(request('PUT', body), { DB: db }, 'acct-1');
  assert.equal(saved.status, 200);
  assert.deepEqual((await saved.json()).settings, { ...defaults, activeId: custom.id, customCompanions: [custom] });
  const stored = JSON.parse(db.rows.get('acct-1'));
  assert.deepEqual(stored.settings_general, { openLastProject: true });
  assert.equal(stored.account_avatar_url, '/brand/avatar.png');
  const loaded = await handleStudioCompanionSettings(request(), { DB: db }, 'acct-1');
  assert.deepEqual((await loaded.json()).settings, { ...defaults, activeId: custom.id, customCompanions: [custom] });
});

test('companion settings reject unknown active pets and malformed custom records', async () => {
  const db = memoryDb();
  const unknown = await handleStudioCompanionSettings(request('PUT', { activeId: 'not-a-pet', customCompanions: [] }), { DB: db }, 'acct-1');
  assert.equal(unknown.status, 400);
  const malformed = await handleStudioCompanionSettings(request('PUT', { activeId: 'geaux', customCompanions: [{ ...custom, imageUrl: 'javascript:alert(1)' }] }), { DB: db }, 'acct-1');
  assert.equal(malformed.status, 400);
  const invalidState = await handleStudioCompanionSettings(request('PUT', { activeId: 'geaux', customCompanions: [{ ...custom, stateAssets: { 'bad state': '/brand/launch.png' } }] }), { DB: db }, 'acct-1');
  assert.equal(invalidState.status, 400);
  const unsafeAsset = await handleStudioCompanionSettings(request('PUT', { activeId: 'geaux', customCompanions: [{ ...custom, stateAssets: { working: 'javascript:alert(1)' } }] }), { DB: db }, 'acct-1');
  assert.equal(unsafeAsset.status, 400);
  assert.equal(db.rows.size, 0);
});

test('companion settings enforce account session, origin, and database requirements', async () => {
  assert.equal((await handleStudioCompanionSettings(request(), { DB: memoryDb() }, null)).status, 401);
  const crossOrigin = new Request('https://agentsam.inneranimalmedia.com/api/settings/companions', {
    method: 'PUT', headers: { origin: 'https://attacker.example', 'content-type': 'application/json' },
    body: JSON.stringify({ activeId: 'geaux', customCompanions: [] }),
  });
  assert.equal((await handleStudioCompanionSettings(crossOrigin, { DB: memoryDb() }, 'acct-1')).status, 403);
  assert.equal((await handleStudioCompanionSettings(request(), {}, 'acct-1')).status, 503);
});


test('companion selection and custom profiles never cross account boundaries', async () => {
  const db = memoryDb();
  const saved = await handleStudioCompanionSettings(request('PUT', { activeId: custom.id, customCompanions: [custom] }), { DB: db }, 'acct-owner');
  assert.equal(saved.status, 200);
  const otherAccount = await handleStudioCompanionSettings(request(), { DB: db }, 'acct-other');
  assert.deepEqual((await otherAccount.json()).settings, defaults);
});

test('companion settings accept additional animation names and more than 24 custom companions', async () => {
  const db = memoryDb();
  const extraStates = Object.fromEntries(
    Array.from({ length: 16 }, (_, index) => ['action-' + index, '/brand/animations/action-' + index + '.png']),
  );
  const companions = Array.from({ length: 26 }, (_, index) => ({
    ...custom,
    id: 'custom_extra-' + String(index).padStart(8, '0'),
    name: 'Animal ' + index,
    stateAssets: { ...custom.stateAssets, ...extraStates, celebrating: '/brand/animations/celebrating.png' },
  }));
  const saved = await handleStudioCompanionSettings(
    request('PUT', { activeId: companions[25].id, customCompanions: companions }),
    { DB: db }, 'acct-large',
  );
  assert.equal(saved.status, 200);
  const result = (await saved.json()).settings;
  assert.equal(result.customCompanions.length, 26);
  assert.equal(Object.keys(result.customCompanions[0].stateAssets).length, 19);
  assert.equal(result.customCompanions[0].stateAssets.celebrating, '/brand/animations/celebrating.png');
  const reloaded = await handleStudioCompanionSettings(request(), { DB: db }, 'acct-large');
  assert.deepEqual((await reloaded.json()).settings, result);
});

test('companion settings persist draft animation metadata before media is attached', async () => {
  const db = memoryDb();
  const animation = {
    id: 'celebrating', label: 'Celebrating', description: 'A joyful milestone animation',
    src: null, fps: 8, frames: 8, loop: true, kind: 'apng',
  };
  const input = { activeId: custom.id, customCompanions: [{ ...custom, animations: [animation] }] };
  const saved = await handleStudioCompanionSettings(request('PUT', input), { DB: db }, 'acct-animation');
  assert.equal(saved.status, 200);
  const payload = (await saved.json()).settings;
  assert.deepEqual(payload.customCompanions[0].animations, [animation]);
  const reloaded = await handleStudioCompanionSettings(request(), { DB: db }, 'acct-animation');
  assert.deepEqual((await reloaded.json()).settings, payload);

  const invalid = await handleStudioCompanionSettings(
    request('PUT', { ...input, customCompanions: [{ ...custom, animations: [{ ...animation, fps: 0 }] }] }),
    { DB: db }, 'acct-animation',
  );
  assert.equal(invalid.status, 400);
  const badSource = await handleStudioCompanionSettings(
    request('PUT', { ...input, customCompanions: [{ ...custom, animations: [{ ...animation, src: 'javascript:alert(1)' }] }] }),
    { DB: db }, 'acct-animation',
  );
  assert.equal(badSource.status, 400);
});

test('account-owned scenes compose multiple companions and survive edit, reload, and delete', async () => {
  const db = memoryDb();
  const scene = {
    id: 'scene_12345678-1234-4234-8234-123456789abc',
    name: 'Morning briefing', description: 'Companions review the new work',
    backgroundUrl: '/brand/scenes/office.png',
    layers: [
      { id: 'layer_11111111-1234-4234-8234-123456789abc', companionId: 'geaux', stateId: 'thinking', x: 25, y: 65, scale: 1.25 },
      { id: 'layer_22222222-1234-4234-8234-123456789abc', companionId: custom.id, stateId: 'celebrating', x: 76, y: 65, scale: 0.9 },
    ],
  };
  const input = { activeId: custom.id, customCompanions: [custom], scenes: [scene] };
  const created = await handleStudioCompanionSettings(request('PUT', input), { DB: db }, 'acct-scenes');
  assert.equal(created.status, 200);
  assert.deepEqual((await created.json()).settings.scenes, [scene]);
  const loaded = await handleStudioCompanionSettings(request(), { DB: db }, 'acct-scenes');
  assert.deepEqual((await loaded.json()).settings.scenes, [scene]);
  const other = await handleStudioCompanionSettings(request(), { DB: db }, 'acct-other');
  assert.deepEqual((await other.json()).settings, defaults);
  const changed = { ...scene, name: 'Afternoon briefing' };
  const updated = await handleStudioCompanionSettings(request('PUT', { ...input, scenes: [changed] }), { DB: db }, 'acct-scenes');
  assert.equal(updated.status, 200);
  assert.equal((await updated.json()).settings.scenes[0].name, 'Afternoon briefing');
  const removed = await handleStudioCompanionSettings(request('PUT', { ...input, scenes: [] }), { DB: db }, 'acct-scenes');
  assert.equal(removed.status, 200);
  assert.deepEqual((await removed.json()).settings.scenes, []);
});

test('companion scene validation rejects unsafe backgrounds, invalid positions, and unknown actors', async () => {
  const db = memoryDb();
  const scene = {
    id: 'scene_12345678-1234-4234-8234-123456789abc',
    name: 'Night shift', description: '', backgroundUrl: null,
    layers: [{ id: 'layer_12345678-1234-4234-8234-123456789abc', companionId: 'geaux', stateId: 'idle', x: 50, y: 60, scale: 1 }],
  };
  for (const bad of [
    { ...scene, backgroundUrl: 'javascript:alert(1)' },
    { ...scene, layers: [{ ...scene.layers[0], x: 999 }] },
    { ...scene, layers: [{ ...scene.layers[0], companionId: 'not-a-companion' }] },
    { ...scene, layers: [{ ...scene.layers[0], stateId: 'bad state' }] },
  ]) {
    const response = await handleStudioCompanionSettings(request('PUT', { activeId: 'geaux', customCompanions: [], scenes: [bad] }), { DB: db }, 'acct-scene-invalid');
    assert.equal(response.status, 400);
  }
  assert.equal(db.rows.size, 0);
});

test('built-in companions can gain open animation states without overwriting official packages', async () => {
  const db = memoryDb();
  const animation = { id: 'celebrating', label: 'Celebrating', description: 'Milestone', src: null, fps: 8, frames: 12, loop: true, kind: 'apng' };
  const records = [{ companionId: 'geaux', animations: [animation] }, { companionId: 'bella', animations: [{ ...animation, id: 'head-turn', label: 'Head turn' }] }];
  const input = { activeId: 'geaux', customCompanions: [], builtInAnimations: records };
  const saved = await handleStudioCompanionSettings(request('PUT', input), { DB: db }, 'acct-builtin');
  assert.equal(saved.status, 200);
  assert.deepEqual((await saved.json()).settings.builtInAnimations, records);
  const loaded = await handleStudioCompanionSettings(request(), { DB: db }, 'acct-builtin');
  assert.deepEqual((await loaded.json()).settings.builtInAnimations, records);
  const invalid = await handleStudioCompanionSettings(request('PUT', {
    ...input, builtInAnimations: [{ companionId: 'rogue', animations: [animation] }],
  }), { DB: db }, 'acct-builtin');
  assert.equal(invalid.status, 400);
  const duplicate = await handleStudioCompanionSettings(request('PUT', {
    ...input, builtInAnimations: [records[0], records[0]],
  }), { DB: db }, 'acct-builtin');
  assert.equal(duplicate.status, 400);
});
