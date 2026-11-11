import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../frontend');
const source = readFileSync(resolve(root, 'shell.js'), 'utf8');
const manifestMatch = source.match(/const NAV = (\{[\s\S]*?\n\});\n\n\/\/ Explicit user-toggle/);
assert.ok(manifestMatch, 'Navigation contract is defined in shell.js');
const nav = vm.runInNewContext(`(${manifestMatch[1]})`);
const buildUserNavMatch = source.match(/function buildUserNav\(user\) \{[\s\S]*?\n\}/);
assert.ok(buildUserNavMatch);
const buildUserNav = vm.runInNewContext(`(${buildUserNavMatch[0]})`, { NAV: nav, JSON });
const labels = (items) => Array.from(items, (item) => item.label);

test('commerce navigation stays focused on commerce and installed CMS-side apps', () => {
  assert.deepEqual(labels(nav.main), ['Home', 'Orders', 'Products', 'Customers', 'Growth', 'Discounts', 'Content', 'Analytics']);
  assert.deepEqual(labels(nav.channels), ['Online Store']);
  assert.deepEqual(labels(nav.apps), ['AgentSam', 'Email']);
  assert.deepEqual(labels(nav.channels[0].children), ['Pages', 'Preferences']);
  assert.deepEqual(labels(nav.main.find((item) => item.id === 'analytics').children), ['Overview', 'Finance', 'Health']);
  assert.equal(source.includes('CAD Creator'), false, 'CAD is a separate product, not a second workspace embedded in the CMS shell');
  assert.equal(source.includes('/admin/cad'), false);
  assert.equal(source.includes('Point of Sale'), false);
  assert.equal(source.includes('view=markets'), false);
  assert.equal(source.includes('view=pos'), false);
});

test('mailbox hydration preserves AgentSam and Email as distinct app entries', () => {
  for (const user of [null, { primary_mailbox: 'primary' }, { primary_mailbox: 'main', mailboxes: [{ slug: 'main', label: 'Main' }, { slug: 'studio', label: 'Studio' }] }]) {
    const built = buildUserNav(user);
    assert.deepEqual(labels(built.apps), ['AgentSam', 'Email']);
    assert.equal(built.apps[0].href, '/admin/agentsam');
    assert.equal(built.apps[1].label, 'Email');
  }
});

test('Apps plus remains a keyboard-accessible affordance in the existing sidebar', () => {
  assert.match(source, /data-apps-add-toggle/);
  assert.match(source, /aria-expanded/);
  const css = readFileSync(resolve(root, 'static/css/console.css'), 'utf8');
  assert.match(css, /\.console-nav-apps-add:focus-visible/);
  assert.match(css, /\.console-nav-apps-add:hover/);
});

test('the CMS home links out to the dedicated CAD Creator product instead of embedding its shell', () => {
  const home = readFileSync(resolve(root, 'static/home.html'), 'utf8');
  const controller = readFileSync(resolve(root, 'static/js/home-workspace.js'), 'utf8');
  const previewServer = readFileSync(resolve(here, '../scripts/preview-sdk-showcase.mjs'), 'utf8');
  assert.match(home, /href="https:\/\/cad\.inneranimalmedia\.com\/studio" data-studio-preview-link/);
  assert.match(home, /<strong>CAD Creator<\/strong>/);
  assert.match(controller, /http:\/\/127\.0\.0\.1:4340\/studio/);
  assert.equal(previewServer.includes("if(p==='/admin/cad')"), false);
  assert.equal(previewServer.includes("if(pathname==='/cad')"), false);
  assert.equal(existsSync(resolve(root, 'static/cad.html')), false, 'no nested CAD shell is served from the CMS');
});
