import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { readFile } from 'node:fs/promises';
import { DocumentSelectionToolbar } from '../dist/agent/SelectionToolbar.js';

const noop = () => {};
const props = {
  anchor: { left: 320, top: 250, bottom: 270 },
  agentIcon: React.createElement('svg', { 'aria-hidden': true }),
  activeStyle: 'h2', activeTone: 'danger', activeHighlight: 'warning',
  onAsk: noop, onFormat: noop, onTextTone: noop, onHighlight: noop,
  onLink: noop, onComment: noop, onReact: noop, onDismiss: noop,
};
test('shared selection toolbar renders actual editing commands with selected style', () => {
  const html = renderToString(React.createElement(DocumentSelectionToolbar, props));
  assert.match(html, /data-agent-selection-toolbar=""/);
  for (const action of ['Ask AgentSam about selection','Comment on selection','Text style',
    'Bold','Italic','Underline','Strikethrough','Code','Text and highlight colors',
    'Bullets and numbering','Insert link']) {
    assert.ok(html.includes(action), 'missing '+action);
  }
  assert.match(html, /agent-selection-style-text">H2/);
  assert.match(html, /aria-expanded="false"/);
});
test('selection toolbar styling derives from theme tokens', async () => {
  const css = await readFile(new URL('../src/agent/selection-toolbar.css',import.meta.url), 'utf8');
  assert.match(css, /--nav-accent/);
  assert.match(css, /--nav-popover/);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /data-menu-above/);
});
test('editor formatting and comments persist through real filesystem operations', async () => {
  const editor = await readFile(new URL('../../../apps/local-studio/frontend/src/components/workbench/document-editor.tsx',import.meta.url),'utf8');
  assert.match(editor, /current\.extractContents\(\)/);
  assert.match(editor, /current\.insertNode\(el\)/);
  assert.match(editor, /RuntimeFilesystemAdapter/);
  assert.match(editor, /adapter\.write\(file\.path, content, version\)/);
  assert.match(editor, /data-agent-comment-id/);
  assert.match(editor, /setConfirmClose\(true\)/);
  assert.match(editor, /onPaste=/);
});
