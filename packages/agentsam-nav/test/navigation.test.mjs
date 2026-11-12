
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


test('navigation separates pinned, projects, and unfiled recent conversations', () => {
  const value = {
    destinations:[{id:'projects',label:'Projects',href:'/admin/projects',icon:React.createElement('span',null,'Project'),children:[{id:'project-a',label:'Project A',href:'/admin/projects/project-a'}]}],
    projects:[{id:'project-a',name:'Pinned project',pinned:true}],
    conversations:[{id:'older',title:'Older',updatedAt:10,projectId:'project-a'},{id:'newer',title:'Newer',updatedAt:20},{id:'pinned',title:'Important',pinned:true,updatedAt:30}],
    onNavigate:()=>{},showHistory:true,
  };
  const html=renderToString(React.createElement(Nav.Provider,{value,defaultOpen:true},React.createElement(Nav.Sidenav)));
  assert.match(html,/Expand Projects/);
  assert.match(html,/aria-label="Pinned"/);
  assert.match(html,/aria-label="Projects"/);
  assert.match(html,/aria-label="Recents"/);
  // A project-linked conversation is no longer repeated in the unfiled Recents.
  assert.doesNotMatch(html,/title="Older"/);
  assert.doesNotMatch(html,/title="Important"/);
  assert.match(html,/Search projects and conversations/);
  assert.match(html,/View all/);
});

test('active project expands to show live conversations, without duplicating them in Recents', () => {
  const value = {
    projects:[{id:'project-a',name:'Project A'}],
    conversations:[{id:'older',title:'Older',projectId:'project-a',updatedAt:10},{id:'newer',title:'Newer',projectId:'project-a',updatedAt:20}],
    conversation:{id:'older',title:'Older',projectId:'project-a'},
  };
  const html=renderToString(React.createElement(Nav.Provider,{value,defaultOpen:true},React.createElement(Nav.Sidenav)));
  const project=html.slice(html.indexOf('aria-label="Project A conversations"'));
  assert.match(html,/aria-label="Expand Project A conversations"|aria-label="Collapse Project A conversations"/);
  assert.match(project,/title="Newer"/);
  assert.match(project,/title="Older"/);
  assert.ok(project.indexOf('title="Newer"') < project.indexOf('title="Older"'));
  assert.equal((html.match(/title="Older"/g)||[]).length,1);
});

test('white-label environment selector remains distinct from the Chat / Work mode control', () => {
  const value = { brand:{name:'AgentSam'}, mode:'work', experiences:[
    {id:'agentsam',label:'AgentSam',description:'Create, learn and work'},
    {id:'developer',label:'Developer',description:'Build, debug and ship'},
  ], activeExperienceId:'agentsam', onSelectExperience:()=>{},onModeChange:()=>{} };
  const html=renderToString(React.createElement(Nav.Provider,{value,defaultOpen:true},React.createElement(Nav.Sidenav),React.createElement(Nav.ModeSwitcher)));
  assert.match(html,/aria-label="Switch application environment"/);
  assert.match(html,/aria-label="Conversation mode"/);
  assert.match(html,/aria-pressed="true">Work/);
});


test('shared Apps navigation exposes a host-owned add action on desktop and mobile', () => {
  const html = renderToString(React.createElement(Nav.Provider, {value: {
    showHistory:false, showSidebarHeader:false, pathname:'/admin/apps/campaign',
    destinations:[{id:'installed-apps',label:'Apps',icon:React.createElement('span',null,'Apps'),
      children:[{id:'campaign',label:'Campaign',href:'/admin/apps/campaign'}],
      action:{label:'Browse apps',onSelect:()=>{}}}],
  }, defaultOpen:true}, React.createElement(Nav.Sidenav)));
  assert.match(html,/aria-label="Browse apps"/);
  assert.match(html,/aria-label="Expand Apps"|aria-label="Collapse Apps"/);
  assert.match(html,/href="\/admin\/apps\/campaign"/);
  assert.equal((html.match(/aria-label="Browse apps"/g) || []).length,1);
});

test('shared Apps navigation renders an add action even when no app is installed', () => {
  const html = renderToString(React.createElement(Nav.Provider, {value: {
    showHistory:false,
    destinations:[{id:'installed-apps',label:'Apps',children:[],action:{label:'Browse apps',onSelect:()=>{}}}],
  }}, React.createElement(Nav.Sidenav)));
  assert.match(html,/aria-label="Browse apps"/);
  assert.match(html,/title="Apps"/);
});
