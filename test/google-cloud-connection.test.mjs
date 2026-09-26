import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  diagnoseGoogleCloudAccountMismatch,
  diagnoseInsufficientAccess,
  readGoogleCloudConnection,
  renderInsufficientAccessCard,
  writeGoogleCloudConnection,
} from '../src/lib/google-cloud-connection.js';
import { describeAuthShadow, renderLoginResult } from '../src/commands/whoami.js';

test('connection preference persists identity+project without secrets', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-conn-'));
  const saved = writeGoogleCloudConnection(
    {
      identity: 'meauxbility@gmail.com',
      organization: 'inneranimals.com',
      project: 'gen-lang-client-0684066529',
      billing_account: '017E01-4426EF-21356F',
    },
    { home },
  );
  assert.equal(saved.identity, 'meauxbility@gmail.com');
  assert.equal(saved.project, 'gen-lang-client-0684066529');
  const again = readGoogleCloudConnection({ home });
  assert.equal(again.organization, 'inneranimals.com');
  assert.doesNotMatch(JSON.stringify(again), /private_key|BEGIN /);
});

test('identity mismatch diagnosis is deterministic', () => {
  const d = diagnoseGoogleCloudAccountMismatch({
    preferred: { identity: 'meauxbility@gmail.com', project: 't-pulsar-483701-q1' },
    activeAccount: 'info@inneranimals.com',
    activeProject: 't-pulsar-483701-q1',
    accounts: [
      { account: 'info@inneranimals.com', status: 'ACTIVE' },
      { account: 'meauxbility@gmail.com', status: '' },
    ],
  });
  assert.equal(d.ok, false);
  assert.equal(d.kind, 'identity_mismatch');
  assert.equal(d.alternate_authenticated, true);
  assert.match(d.remediation.actions[0].command, /gcloud config set account meauxbility@gmail.com/);
});

test('insufficient access card matches product UX', () => {
  const d = diagnoseInsufficientAccess({
    currentAccount: 'info@inneranimals.com',
    requiredRole: 'roles/owner',
    project: 'gen-lang-client-0684066529',
    accounts: [
      { account: 'info@inneranimals.com', roles: ['roles/viewer'] },
      { account: 'meauxbility@gmail.com', roles: ['roles/owner'] },
    ],
  });
  assert.equal(d.kind, 'insufficient_access');
  const text = renderInsufficientAccessCard(d);
  assert.match(text, /This Google account does not have enough access/);
  assert.match(text, /meauxbility@gmail\.com/);
  assert.match(text, /✓ Owner/);
  assert.match(text, /\[enter\]/);
  assert.match(text, /\[a\]/);
  assert.match(text, /\[c\]/);
});

test('login result explains API key shadowing OAuth', () => {
  const status = {
    active_auth: { kind: 'api_key', source: 'environment' },
    api_key: { configured: true, source: 'environment' },
    browser_session: { configured: true, expired: false, refreshable: true },
  };
  const text = renderLoginResult(status);
  assert.match(text, /Browser OAuth login saved/);
  assert.match(text, /not currently authoritative/);
  assert.match(text, /AGENTSAM_API_KEY has higher precedence/);
  assert.match(text, /\[enter\] keep API key/);
  const shadow = describeAuthShadow(status);
  assert.ok(shadow);
  assert.match(shadow.join('\n'), /Authority lanes/);
});
