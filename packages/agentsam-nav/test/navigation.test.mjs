
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { Nav, NavBreadcrumbs, resolveNavDestinations, navBreadcrumbs } from '../dist/index.js';
const items = [
  { id: 'home', label: 'Home', href: '/' },
  { id: 'products', label: 'Products', href: '/admin/products', children: [
    { id: 'collections', label: 'Collections', href: '/admin/products/collections', children: [
      { id: 'summer', label: 'Summer', href: '/admin/products/collections/summer' },
    ] },
  ] },
];
test('deepest route selects once, expands ancestors, and generates navigation breadcrumbs', () => {
  const resolved = resolveNavDestinations(items, '/admin/products/collections/summer/edit?draft=1');
  assert.deepEqual(navBreadcrumbs(resolved).map(x => x.id), ['products', 'collections', 'summer']);
  assert.equal(resolved[0].active, false);
  assert.equal(resolved[1].active, false);
  assert.equal(resolved[1].children[0].children[0].active, true);
  const html = renderToString(React.createElement(Nav.Provider, { value: { destinations: items, pathname: '/admin/products/collections/summer/edit', showHistory: false } },
    React.createElement(Nav.Sidenav), React.createElement(NavBreadcrumbs)));
  assert.equal((html.match(/aria-expanded="true" aria-controls="as-nav-submenu-/g) ?? []).length, 2);
  assert.match(html, /aria-label="Breadcrumb"/);
  assert.doesNotMatch(html, /Search conversations|Your conversations will appear/);
  assert.match(html, /href="\/admin\/products\/collections\/summer"/);
});
test('route boundaries do not select lookalike paths; explicit exact matches stay exact', () => {
  assert.deepEqual(navBreadcrumbs(resolveNavDestinations(items, '/admin/products-old')), []);
  assert.deepEqual(navBreadcrumbs(resolveNavDestinations([{ ...items[1], children: undefined, exact: true }], '/admin/products/12')), []);
  assert.equal(resolveNavDestinations(items), items, 'caller supplied active state remains valid without a router pathname');
});
test('standalone provider resize is opt-in and exposes an accessible bounded separator', () => {
  const html = renderToString(React.createElement(Nav.Provider, { resizable: true, value: { showHistory: false } }, React.createElement(Nav.Sidenav)));
  assert.match(html, /role="separator" aria-label="Resize navigation"/);
  assert.match(html, /aria-valuemin="208" aria-valuemax="400" aria-valuenow="264"/);
  assert.match(html, /--nav-width:264px/);
});

test('query destinations require their parameters and outrank queryless routes', () => {
  const destinations = [
    { id: 'all', label: 'All products', href: '/admin/products' },
    { id: 'collections', label: 'Collections', href: '/admin/products?view=collections' },
    { id: 'platform', label: 'Platform', href: '/admin/products?view=platform' },
    { id: 'filtered', label: 'Filtered', href: '/admin/products?view=collections&status=active' },
    { id: 'duplicate', label: 'Duplicate', href: '/admin/products?view=collections' },
  ];
  const selected = (path) => navBreadcrumbs(resolveNavDestinations(destinations, path)).at(-1)?.id;
  assert.equal(selected('/admin/products'), 'all');
  assert.equal(selected('/admin/products?view=collections'), 'collections');
  assert.equal(selected('/admin/products?view=platform&sort=name'), 'platform');
  assert.equal(selected('/admin/products?view=collections&status=active&page=2'), 'filtered');
  assert.equal(selected('/admin/products?view=unknown'), 'all');
  assert.equal(selected('/admin/products?view=collections#saved'), 'collections');
  assert.equal(selected('/admin/products?other=collections'), 'all');
  const reversed = [...destinations].reverse();
  assert.equal(navBreadcrumbs(resolveNavDestinations(reversed, '/admin/products?view=collections')).at(-1)?.id, 'duplicate', 'equal specificity keeps first declared');
});

test('a host-owned global toggle suppresses the duplicate sidebar hamburger', () => {
  const html = renderToString(React.createElement(Nav.Provider, { value: { showSidebarHeader: false, showHistory: false } },
    React.createElement(Nav.Sidenav), React.createElement(Nav.Topbar)));
  assert.equal((html.match(/aria-label="Toggle sidebar"/g) ?? []).length, 1);
  assert.doesNotMatch(html, /as-nav-sidenav-head/);
});
test('parent destinations navigate directly while a separate button controls their children', () => {
  const destinations = [{ id: 'products', label: 'Products', href: '/admin/products', children: [
    { id: 'collections', label: 'Collections', href: '/admin/products?view=collections' },
  ] }];
  const render = (pathname) => renderToString(React.createElement(Nav.Provider, { value: { destinations, pathname, showHistory: false } }, React.createElement(Nav.Sidenav)));
  const parent = render('/admin/products');
  assert.match(parent, /<a class="as-nav-destination" href="\/admin\/products" title="Products" aria-label="Products" aria-current="page"/);
  assert.match(parent, /<button[^>]+aria-label="Collapse Products"[^>]+aria-expanded="true"/);
  const child = render('/admin/products?view=collections');
  assert.match(child, /class="as-nav-parent-row" data-active="true"/);
  assert.match(child, /aria-current="page" href="\/admin\/products\?view=collections"/);
  assert.equal((child.match(/aria-current="page"/g) ?? []).length, 1);
});


test('workspace collections separate pins and order recent conversations by genuine activity', () => {
  const value = {projects:[{id:'project-a',name:'Pinned project',pinned:true}],conversations:[{id:'older',title:'Older',updatedAt:10,projectId:'project-a'},{id:'newer',title:'Newer',updatedAt:20},{id:'pinned',title:'Important',pinned:true,updatedAt:30}]};
  const html=renderToString(React.createElement(Nav.Provider,{value},React.createElement(Nav.Sidenav)));
  const pinned=html.slice(html.indexOf('aria-label="Pinned"'),html.indexOf('aria-label="Recent"'));
  const recent=html.slice(html.indexOf('aria-label="Recent"'));
  assert.match(pinned,/Pinned project/);assert.match(pinned,/Important/);
  assert.ok(recent.indexOf('title="Newer"')<recent.indexOf('title="Older"'));
  assert.doesNotMatch(recent,/title="Important"/);
  assert.match(html,/Search projects and conversations/);
});
