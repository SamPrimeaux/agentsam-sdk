import assert from 'node:assert/strict';
import test from 'node:test';
import { visibleWorkspaceTree, workspaceParents, workspaceTree } from './tree.ts';

const entries = [
  { path: 'pages/home.html', kind: 'file' as const },
  { path: 'pages/blog/post.html', kind: 'file' as const },
  { path: 'settings/tokens.json', kind: 'file' as const },
  { path: 'pages', kind: 'folder' as const },
  { path: 'README.md', kind: 'file' as const },
];

test('authorized flat workspace files form a navigable explorer without duplicate folders', () => {
  const result = workspaceTree(entries);
  assert.deepEqual(result.filter(item => item.kind === 'folder').map(item => item.path), ['pages', 'pages/blog', 'settings']);
  assert.equal(result.filter(item => item.path === 'pages').length, 1);
  assert.deepEqual(workspaceParents('pages/blog/post.html'), ['pages', 'pages/blog']);
});

test('closed directories hide only their descendants', () => {
  const root = visibleWorkspaceTree(entries, new Set());
  assert.deepEqual(root.map(item => item.path), ['pages', 'settings', 'README.md']);
  const pages = visibleWorkspaceTree(entries, new Set(['pages']));
  assert.ok(pages.some(item => item.path === 'pages/blog'));
  assert.ok(pages.some(item => item.path === 'pages/home.html'));
  assert.ok(!pages.some(item => item.path === 'pages/blog/post.html'));
  const nested = visibleWorkspaceTree(entries, new Set(['pages', 'pages/blog']));
  assert.ok(nested.some(item => item.path === 'pages/blog/post.html'));
});
