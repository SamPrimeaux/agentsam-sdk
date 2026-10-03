#!/usr/bin/env node
/**
 * Local Studio is an independently locked product workspace.
 * Cloudflare Workers Builds uses Node 22 + npm 10.9.2 and npm ci.
 * Keep the product lock aligned with the current release train, local source links, and the
 * lru-cache peer required by Nitro/unstorage.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(appRoot, 'package-lock.json'), 'utf8'));
const packages = lock.packages || {};
const version = manifest.version;

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (lock.lockfileVersion !== 3) fail('Local Studio lockfileVersion must be 3');
if (lock.version !== version) fail('Local Studio lock version ' + lock.version + ' != ' + version);
if (packages['']?.version !== version) fail('Local Studio root lock package version mismatch');

for (const key of ['frontend', 'backend', 'shared/agentsam']) {
  if (packages[key]?.version !== version) {
    fail(key + ' lock version ' + String(packages[key]?.version || '<missing>') + ' != ' + version);
  }
}

const requiredLinks = [
  ['@inneranimalmedia/agentsam-loading-scene', '../../packages/agentsam-loading-scene'],
  ['@inneranimalmedia/agentsam-work', '../../packages/agentsam-work'],
  ['@inneranimalmedia/agentsam-workbench', '../../packages/agentsam-workbench'],
  ['@inneranimalmedia/agentsam-nav', '../../packages/agentsam-nav'],
  ['@inneranimalmedia/agentsam-settings', '../../packages/agentsam-settings'],
  ['@inneranimalmedia/agentsam-contracts', '../../packages/agentsam-contracts'],
  ['@inneranimalmedia/agentsam-cms-frontend', '../client-cms-editor/frontend'],
];

for (const [name, resolved] of requiredLinks) {
  const meta = packages['node_modules/' + name];
  if (!meta?.link || meta.resolved !== resolved) {
    fail('Missing Local Studio source link ' + name + ' -> ' + resolved);
  }
}

const loading = packages['../../packages/agentsam-loading-scene'];
if (loading?.version !== version) {
  fail('Loading Scene lock metadata is not on release ' + version);
}

const sdk = packages['node_modules/@inneranimalmedia/agentsam-sdk'];
if (sdk?.version !== version || sdk?.link) {
  fail('Local Studio must consume published @inneranimalmedia/agentsam-sdk@' + version + ' in its product lock');
}

const lru = packages['node_modules/lru-cache'];
if (lru?.version !== '11.5.2') {
  fail('Expected lru-cache@11.5.2, found ' + String(lru?.version || '<missing>'));
}
if (!String(lru.resolved || '').includes('lru-cache-11.5.2.tgz') || !lru.integrity) {
  fail('lru-cache@11.5.2 is missing registry resolution/integrity metadata');
}

console.log(
  'ok Local Studio lock: ' + version +
  ' · product workspaces aligned · source links present · lru-cache@11.5.2'
);
