import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { verifyPinnedPicomatchSecurityFork, PICOMATCH_SECURITY_FORK } from '../../src/security/pinned-artifacts.js';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const source = fileURLToPath(new URL('../../vendor/security/picomatch/', import.meta.url));
const pm = require(source);
const pkg = require(source + 'package.json');

test('bundled CVE-2026-112366 patch is explicit and retains upstream compatibility', () => {
  assert.equal(pkg.version, '4.0.8-iam.1');
  assert.equal(pkg.name, '@inneranimalmedia/picomatch-redos-patched');
  const parse = readFileSync(new URL('../../vendor/security/picomatch/lib/parse.js', import.meta.url), 'utf8');
  assert.match(parse, /hasUnsafeLeadingQuantifier/);
  for (const pattern of ['+(*a)', '*(*a)', '+(a|*a)']) {
    const matcher = pm.makeRe(pattern);
    assert.equal(matcher.test('a'.repeat(32) + '!'), false);
    assert.match(matcher.source, /\\\(/, 'unsafe extglob must be literalized: ' + pattern);
  }
  assert.equal(pm.isMatch('abc', '+(*)'), true);
  assert.equal(pm.isMatch('abc', '+(a*)'), true);
  assert.equal(pm.isMatch('src/file.ts', '**/*.ts'), true);
  assert.equal(pm.isMatch('src/file.js', '**/*.ts'), false);
});

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const locks = [
  'package-lock.json',
  'apps/local-studio/package-lock.json',
  'apps/cad-creator/package-lock.json',
  'apps/samsketch/package-lock.json',
  'apps/samspeaks/package-lock.json',
  'apps/ecommerce-cms-agentsam/frontend/package-lock.json',
  'apps/cad-creator/reference/robotics-donor/4aa63fff4149/package-lock.json',
  'packages/theme-plain-jane/source/package-lock.json',
];

test('all npm lockfiles resolve picomatch to the same reviewed and checksum-verified artifact', () => {
  const pin = PICOMATCH_SECURITY_FORK;
  const archive = readFileSync(new URL('../../' + pin.archive, import.meta.url));
  assert.equal(createHash('sha256').update(archive).digest('hex'), pin.sha256);
  assert.equal('sha512-' + createHash('sha512').update(archive).digest('base64'), pin.integrity);
  for (const file of locks) {
    const lock = JSON.parse(readFileSync(new URL('../../' + file, import.meta.url)));
    const override = JSON.parse(readFileSync(new URL('../../' + file.replace('package-lock.json', 'package.json'), import.meta.url)));
    assert.equal(override.overrides?.picomatch, pin.url, file + ': root override');
    const matches = Object.entries(lock.packages || {}).filter(([key]) => key.endsWith('node_modules/picomatch'));
    assert.equal(matches.length, 1, file + ': exactly one locked picomatch implementation');
    const [location, pkg] = matches[0];
    assert.equal(location, 'node_modules/picomatch', file);
    assert.equal(pkg.name, pin.name, file);
    assert.equal(pkg.version, pin.version, file);
    assert.equal(pkg.resolved, pin.url, file);
    assert.equal(pkg.integrity, pin.integrity, file);
  }
  assert.equal(verifyPinnedPicomatchSecurityFork(repoRoot,
    JSON.parse(readFileSync(new URL('../../package-lock.json', import.meta.url))).packages['node_modules/picomatch'],
    'node_modules/picomatch'), true);
});

test('attestation fails closed for tampered, unrecognized, or relocated dependencies', () => {
  const pin = PICOMATCH_SECURITY_FORK;
  const locked = JSON.parse(readFileSync(new URL('../../package-lock.json', import.meta.url))).packages[pin.installedAt];
  for (const bad of [
    { ...locked, version: '4.0.7' },
    { ...locked, name: 'picomatch' },
    { ...locked, integrity: 'sha512-tampered' },
    { ...locked, resolved: pin.url.replace('85fcc1dd', '95fcc1dd') },
  ]) {
    assert.equal(verifyPinnedPicomatchSecurityFork(repoRoot, bad, pin.installedAt), false);
  }
  assert.equal(verifyPinnedPicomatchSecurityFork(repoRoot, locked, 'node_modules/other'), false);
  assert.equal(verifyPinnedPicomatchSecurityFork('/tmp/unknown-security-root', locked, pin.installedAt), false);
  const installed = require('picomatch');
  assert.equal(installed.makeRe('+(*a)').source, pm.makeRe('+(*a)').source);
});
