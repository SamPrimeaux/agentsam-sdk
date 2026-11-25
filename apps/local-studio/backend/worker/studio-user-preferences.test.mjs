import test from 'node:test';
import assert from 'node:assert/strict';
import { handleStudioAccountAvatar } from './studio-user-preferences.js';

test('AgentSam app persists authenticated avatar preference without new tables', async () => {
  let json = '{"settings_general":{"openLastProject":true}}';
  const env = {
    DB: {
      prepare(sql) {
        return {
          bind(...args) {
            return {
              async first() { return { ui_preferences_json: json }; },
              async run() { json = args[1]; return { success: true }; }
            };
          }
        };
      }
    }
  };
  const url = 'https://agentsam.inneranimalmedia.com/api/settings/account-avatar';
  const guest = await handleStudioAccountAvatar(new Request(url), env, null);
  assert.equal(guest.status, 401);
  const put = await handleStudioAccountAvatar(new Request(url, {
    method: 'PUT', headers: { 'content-type': 'application/json', origin: 'https://agentsam.inneranimalmedia.com' },
    body: JSON.stringify({ avatar_url: '/brand/agentsam-gorilla/v1/pet/ledge/ledge-idle.svg' })
  }), env, 'signed-in-user');
  assert.equal(put.status, 200);
  const get = await handleStudioAccountAvatar(new Request(url), env, 'signed-in-user');
  assert.equal((await get.json()).avatar_url, '/brand/agentsam-gorilla/v1/pet/ledge/ledge-idle.svg');
  assert.equal(JSON.parse(json).settings_general.openLastProject, true, 'other preferences survive');
  const reject = await handleStudioAccountAvatar(new Request(url, {
    method: 'PUT', headers: { 'content-type':'application/json' },
    body: '{"avatar_url":"javascript:alert(1)"}'
  }), env, 'signed-in-user');
  assert.equal(reject.status, 400);
});
