import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
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

test('brand image surfaces retain an icon fallback when a consumer image fails', async () => {
  const source = await import('node:fs/promises').then(({ readFile }) =>
    readFile(new URL('../src/Surfaces.tsx', import.meta.url), 'utf8'),
  );
  assert.match(source, /logoFailed/);
  assert.match(source, /onError=\{\(\) => setLogoFailed\(true\)\}/);
  assert.match(source, /: <PanelLeft \/>/);
});
