import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../frontend');
const source = readFileSync(resolve(root, 'shell.js'), 'utf8');
const manifestMatch = source.match(/const NAV = (\{[\s\S]*?\n\});/);
assert.ok(manifestMatch, 'Navigation contract is defined in shell.js');
const nav = vm.runInNewContext(`(${manifestMatch[1]})`);
const buildUserNavMatch = source.match(/function buildUserNav\(user\) \{[\s\S]*?\n\}/);
assert.ok(buildUserNavMatch);
const buildUserNav = vm.runInNewContext(`(${buildUserNavMatch[0]})`, { NAV: nav, JSON, launcherApps: null });
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


test('installed admin-nav apps enter the shared rail once, and uninstalled apps do not', () => {
  const rows = [
    {key:'agentsam',label:'AgentSam',installed:true,enabled:true,href:'/admin/agentsam',surfaces:['admin-nav','add-apps']},
    {key:'agentsam',label:'AgentSam',installed:true,enabled:true,href:'/admin/agentsam',surfaces:['admin-nav']},
    {key:'cad',label:'CAD Creator',installed:false,href:'/admin/cad',surfaces:['admin-nav','add-apps']},
    {key:'embed-only',label:'Widget',installed:true,enabled:true,href:'/admin/widget',surfaces:['add-apps']},
    {key:'analytics',label:'Analytics App',installed:true,enabled:true,href:'/admin/apps/analytics',surfaces:['admin-nav']},
    {key:'disabled',label:'Disabled App',installed:true,enabled:false,href:'/admin/apps/disabled',surfaces:['admin-nav']},
  ];
  const build = vm.runInNewContext('('+buildUserNavMatch[0]+')', {NAV:nav,JSON,launcherApps:rows});
  const rendered = build({primary_mailbox:'primary'});
  assert.deepEqual(Array.from(rendered.apps,item=>item.label), ['AgentSam','Analytics App','Email']);
  assert.equal(rendered.apps.filter(item=>item.href==='/admin/agentsam').length,1);
});

test('installed app nav rejects unsafe destinations and malicious catalogue labels', () => {
  const rows = [
    {key:'bad',label:'Bad',installed:true,enabled:true,href:'/admin/bad" onclick="evil',surfaces:['admin-nav']},
    {key:'external',label:'External',installed:true,enabled:true,href:'https://evil.example',surfaces:['admin-nav']},
    {key:'good',label:'<svg onload=bad()>',installed:true,enabled:true,href:'/admin/apps/good',surfaces:['admin-nav']},
  ];
  const build = vm.runInNewContext('('+buildUserNavMatch[0]+')', {NAV:nav,JSON,launcherApps:rows});
  const out = build(null);
  assert.equal(out.apps.some(item=>item.label==='Bad'),false);
  assert.equal(out.apps.some(item=>item.label==='External'),false);
  assert.equal(out.apps.some(item=>item.href==='/admin/apps/good'),true);
  assert.match(source,/function escapeNavText/);
  assert.match(source,/escapeNavText\(item\.label\)/);
});
