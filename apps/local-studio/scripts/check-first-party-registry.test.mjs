import assert from 'node:assert/strict';
import test from 'node:test';
import {
  requiredPublishedPackages,
  registryStatus,
  staleLockTarballs,
} from './check-first-party-registry.mjs';

const input = [
  { path: 'package.json', manifest: { name: '@inneranimalmedia/studio', dependencies: {
    '@inneranimalmedia/agentsam-sdk': '2.6.13',
  } } },
  { path: 'frontend/package.json', manifest: { name: '@inneranimalmedia/studio-frontend', dependencies: {
    '@inneranimalmedia/agentsam-campaign': '2.6.13',
    '@inneranimalmedia/agentsam-local-shared': '2.6.13',
  } } },
  { path: 'shared/agentsam/package.json', manifest: { name: '@inneranimalmedia/agentsam-local-shared', private: true, dependencies: {
    '@inneranimalmedia/agentsam-campaign': '2.6.13',
  } } },
];

test('checks pinned public dependencies without treating app-private workspaces as npm releases', () => {
  assert.deepEqual(requiredPublishedPackages(input), [
    { name: '@inneranimalmedia/agentsam-sdk', version: '2.6.13' },
    { name: '@inneranimalmedia/agentsam-campaign', version: '2.6.13' },
  ]);
});

test('reports all absent published dependencies, not only the first ETARGET', async () => {
  const requirements = requiredPublishedPackages(input);
  const queries = [];
  const result = await registryStatus(requirements, async (url) => {
    queries.push(url);
    return { status: url.includes('agentsam-sdk') ? 200 : 404 };
  });
  assert.equal(result.ready, false);
  assert.deepEqual(result.results.map(r => r.published), [true, false]);
  assert.equal(queries.length, 2);
});

test('network errors and non-exact first-party pins cannot be mistaken for a deferred release', async () => {
  await assert.rejects(registryStatus([{ name: '@inneranimalmedia/example', version: '^2.6.13' }], async () => ({ status: 200 })), /non_exact_first_party_pin/);
  await assert.rejects(registryStatus([{ name: '@inneranimalmedia/example', version: '2.6.13' }], async () => ({ status: 503 })), /npm_registry_status/);
});

test('checks lock tarballs against their exact manifest pins, not the Local Studio app version', () => {
  const requirements = requiredPublishedPackages(input);
  const lock = { packages: {
    'node_modules/@inneranimalmedia/agentsam-campaign': { version: '2.6.12' },
    'node_modules/@inneranimalmedia/agentsam-nav': { link: true, resolved: '../../packages/agentsam-nav' },
    'backend/node_modules/@inneranimalmedia/agentsam-sdk': { version: '2.6.13' },
    'frontend/node_modules/@inneranimalmedia/agentsam-campaign': { version: '2.6.13' },
    'node_modules/@inneranimalmedia/agentsam-sdk': { link: true, resolved: '../../packages/agentsam-sdk' },
  } };
  assert.deepEqual(staleLockTarballs(lock, requirements), [
    'node_modules/@inneranimalmedia/agentsam-campaign@2.6.12 (expected 2.6.13)',
  ]);
  const candidateLock = { packages: {
    'backend/node_modules/@inneranimalmedia/agentsam-sdk': { version: '2.6.13' },
    'frontend/node_modules/@inneranimalmedia/agentsam-campaign': { version: '2.6.13' },
    'node_modules/@inneranimalmedia/agentsam-sdk': { link: true, resolved: '../../packages/agentsam-sdk' },
  } };
  assert.deepEqual(staleLockTarballs(candidateLock, requirements), []);
});

test('reports a missing lock entry for an exact published dependency', () => {
  assert.deepEqual(staleLockTarballs({ packages: {} }, requiredPublishedPackages(input)), [
    'missing lock entry @inneranimalmedia/agentsam-sdk@2.6.13',
    'missing lock entry @inneranimalmedia/agentsam-campaign@2.6.13',
  ]);
});
