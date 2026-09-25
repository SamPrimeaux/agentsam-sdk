import assert from 'node:assert/strict';
import test from 'node:test';

import {
  repositoryIdFromGitContext,
} from '../../src/go/build.js';

test('Go build source canonicalizes GitHub repository identity', () => {
  assert.equal(
    repositoryIdFromGitContext({
      remoteHost: 'github.com',
      repoFullName: 'SamPrimeaux/agentsam-sdk',
    }),
    'github:samprimeaux/agentsam-sdk',
  );
});

test('Go build source preserves provider-qualified non-GitHub identity', () => {
  assert.equal(
    repositoryIdFromGitContext({
      remoteHost: 'gitlab.example.com',
      repoFullName: 'Owner/Repo',
    }),
    'gitlab.example.com:Owner/Repo',
  );
});

test('Go build source returns null when remote identity is unavailable', () => {
  assert.equal(repositoryIdFromGitContext(null), null);
  assert.equal(repositoryIdFromGitContext({}), null);
});
