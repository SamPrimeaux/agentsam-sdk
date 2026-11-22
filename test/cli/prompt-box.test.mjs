import test from 'node:test';
import assert from 'node:assert/strict';
import { matchSlash, windowFor, renderStatusLine, renderSlashMenu, renderShortcutsPanel, renderInputPrompt, stripAnsi, MENU_ROWS, PLACEHOLDER } from '../../src/ui/cli/prompt-box.js';

const cmds = Array.from({ length: 20 }, (_, i) => ({ cmd: `/c${String(i).padStart(2, '0')}`, description: `desc ${i}` }));

test('slash matching: prefix first, bare slash lists all, args disable the menu', () => {
  assert.equal(matchSlash('/', cmds).length, 20);
  assert.deepEqual(matchSlash('/c0', cmds).map((c) => c.cmd).slice(0, 2), ['/c00', '/c01']);
  assert.deepEqual(matchSlash('/c01 foo', cmds), []);
  assert.deepEqual(matchSlash('hello', cmds), []);
});

test('menu shows exactly 8 rows and scrolls to keep the selection visible', () => {
  assert.equal(MENU_ROWS, 8);
  assert.equal(windowFor(20, 0), 0);
  assert.equal(windowFor(20, 9), 2);
  assert.equal(windowFor(20, 19), 12);
  const lines = renderSlashMenu({ items: cmds, selected: 9, offset: 0, color: false });
  const rows = lines.filter((l) => l.includes('/c'));
  assert.equal(rows.length, 8);
  assert.ok(rows.some((l) => l.includes('/c09')));
  assert.ok(!rows.some((l) => l.includes('/c00')));
  assert.match(lines.at(-1), /10\/20/);
});

test('status line: model and cwd left, hints right, fits the width', () => {
  const line = stripAnsi(renderStatusLine({ model: 'anthropic Claude Sonnet 5.5', cwd: '~/proj', cols: 100, color: false }));
  assert.match(line, /^  anthropic Claude Sonnet 5\.5 · ~\/proj\s+← for agents · \? for shortcuts\s*$/);
  assert.equal(line.length, 100);
  assert.match(renderStatusLine({ model: 'm', color: true }), /\x1b\[38;2;/);
});

test('shortcuts panel has three sections; prompt is a chevron; placeholder text', () => {
  const panel = stripAnsi(renderShortcutsPanel({ color: false }).join('\n'));
  for (const h of ['Compose', 'Edit', 'Session']) assert.match(panel, new RegExp(h));
  assert.equal(stripAnsi(renderInputPrompt()), '› ');
  assert.equal(PLACEHOLDER, 'Ask AgentSam to do anything');
});
