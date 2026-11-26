import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = path.join(appRoot, 'scripts/sync-identity-portals.mjs');
const output = path.join(appRoot, 'frontend/static/identity-portal');

 test('Identity portal static assets are generated from the canonical package for clean storefront routes', async () => {
  execFileSync(process.execPath, [script], { cwd: appRoot, stdio: 'pipe' });
  for (const page of ['login.html', 'signup.html', 'reset.html']) {
    const html = await readFile(path.join(output, 'pages', page), 'utf8');
    assert.match(html, /\/identity-portal\/shared\//);
    assert.doesNotMatch(html, /(?:src|href)="\/shared\//);
    assert.match(html, /default-auth-logo\.svg/);
  }
  const branding = await readFile(path.join(output, 'shared/company-branding.js'), 'utf8');
  assert.match(branding, /\/api\/storefront\/identity\/company/);
  await stat(path.join(output, 'shared/default-auth-logo.svg'));
});

test('public Identity portal assets are copied to the root path used by storefront auth routes', async () => {
  const buildAssets = await readFile(path.join(appRoot, 'bin/build-assets.mjs'), 'utf8');
  assert.match(buildAssets, /copy\(source\("frontend\/static\/identity-portal"\), path\.join\(dest, "identity-portal"\)\)/);
});
