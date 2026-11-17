import test from 'node:test';
import assert from 'node:assert/strict';
import { validateStateBoundOAuthScopes } from './plugin-oauth-state-bound.js';

test('state-bound OAuth accepts the exact requested scopes when provider omits scope', () => {
  assert.deepEqual(validateStateBoundOAuthScopes({ access_token: 'opaque' }, ['mcp:tools', 'desktop:auth']),
    ['mcp:tools', 'desktop:auth']);
});

test('state-bound OAuth accepts the exact provider-granted scope set', () => {
  assert.deepEqual(validateStateBoundOAuthScopes({ scope: 'desktop:auth mcp:tools' }, ['mcp:tools', 'desktop:auth']),
    ['desktop:auth', 'mcp:tools']);
});

test('state-bound OAuth rejects missing requested scopes', () => {
  assert.throws(() => validateStateBoundOAuthScopes({ scope: 'mcp:tools' }, ['mcp:tools', 'desktop:auth']),
    /plugin_oauth_scope_mismatch/);
});

test('state-bound OAuth rejects unrequested extra scopes', () => {
  assert.throws(() => validateStateBoundOAuthScopes({ scope: 'mcp:tools desktop:auth admin:all' }, ['mcp:tools', 'desktop:auth']),
    /plugin_oauth_scope_mismatch/);
});
