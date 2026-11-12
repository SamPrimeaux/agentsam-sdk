import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { Nav } from '../dist/index.js';

const value = { brand: { name: 'Consumer brand', home: '/custom' }, project: { id: 'p', name: 'Project One' }, conversation: { id: 'c', title: 'Conversation One' }, account: { id: 'a', name: 'Account One' } };
for (const [name, surfaces] of [['sidenav only', [Nav.Sidenav]], ['topbar only', [Nav.Topbar]], ['both surfaces', [Nav.Sidenav, Nav.Topbar]]]) {
  test(`${name} renders through a single provider without application services`, () => {
    const html = renderToString(React.createElement(Nav.Provider, { value, theme: 'light', accentColor: '#123456', defaultOpen: true }, ...surfaces.map((Surface, index) => React.createElement(Surface, { key: index }))));
    assert.match(html, /data-nav-theme="light"/);
    assert.match(html, /--nav-accent:#123456/);
    if (surfaces.includes(Nav.Sidenav)) assert.match(html, /Application navigation/);
    if (surfaces.includes(Nav.Topbar)) assert.match(html, /Conversation One/);
  });
}
test('sidebar groups expand inline, not as portal menus or floating cards', () => {
  const destinations = [
    { id: 'home', label: 'Home', href: '/' },
    { id: 'apps', label: 'Apps', active: true, children: [
      { id: 'cad', label: 'CAD Creator', href: '/cad', active: true },
      { id: 'sites', label: 'Sites', href: '/cms' },
    ] },
    { id: 'products', label: 'Products', children: [
      { id: 'all-products', label: 'All products', href: '/admin/products' },
    ] },
  ];
  const html = renderToString(React.createElement(Nav.Provider,
    { value: { ...value, destinations }, defaultOpen: true }, React.createElement(Nav.Sidenav)));
  assert.match(html, /aria-expanded="true" aria-controls="as-nav-submenu-apps"/);
  assert.match(html, /role="group" aria-label="Apps pages"/);
  assert.match(html, /aria-current="page"/);
  assert.match(html, /CAD Creator/);
  assert.match(html, /aria-expanded="false" aria-controls="as-nav-submenu-products"/);
  assert.doesNotMatch(html, /as-nav-popover/, 'navigation should not use flyout card popovers');
  assert.doesNotMatch(html, /All products/, 'other groups remain collapsed');
});

test('consumer context and brand tokens stay isolated between providers', () => {
  const html = renderToString(React.createElement(React.Fragment, null,
    React.createElement(Nav.Provider, { value, tokens: { sidebar: '#223344' } }, React.createElement(Nav.Sidenav)),
    React.createElement(Nav.Provider, { value: { conversation: { id: 'other', title: 'Other workspace' } }, theme: 'light' }, React.createElement(Nav.Topbar))));
  assert.match(html, /--nav-sidebar:#223344/);
  assert.match(html, /Other workspace/);
});

test('topbar and brand-hover sidebar controls share provider state', async () => {
  const html = renderToString(React.createElement(Nav.Provider,
    { value, defaultOpen: false },
    React.createElement(Nav.Topbar),
    React.createElement(Nav.TopbarLogo, { toggle: true })));
  assert.match(html, /class="agentsam-nav__trigger"/, 'legacy topbar uses provider trigger');
  assert.match(html, /as-nav-work-brand-toggle/, 'brand control is the same provider navigation action');
  assert.match(html, /aria-label="Open sidebar"/);
  assert.match(html, /aria-keyshortcuts="Meta\+Shift\+S"/);
  assert.match(html, /as-nav-work-brand-toggle__control/);
  const source = await import('node:fs/promises').then(({ readFile }) => readFile(new URL('../src/shell.css', import.meta.url),'utf8'));
  assert.match(source, /as-nav-work-brand-toggle__mark img\.as-nav-logo-light/);
  assert.match(html, /aria-expanded="false"/);
  assert.doesNotMatch(html, /as-nav-brand--toggle/);
});
test('brand image surfaces retain an icon fallback when a consumer image fails', async () => {
  const source = await import('node:fs/promises').then(({ readFile }) =>
    readFile(new URL('../src/Surfaces.tsx', import.meta.url), 'utf8'),
  );
  assert.match(source, /logoFailed/);
  assert.match(source, /onError=\{\(\) => setLogoFailed\(true\)\}/);
  assert.match(source, /: <PanelLeft \/>/);
});


test('sidebar provides one search button and discloses the filter only on demand', () => {
  const html = renderToString(React.createElement(Nav.Provider,
    {value:{...value,onSearch:()=>{}},defaultOpen:true},React.createElement(Nav.Sidenav)));
  assert.equal((html.match(/aria-label="Search projects and conversations"/g) || []).length,1);
  assert.match(html,/aria-expanded="false"/);
  assert.doesNotMatch(html,/Find a chat or project/);
  assert.doesNotMatch(html,/Search all Studio/);
  assert.doesNotMatch(html,/Filter projects and conversations/);
});


test('active conversation has one shared Chat Actions trigger beside public link and summary', () => {
  const conversation = { id: 'chat-1', title: 'Editable thread title', pinned: false, projectId: null };
  const html = renderToString(React.createElement(Nav.Provider, {
    value: {
      conversation, projects: [{ id: 'project-1', name: 'Studio project' }],
      onPinConversation: () => {}, onRenameConversation: () => {}, onArchiveConversation: () => {},
      onDeleteConversation: () => {}, onAssignConversationToProject: () => {},
      onShare: () => {}, pinnedSummary: { outputs: [], sources: [] },
    },
  }, React.createElement(Nav.Topbar)));
  assert.match(html, /title="Editable thread title"/);
  assert.doesNotMatch(html, /aria-label="Editable thread title"/, 'title is not another action menu');
  assert.equal((html.match(/aria-label="Conversation options"/g) || []).length, 1);
  assert.match(html, /aria-label="Create a public link"/);
  assert.match(html, /aria-label="Toggle pinned summary"/);
  const source = readNavSource();
  assert.match(source, /label: 'Move to project'/);
  assert.match(source, /label: 'Rename'/);
  assert.match(source, /label: 'Archive'/);
  assert.match(source, /label: 'Delete'/);
  assert.match(source, /ConfirmDeleteDialog/);
});

test('resource summary offers host-configured plus actions without installing a registry', () => {
  const html = renderToString(React.createElement(Nav.Provider, {
    value: { pinnedSummary: { outputs: [{id:'doc',label:'Existing document'}], sources: [],
      outputActions: [{id:'create-site',label:'Create site',onSelect:()=>{}}],
      sourceActions: [{id:'browse-files',label:'Browse files',onSelect:()=>{}}] } },
  }, React.createElement(Nav.PinnedSummary)));
  assert.match(html, /aria-label="Toggle pinned summary"/);
  const source = readNavSource();
  assert.match(source, /data\.pinnedSummary\?\.outputActions/);
  assert.match(source, /data\.pinnedSummary\?\.sourceActions/);
  assert.match(source, /className="as-nav-activity-add-actions"/);
});

test('menu actions expose loading/disabled state through Radix instead of fake callbacks', () => {
  const source = readNavSource();
  assert.match(source, /disabled=\{action\.disabled \|\| action\.loading \|\| !action\.onSelect\}/);
  assert.match(source, /aria-busy=\{action\.loading \|\| undefined\}/);
  assert.match(source, /collisionPadding=\{12\}/);
});

function readNavSource() {
  return readFileSync(new URL('../src/Surfaces.tsx', import.meta.url), 'utf8');
}


test('mobile launch dock is driven by real host destinations and has accessible selected states', () => {
  const labels = ['Chats', 'Work', 'Browser', 'Files', 'Apps'];
  const html = renderToString(React.createElement(Nav.Provider,
    {value,defaultOpen:true}, React.createElement(Nav.LaunchDock, {
      items: labels.map((label,index) => ({
        id: label.toLowerCase(), label,
        icon: React.createElement('span',null,String(index)),
        active: index===2, onSelect:()=>{},
      }))
    })));
  assert.match(html,/aria-label="Quick navigation"/);
  for(const label of labels) assert.match(html,new RegExp('aria-label="'+label+'"'));
  assert.equal((html.match(/aria-pressed="true"/g) || []).length, 1);
  assert.equal((html.match(/class="as-nav-launch-dock-icon"/g) || []).length, 5);
});
