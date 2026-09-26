import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AGENTSAM_GOOGLE_OAUTH_START,
  runAgentsamGoogleOauthLogin,
  runGcloudAuth,
} from '../src/commands/gcloud-auth.js';

test('hosted google oauth login emits start URL in --json', async () => {
  let out = '';
  const code = await runAgentsamGoogleOauthLogin({
    write: (s) => {
      out += s;
    },
    json: true,
    nonInteractive: true,
  });
  assert.equal(code, 0);
  const jsonLine = out.split('\n').find((line) => line.trim().startsWith('{'));
  const parsed = JSON.parse(out.slice(out.indexOf('{')));
  assert.equal(parsed.mode, 'hosted');
  assert.equal(parsed.start_url, AGENTSAM_GOOGLE_OAUTH_START);
  assert.ok(jsonLine);
});

test('gcloud auth login defaults to hosted mode (not SDK) without --sdk', async () => {
  let out = '';
  const code = await runGcloudAuth(['login', '--json'], {
    write: (s) => {
      out += s;
    },
    nonInteractive: true,
  });
  assert.equal(code, 0);
  assert.match(out, /agentsam\.inneranimalmedia\.com\/api\/oauth\/google\/start/);
  assert.doesNotMatch(out, /Opening Google Cloud SDK OAuth/);
});

test('gcloud auth help mentions hosted default and --sdk', async () => {
  let out = '';
  await runGcloudAuth(['help'], {
    write: (s) => {
      out += s;
    },
  });
  assert.match(out, /Continue to Agent Sam|hosted Google OAuth/i);
  assert.match(out, /--sdk/);
});

test('prompt path opens browser when enter chosen', async () => {
  let opened = null;
  let out = '';
  const code = await runAgentsamGoogleOauthLogin({
    write: (s) => {
      out += s;
    },
    choice: 'enter',
    skipCompletionPrompt: true,
    promptToOpenUrlImpl: async (url) => {
      opened = url;
      return { url, opened: true, interactive: true };
    },
  });
  assert.equal(code, 0);
  assert.equal(opened, AGENTSAM_GOOGLE_OAUTH_START);
  assert.match(out, /Browser OAuth step complete/);
});
