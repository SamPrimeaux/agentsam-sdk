import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { verifyThemeStorePreviewBytes } from './theme-store-preview-integrity.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const original = Buffer.from('<!doctype html>\n<html><body>\n<h1>Cypress</h1>\n</body>\n</html>\n');
const injectedChallenge = "<script>window.__CF$cv$params={r:'challenge',ut:'dynamic'};(function(){var u='/cdn-cgi/challenge-platform/scripts/precursor/main.js?ray=challenge';})();</script>";
const injectedBeacon = '<script type="module" src="https://static.cloudflareinsights.com/beacon.min.js/example" data-cf-beacon="dynamic"></script>';
const injected = Buffer.from(original.toString('utf8').replace('</body>', injectedChallenge + injectedBeacon + '\n</body>'));

test('unmodified immutable Theme Store bytes pass through unchanged', () => {
  assert.deepEqual(verifyThemeStorePreviewBytes(original, sha(original), 'cypress/index.html'), original);
});

test('Cloudflare-injected dynamic preview scripts are excluded only when immutable source digest matches', () => {
  assert.deepEqual(verifyThemeStorePreviewBytes(injected, sha(original), 'cypress/index.html'), original);
  assert.notEqual(sha(injected), sha(original));
});

test('unrecognized HTML mutations cannot be accepted as immutable preview assets', () => {
  const tampered = Buffer.from(injected.toString('utf8').replace('Cypress', 'Changed content'));
  assert.throws(() => verifyThemeStorePreviewBytes(tampered, sha(original), 'cypress/index.html'), /SHA-256 mismatch/);
  assert.throws(() => verifyThemeStorePreviewBytes(injected, '0'.repeat(64), 'cypress/index.html'), /SHA-256 mismatch/);
});

test('binary mismatches cannot be normalized by the HTML-specific edge policy', () => {
  const png = Buffer.from([0x89,0x50,0x4e,0x47]);
  assert.throws(() => verifyThemeStorePreviewBytes(png, 'f'.repeat(64), 'cypress/image.png'), /SHA-256 mismatch/);
});
