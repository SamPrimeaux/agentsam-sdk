import test from 'node:test';
import assert from 'node:assert/strict';
import { handleStudioCompanionSettings } from './studio-user-preferences.js';

function makeEnv(initial = {}) {
  let stored = JSON.stringify(initial);
  return {
    DB: {
      prepare(sql) {
        return {
          bind(...args) {
            if (sql.includes('SELECT ui_preferences_json')) {
              return { first: async () => ({ ui_preferences_json: stored }) };
            }
            return { run: async () => { stored = args[1]; return { success: true }; } };
          },
        };
      },
      read: () => JSON.parse(stored),
    },
  };
}

const request = (method, body) => new Request('https://agentsam.test/api/settings/companions', {
  method,
  headers: method === 'PUT' ? { origin: 'https://agentsam.test', 'content-type': 'application/json' } : {},
  ...(body ? { body: JSON.stringify(body) } : {}),
});

test('legacy companion preferences normalize with safe secondary and onboarding defaults', async () => {
  const env = makeEnv({ inneranimal_companions: { activeId: 'geaux', customCompanions: [] } });
  const response = await handleStudioCompanionSettings(request('GET'), env, 'account-1');
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.settings.activeId, 'geaux');
  assert.equal(body.settings.secondaryId, null);
  assert.equal(body.settings.desktopBuddyEnabled, false);
  assert.equal(body.settings.onboarding, null);
});

test('account settings persist the quiz match and optional second companion', async () => {
  const env = makeEnv({});
  const settings = {
    activeId: 'meaux', secondaryId: 'bella', desktopBuddyEnabled: true, customCompanions: [],
    onboarding: {
      version: '1', completedAt: '2026-11-14T17:30:00.000Z', recommendedId: 'meaux',
      answers: { 'work-style': 'creative', 'problem-style': 'explore', notice: 'ideas', presence: 'curious' },
    },
  };
  const response = await handleStudioCompanionSettings(request('PUT', settings), env, 'account-1');
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.settings.activeId, 'meaux');
  assert.equal(body.settings.secondaryId, 'bella');
  assert.equal(body.settings.desktopBuddyEnabled, true);
  assert.equal(body.settings.onboarding.recommendedId, 'meaux');
  assert.deepEqual(body.settings.onboarding.answers, settings.onboarding.answers);
  const stored = env.DB.read();
  assert.equal(stored.inneranimal_companions.secondaryId, 'bella');
});

test('secondary companion cannot duplicate the active companion or enable without a valid selection', async () => {
  const env = makeEnv({});
  const response = await handleStudioCompanionSettings(request('PUT', {
    activeId: 'bella', secondaryId: 'bella', desktopBuddyEnabled: true, customCompanions: [],
  }), env, 'account-1');
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.settings.secondaryId, null);
  assert.equal(body.settings.desktopBuddyEnabled, false);
});

test('agency mascot briefs retain their brand commissioning context', async () => {
  const env = makeEnv({});
  const custom = {
    id: 'custom_agency-001', name: 'PrimeTechPy', animal: 'Python snake', role: 'ML and creative tooling',
    description: 'A branded automation companion.', personality: 'Curious and precise.',
    visualNotes: 'Lab coat, green accents, polished studio character.', signatureAction: 'Draws a model, then dives into code.',
    imageUrl: null, stateAssets: {}, brandName: 'PrimeTech', commissioningMode: 'agency',
  };
  const response = await handleStudioCompanionSettings(request('PUT', {
    activeId: custom.id, secondaryId: null, desktopBuddyEnabled: false, customCompanions: [custom],
  }), env, 'account-1');
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.settings.customCompanions[0].brandName, 'PrimeTech');
  assert.equal(body.settings.customCompanions[0].commissioningMode, 'agency');
});
