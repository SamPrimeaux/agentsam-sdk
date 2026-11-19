import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { verifyThemeStorePreviewBytes } from './theme-store-preview-integrity.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const original = Buffer.from('<!doctype html>\n<html><body>\n<h1>Cypress</h1>\n</body>\n</html>\n');
const challenge = "<script>window.__CF$cv$params={r:'challenge',ut:'dynamic'};(function(){var u='/cdn-cgi/challenge-platform/scripts/precursor/main.js?ray=challenge';})();</script>";
const beacon = '<script type="module" src="https://static.cloudflareinsights.com/beacon.min.js/example" data-cf-beacon="dynamic"></script>';
const inserted = (tags, newline = '') => Buffer.from(original.toString('utf8').replace('</body>', tags + newline + '</body>'));

test('unmodified immutable Theme Store bytes pass through unchanged', () => {
  assert.deepEqual(verifyThemeStorePreviewBytes(original, sha(original), 'cypress/index.html'), original);
});

test('Cloudflare challenge-only injection preserves original immutable bytes', () => {
  assert.deepEqual(verifyThemeStorePreviewBytes(inserted(challenge), sha(original), 'cypress/index.html'), original);
});

test('Cloudflare challenge and beacon insertion with a new line preserves immutable bytes', () => {
  const injected = inserted(challenge + beacon, '\n');
  assert.notEqual(sha(injected), sha(original));
  assert.deepEqual(verifyThemeStorePreviewBytes(injected, sha(original), 'cypress/index.html'), original);
});

test('unrecognized HTML changes or altered signed source cannot pass verification', () => {
  const changed = Buffer.from(inserted(challenge).toString('utf8').replace('Cypress', 'Changed content'));
  assert.throws(() => verifyThemeStorePreviewBytes(changed, sha(original), 'cypress/index.html'), /SHA-256 mismatch/);
  assert.throws(() => verifyThemeStorePreviewBytes(inserted(challenge), '0'.repeat(64), 'cypress/index.html'), /SHA-256 mismatch/);
});

test('binary assets retain strict byte-for-byte verification', () => {
  const png = Buffer.from([0x89,0x50,0x4e,0x47]);
  assert.throws(() => verifyThemeStorePreviewBytes(png, 'f'.repeat(64), 'cypress/image.png'), /SHA-256 mismatch/);
});
