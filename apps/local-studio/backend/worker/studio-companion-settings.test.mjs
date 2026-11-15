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

const custom = {
  id: 'custom_12345678-1234-4234-8234-123456789abc',
  name: 'Moss', animal: 'Red panda', role: 'Research companion',
  description: 'A patient research partner who gathers clues and organizes discoveries.',
  personality: 'Curious and thoughtful', visualNotes: 'Rust red coat, cream face, dark paws.',
  signatureAction: 'Unrolls a field notebook', imageUrl: null,
  stateAssets: { idle: '/brand/inneranimal-companions/v1/custom/moss/idle.png', working: '/brand/inneranimal-companions/v1/custom/moss/working.png' },
};

test('companion settings default to Geaux without creating a second storage table', async () => {
  const db = memoryDb();
  const response = await handleStudioCompanionSettings(request(), { DB: db }, 'acct-1');
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).settings, { activeId: 'geaux', customCompanions: [] });
  assert.equal(db.rows.size, 0, 'GET does not create or mutate the preference row');
});

test('Bella is accepted as a built-in companion and can be selected without a custom profile', async () => {
  const db = memoryDb();
  const saved = await handleStudioCompanionSettings(request('PUT', { activeId: 'bella', customCompanions: [] }), { DB: db }, 'acct-bella');
  assert.equal(saved.status, 200);
  assert.deepEqual((await saved.json()).settings, { activeId: 'bella', customCompanions: [] });
  const loaded = await handleStudioCompanionSettings(request(), { DB: db }, 'acct-bella');
  assert.deepEqual((await loaded.json()).settings, { activeId: 'bella', customCompanions: [] });
});

test('companion selection and custom creation preserve unrelated account preferences', async () => {
  const db = memoryDb({ 'acct-1': JSON.stringify({ settings_general: { openLastProject: true }, account_avatar_url: '/brand/avatar.png' }) });
  const body = { activeId: custom.id, customCompanions: [custom] };
  const saved = await handleStudioCompanionSettings(request('PUT', body), { DB: db }, 'acct-1');
  assert.equal(saved.status, 200);
  assert.deepEqual((await saved.json()).settings, body);
  const stored = JSON.parse(db.rows.get('acct-1'));
  assert.deepEqual(stored.settings_general, { openLastProject: true });
  assert.equal(stored.account_avatar_url, '/brand/avatar.png');
  const loaded = await handleStudioCompanionSettings(request(), { DB: db }, 'acct-1');
  assert.deepEqual((await loaded.json()).settings, body);
});

test('companion settings reject unknown active pets and malformed custom records', async () => {
  const db = memoryDb();
  const unknown = await handleStudioCompanionSettings(request('PUT', { activeId: 'not-a-pet', customCompanions: [] }), { DB: db }, 'acct-1');
  assert.equal(unknown.status, 400);
  const malformed = await handleStudioCompanionSettings(request('PUT', { activeId: 'geaux', customCompanions: [{ ...custom, imageUrl: 'javascript:alert(1)' }] }), { DB: db }, 'acct-1');
  assert.equal(malformed.status, 400);
  const invalidState = await handleStudioCompanionSettings(request('PUT', { activeId: 'geaux', customCompanions: [{ ...custom, stateAssets: { launch: '/brand/launch.png' } }] }), { DB: db }, 'acct-1');
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
  assert.deepEqual((await otherAccount.json()).settings, { activeId: 'geaux', customCompanions: [] });
});
