import assert from 'node:assert/strict';
import test from 'node:test';
import {
  remediateGcloudEdgeServiceAccountKey,
  remediateGcloudPermissionDenied,
  remediateGithubTokenShadow,
  remediateProviderFailure,
  renderRemediationCard,
  recommendedCommand,
} from '../src/lib/provider-command-remediation.js';
import { runCredentials } from '../src/commands/credentials.js';
import { listCheatSheetGroups, renderCheatSheet } from '../src/commands/cheat-sheet.js';
import { collectCredentialsAudit } from '../src/lib/credentials-audit.js';

test('edge-cloud service-account key create remediates to IAM / compute intents', () => {
  const card = remediateGcloudEdgeServiceAccountKey({
    argv: ['gcloud', 'edge-cloud', 'service-accounts', 'keys', 'create'],
    projectId: 'gen-lang-client-0684066529',
    instance: 'iam-tunnel',
    zone: 'us-central1-f',
  });
  assert.ok(card);
  assert.equal(card.provider, 'google_cloud');
  assert.equal(card.kind, 'command_incomplete_wrong_family');
  assert.match(card.summary, /Distributed Cloud Edge/i);
  assert.match(card.summary, /Compute Engine/i);
  const commands = card.actions.map((row) => row.command).join('\n');
  assert.match(commands, /gcloud compute instances describe iam-tunnel/);
  assert.match(commands, /gcloud iam service-accounts list/);
  assert.match(commands, /gcloud iam service-accounts keys create/);
  assert.match(commands, /agentsam connections/);
  const rendered = renderRemediationCard(card);
  assert.match(rendered, /Command incomplete/);
  assert.match(rendered, /\[enter\]/);
  assert.equal(recommendedCommand(card), card.actions[0].command);
});

test('remediateProviderFailure matches edge-cloud argv fixture', () => {
  const card = remediateProviderFailure({
    argv: ['gcloud', 'edge-cloud', 'service-accounts', 'keys', 'create'],
    stderr: 'ERROR: argument OUTPUT_FILE (--service-account : --location): Must be specified.',
  });
  assert.ok(card);
  assert.equal(card.kind, 'command_incomplete_wrong_family');
});

test('permission denied remediation exposes reauth + IAM console actions', () => {
  const card = remediateGcloudPermissionDenied({
    operation: 'compute.instances.list',
    projectId: 'gen-lang-client-0684066529',
    connection: 'Google Cloud · InnerAnimalMedia',
  });
  assert.equal(card.kind, 'permission_denied');
  assert.match(renderRemediationCard(card), /Permission missing/);
  assert.match(renderRemediationCard(card), /Re-authorize Google Cloud/);
  assert.ok(card.actions.some((row) => /console\.cloud\.google\.com\/iam-admin/i.test(row.docs_url || '')));
});

test('github token shadow remediation prefers unset + keyring status', () => {
  const card = remediateGithubTokenShadow({
    envTokenPresent: true,
    keyringHealthy: true,
    scopes: ['repo', 'read:org'],
  });
  assert.ok(card);
  assert.equal(card.kind, 'credential_shadow');
  assert.match(recommendedCommand(card), /unset GITHUB_TOKEN/);
});

test('credentials remediate CLI prints edge-cloud card without secrets', async () => {
  const chunks = [];
  const code = await runCredentials(
    ['remediate', '--', 'gcloud', 'edge-cloud', 'service-accounts', 'keys', 'create'],
    { write: (s) => chunks.push(s) },
  );
  assert.equal(code, 0);
  const out = chunks.join('');
  assert.match(out, /Google Cloud/);
  assert.match(out, /gcloud iam service-accounts list/);
  assert.doesNotMatch(out, /gho_/);
  assert.doesNotMatch(out, /AIza/);
});

test('credentials audit --names-only never includes secret-looking values', async () => {
  const report = await collectCredentialsAudit({
    env: {
      HOME: process.env.HOME,
      AGENTSAM_API_KEY: 'aak_test_should_never_appear_in_output_fields_as_value',
      GITHUB_TOKEN: 'ghp_should_never_be_echoed',
      OPENAI_API_KEY: 'sk-should-never-be-echoed',
    },
    verify: false,
    drift: true,
    namesOnly: true,
    noNetwork: true,
  });
  const blob = JSON.stringify(report);
  assert.doesNotMatch(blob, /aak_test_should_never/);
  assert.doesNotMatch(blob, /ghp_should_never/);
  assert.doesNotMatch(blob, /sk-should-never/);
  assert.equal(report.shell_presence.GITHUB_TOKEN, true);
  assert.equal(report.shell_presence.AGENTSAM_API_KEY, true);
  assert.ok(report.drift.some((row) => row.code === 'github_env_token_present'));
});

test('cheat-sheet exposes System + Providers groups', () => {
  const groups = listCheatSheetGroups();
  assert.ok(groups.some((g) => g.id === 'system'));
  assert.ok(groups.some((g) => g.id === 'providers'));
  const text = renderCheatSheet('2.6.4');
  assert.match(text, /credentials audit/);
  assert.match(text, /cheat-sheet/);
});
