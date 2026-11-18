import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
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
