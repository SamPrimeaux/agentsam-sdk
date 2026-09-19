import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyAnthropicFailure,
  classifyCloudflareFailure,
  classifyCursorFailure,
  classifyGeminiFailure,
  classifyGitHubFailure,
  classifyGcpFailure,
  classifyOpenAIFailure,
} from '../src/index.js';

test('missing OpenAI key is user configuration, not an OpenAI outage', () => {
  const error = classifyOpenAIFailure({ credential_state: 'missing' });
  assert.equal(error.reason, 'provider_credential_missing');
  assert.equal(error.source.kind, 'user');
  assert.equal(error.resolution_owner, 'user');
  assert.equal(error.provider, 'openai');
});

test('OpenAI rejected key and exhausted budget stay distinct', () => {
  const rejected = classifyOpenAIFailure({ status: 401, code: 'invalid_api_key', message: 'Incorrect API key' });
  const budget = classifyOpenAIFailure({ status: 429, code: 'project_spend_limit_exceeded', message: 'budget reached' });
  assert.equal(rejected.reason, 'provider_credential_invalid');
  assert.equal(rejected.source.kind, 'provider');
  assert.equal(rejected.resolution_owner, 'user');
  assert.equal(budget.reason, 'provider_budget_exhausted');
  assert.equal(budget.retryable, false);
  assert.equal(budget.remediation.action, 'add_budget');
});

test('the same provider budget response is internal when the provider account is AgentSam-owned', () => {
  const error = classifyOpenAIFailure(
    { status: 429, code: 'project_spend_limit_exceeded', message: 'budget reached' },
    { credential_owner: 'agentsam' },
  );
  assert.equal(error.reason, 'provider_budget_exhausted');
  assert.equal(error.source.kind, 'provider');
  assert.equal(error.source.name, 'openai');
  assert.equal(error.resolution_owner, 'agentsam');
  assert.equal(error.severity, 'blocking_internal');
  assert.equal(error.remediation.action, 'inspect_platform');
});

test('organization-owned provider account failures route to the organization administrator', () => {
  const error = classifyGeminiFailure(
    { status_name: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded' },
    { account_owner: 'organization' },
  );
  assert.equal(error.reason, 'provider_quota_exhausted');
  assert.equal(error.resolution_owner, 'organization_admin');
  assert.equal(error.remediation.action, 'contact_organization_admin');
});

test('provider invalid request can be attributed to AgentSam when AgentSam authored it', () => {
  const error = classifyOpenAIFailure({ status: 400, code: 'invalid_request_error', message: 'invalid generated request' }, { request_origin: 'agentsam' });
  assert.equal(error.reason, 'provider_request_invalid');
  assert.equal(error.source.kind, 'provider');
  assert.equal(error.resolution_owner, 'agentsam');
  assert.equal(error.severity, 'blocking_internal');
  assert.equal(error.remediation.action, 'inspect_platform');
});

test('Anthropic overload is transient provider ownership', () => {
  const error = classifyAnthropicFailure({ status: 529, type: 'overloaded_error', message: 'Overloaded' });
  assert.equal(error.reason, 'provider_overloaded');
  assert.equal(error.retryable, true);
  assert.equal(error.resolution_owner, 'provider');
});

test('Gemini resource exhaustion is classified separately from invalid API key', () => {
  const quota = classifyGeminiFailure({ status: 429, status_name: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded' });
  const key = classifyGeminiFailure({ status: 400, message: 'API key not valid. Please pass a valid API key.' });
  assert.equal(quota.reason, 'provider_quota_exhausted');
  assert.equal(quota.resolution_owner, 'user');
  assert.equal(key.reason, 'provider_credential_invalid');
});

test('Cursor uses the generic provider contract rather than a parallel vocabulary', () => {
  const error = classifyCursorFailure({ status: 503, message: 'Service unavailable' });
  assert.equal(error.reason, 'provider_unavailable');
  assert.equal(error.provider, 'cursor');
  assert.equal(error.retryable, true);
});

test('GitHub differentiates installation, scopes and rate limits', () => {
  assert.equal(classifyGitHubFailure({ installation_state: 'missing' }).reason, 'github_installation_missing');
  assert.equal(classifyGitHubFailure({ status: 403, message: 'Resource not accessible by integration' }).reason, 'github_scope_insufficient');
  assert.equal(classifyGitHubFailure({ status: 403, message: 'API rate limit exceeded', headers: { 'x-ratelimit-remaining': '0' } }).reason, 'github_rate_limited');
});

test('Cloudflare and GCP retain infrastructure-specific actionable reasons', () => {
  const tunnel = classifyCloudflareFailure({ status: 530, cloudflare_code: 1033, message: 'tunnel unavailable' });
  const quota = classifyGcpFailure({ status_name: 'RESOURCE_EXHAUSTED', message: 'Compute Engine quota exceeded' }, { resource: { type: 'vm', id: 'vm_1' } });
  assert.equal(tunnel.reason, 'tunnel_connector_unavailable');
  assert.equal(tunnel.remediation.action, 'reconnect_service');
  assert.equal(quota.reason, 'gcp_quota_exhausted');
  assert.equal(quota.remediation.action, 'increase_quota');
});
