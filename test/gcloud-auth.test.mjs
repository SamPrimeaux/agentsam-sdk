import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AGENTSAM_GOOGLE_OAUTH_START,
  runAgentsamGoogleOauthLogin,
  runGcloudAuth,
} from '../src/commands/gcloud-auth.js';
import {
  GOOGLE_CLOUD_CONNECTION_SCOPES,
  buildGoogleDesktopAuthUrl,
  googleCloudPermissionChecklist,
  resolveGoogleDesktopClientId,
} from '../src/lib/google-desktop-oauth.js';

test('hosted --web login emits start URL in --json', async () => {
  let out = '';
  const code = await runAgentsamGoogleOauthLogin({
    write: (s) => {
      out += s;
    },
    json: true,
    nonInteractive: true,
  });
  assert.equal(code, 0);
  const parsed = JSON.parse(out.slice(out.indexOf('{')));
  assert.equal(parsed.mode, 'hosted_identity');
  assert.equal(parsed.start_url, AGENTSAM_GOOGLE_OAUTH_START);
});

test('gcloud auth login --web is hosted identity', async () => {
  let out = '';
  const code = await runGcloudAuth(['login', '--web', '--json'], {
    write: (s) => {
      out += s;
    },
    nonInteractive: true,
  });
  assert.equal(code, 0);
  assert.match(out, /hosted_identity|agentsam\.inneranimalmedia\.com\/api\/oauth\/google\/start/);
});

test('gcloud auth help mentions desktop default and --web/--sdk', async () => {
  let out = '';
  await runGcloudAuth(['help'], {
    write: (s) => {
      out += s;
    },
  });
  assert.match(out, /Desktop PKCE|loopback/i);
  assert.match(out, /--web/);
  assert.match(out, /--sdk/);
});

test('desktop auth URL requests cloud-platform + offline', () => {
  const url = new URL(buildGoogleDesktopAuthUrl({
    clientId: resolveGoogleDesktopClientId({}),
    redirectUri: 'http://127.0.0.1:12345/callback',
    state: 'abc',
    codeChallenge: 'challenge',
  }));
  assert.match(url.searchParams.get('scope') || '', /cloud-platform/);
  assert.equal(url.searchParams.get('access_type'), 'offline');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.match(GOOGLE_CLOUD_CONNECTION_SCOPES, /openid/);
});

test('permissions checklist separates OAuth scopes from IAM roles', async () => {
  let out = '';
  const code = await runGcloudAuth(['login', '--permissions'], {
    write: (s) => {
      out += s;
    },
  });
  assert.equal(code, 0);
  assert.match(out, /cloud-platform/);
  assert.match(out, /mcp\.toolUser|roles\/mcp/);
  const checklist = googleCloudPermissionChecklist();
  assert.ok(checklist.oauth_scopes_requested.includes('https://www.googleapis.com/auth/cloud-platform'));
});
