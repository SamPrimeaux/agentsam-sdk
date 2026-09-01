import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderExplorer, renderSummary, safeText, treeRows } from '../src/ui/merkle/render.js';

const hash = 'sha256:' + 'a'.repeat(64);
const entries = [
  { path: '', type: 'directory', hash },
  { path: 'src', type: 'directory', hash },
  { path: 'src/app.js', type: 'file', hash, size: 12 },
  { path: 'bad\x1b[2J.txt', type: 'file', hash, size: 1 },
];
const tree = { rootPath: '/tmp/project', rootHash: hash, stats: { files: 2, symlinks: 0, bytes: 13 }, entries };
test('terminal rendering escapes file control sequences and fits a mobile terminal', () => {
  const state = { result: { title: 'Merkle root', tree }, expanded: new Set(['', 'src']), selected: 0 };
  const frame = renderExplorer(state, { columns: 40, rows: 24 });
  assert.ok(!frame.includes('\x1b'));
  assert.ok(frame.includes('\\u001b'));
  assert.ok(frame.split('\r\n').every((line) => [...line].length <= 39));
  assert.ok(frame.split('\r\n').length <= 23);
  assert.ok(frame.replaceAll('\r\n', '').includes(hash), 'full selected hash wraps without truncation');
  assert.equal(safeText('a\nb'), 'a\\u000ab');
  assert.ok(!renderSummary({ title: 'Merkle', tree }, { inspect: true }).includes('\x1b'));
});
test('explorer expands folders and can filter unchanged branches', () => {
  const result = { title: 'Verify', before: tree, tree: { ...tree, entries: entries.map((entry) => entry.path === 'src/app.js' ? { ...entry, hash: 'sha256:' + 'b'.repeat(64) } : entry) } };
  assert.ok(!treeRows(result, new Set([''])).some((entry) => entry.path === 'src/app.js'));
  assert.ok(treeRows(result, new Set(['', 'src'])).some((entry) => entry.path === 'src/app.js'));
  const changed = treeRows({ ...result, tree: { ...result.tree, entries: result.tree.entries.map((entry) => entry.type === 'directory' ? { ...entry, hash: 'sha256:' + 'b'.repeat(64) } : entry) } }, new Set(['', 'src']), true);
  assert.ok(changed.some((entry) => entry.path === 'src/app.js'));
  assert.ok(!changed.some((entry) => entry.path.startsWith('bad')));
});
