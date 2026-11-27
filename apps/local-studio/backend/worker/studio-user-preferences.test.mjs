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

test('profile source is independent of saved photo and follows selected companion', async () => {
  let json = JSON.stringify({account_avatar_url:'/media/profile.png',inneranimal_companions:{activeId:'bella',customCompanions:[]}});
  const env = { DB: { prepare() { return { bind(...args) { return {
    async first() { return {ui_preferences_json:json}; },
    async run() { json=args[1]; return {success:true}; }
  }; } }; } } };
  const url = 'https://agentsam.inneranimalmedia.com/api/settings/account-avatar';
  const call = async (mode) => handleStudioAccountAvatar(new Request(url, mode ? {
    method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({mode})
  } : {}),env,'signed-in-user');
  const initial = await (await call()).json();
  assert.equal(initial.mode,'auto');
  assert.equal(initial.avatar_url,'/media/profile.png');
  assert.match(initial.companion_url,/\/bella\/avatars\/bella-avatar-128\.png$/);
  const chosen = await (await call('companion')).json();
  assert.equal(chosen.mode,'companion');
  assert.equal(chosen.avatar_url,'/media/profile.png');
  json=JSON.stringify({...JSON.parse(json),inneranimal_companions:{activeId:'geaux',customCompanions:[]}});
  assert.match((await (await call()).json()).companion_url,/\/geaux\/avatars\/geaux-avatar-128\.png$/);
  assert.equal((await (await call('initials')).json()).mode,'initials');
  assert.equal(JSON.parse(json).account_avatar_url,'/media/profile.png');
  assert.equal((await call('invalid')).status,400);
});
