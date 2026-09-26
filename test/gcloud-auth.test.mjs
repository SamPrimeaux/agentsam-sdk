import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveGoogleOauthStartUrl,
  runAgentsamGoogleOauthLogin,
  runGcloudAuth,
} from '../src/commands/gcloud-auth.js';
import {
  GOOGLE_CLOUD_CONNECTION_SCOPES,
  buildGoogleDesktopAuthUrl,
  googleCloudPermissionChecklist,
  resolveGoogleDesktopClientId,
} from '../src/lib/google-desktop-oauth.js';

const TEST_ENV = {
  IAM_OAUTH_ISSUER: 'https://inneranimalmedia.com',
  GOOGLE_CLIENT_ID: '246811022042-d8q1rc1oki4uv9qiqjah8lvkffb91crp.apps.googleusercontent.com',
  GOOGLE_DESKTOP_CLIENT_ID: '246811022042-cckq00b5seekpkv0in358jhu42n0b6u9.apps.googleusercontent.com',
};

test('hosted --web login emits start URL in --json', async () => {
  let out = '';
  const code = await runAgentsamGoogleOauthLogin({
    write: (s) => {
      out += s;
    },
    json: true,
    nonInteractive: true,
    env: TEST_ENV,
  });
  assert.equal(code, 0);
  const parsed = JSON.parse(out.slice(out.indexOf('{')));
  assert.equal(parsed.mode, 'hosted_identity');
  assert.equal(
    parsed.start_url,
    resolveGoogleOauthStartUrl(TEST_ENV),
  );
});

test('gcloud auth login --web is hosted identity', async () => {
  let out = '';
  const code = await runGcloudAuth(['login', '--web', '--json'], {
    write: (s) => {
      out += s;
    },
    nonInteractive: true,
    env: TEST_ENV,
  });
  assert.equal(code, 0);
  assert.match(out, /hosted_identity|\/api\/oauth\/google\/start/);
});

test('gcloud auth help mentions studio broker default and --desktop/--web/--sdk', async () => {
  let out = '';
  await runGcloudAuth(['help'], {
    write: (s) => {
      out += s;
    },
  });
  assert.match(out, /Studio Web OAuth broker|Worker holds/i);
  assert.match(out, /--desktop/);
  assert.match(out, /--web/);
  assert.match(out, /--sdk/);
});

test('desktop auth URL requests cloud-platform + offline', () => {
  const url = new URL(buildGoogleDesktopAuthUrl({
    clientId: resolveGoogleDesktopClientId(TEST_ENV),
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

test('resolveGoogleDesktopClientId fails loud when unset', () => {
  assert.throws(
    () => resolveGoogleDesktopClientId({}),
    (err) => err?.code === 'google_desktop_client_not_configured',
  );
});

test('resolveGoogleDesktopClientIdAsync uses public-config when env unset', async () => {
  const { resolveGoogleDesktopClientIdAsync } = await import('../src/lib/google-desktop-oauth.js');
  const id = await resolveGoogleDesktopClientIdAsync({}, {
    publicConfigUrl: 'https://example.test/api/public-config',
    fetchImpl: async () =>
      new Response(JSON.stringify({
        ok: true,
        google_desktop_client_id: 'from-public-config.apps.googleusercontent.com',
      }), { status: 200 }),
  });
  assert.equal(id, 'from-public-config.apps.googleusercontent.com');
});
