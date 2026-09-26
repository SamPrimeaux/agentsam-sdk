import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeGoogleCloudArgv } from '../src/commands/google-cloud.js';
import {
  renderServiceAccountInspect,
  renderServiceAccountTable,
} from '../src/lib/google-cloud-inventory.js';

test('normalizeGoogleCloudArgv maps compute instances into google-cloud compute', () => {
  assert.deepEqual(normalizeGoogleCloudArgv(['instances', 'list']), ['compute', 'instances', 'list']);
  assert.deepEqual(normalizeGoogleCloudArgv(['iam', 'service-accounts', 'list']), ['iam', 'service-accounts', 'list']);
});

test('service account table render never invents INNERANIMALMEDIA as Google keyOrigin', () => {
  const text = renderServiceAccountTable({
    project_id: 'gen-lang-client-0684066529',
    accounts: [
      {
        name: 'Agent Sam Vertex',
        short_name: 'agent-sam-vertex',
        email: 'agent-sam-vertex@gen-lang-client-0684066529.iam.gserviceaccount.com',
        attached: [],
        key_counts: { total: 3, user_managed: 1 },
        status: 'ready',
        disposition_hint: 'KEEP · ROTATE user-managed keys',
        keys: [
          { key_type: 'USER_MANAGED', key_origin: 'GOOGLE_PROVIDED', agentsam_origin_label: 'GOOGLE_PROVIDED' },
        ],
      },
    ],
  });
  assert.match(text, /Agent Sam Vertex/);
  assert.match(text, /GOOGLE_PROVIDED/);
  assert.match(text, /INNERANIMALMEDIA_PROVIDED is only for AgentSam-issued/);
});

test('inspect render shows roles and key metadata only', () => {
  const text = renderServiceAccountInspect({
    ok: true,
    project_id: 'gen-lang-client-0684066529',
    account: {
      short_name: 'agent-sam-vertex',
      email: 'agent-sam-vertex@gen-lang-client-0684066529.iam.gserviceaccount.com',
      bucket: 'agentsam',
      roles: ['roles/aiplatform.user', 'roles/aiplatform.admin'],
      keys: [
        {
          key_type: 'SYSTEM_MANAGED',
          agentsam_origin_label: 'GOOGLE_PROVIDED',
          created_at: '2026-06-02T17:17:25Z',
          expires_at: '2027-06-02T17:17:25Z',
          key_id: 'abc',
        },
      ],
      attached: [],
      disposition_hint: 'KEEP · ROTATE user-managed keys',
    },
  });
  assert.match(text, /roles\/aiplatform\.admin/);
  assert.match(text, /GOOGLE_PROVIDED/);
  assert.doesNotMatch(text, /BEGIN PRIVATE KEY/);
});
