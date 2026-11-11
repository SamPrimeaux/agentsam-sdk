import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { syncEditorChromeTokens, EDITOR_CHROME_TOKEN_MAP } from '../frontend/theme-editor/mount.mjs';

const require = createRequire(new URL('../package.json', import.meta.url));
const { JSDOM } = require('jsdom');

test('packaged CMS editor inherits host-shell tokens, not storefront content or brand constants', () => {
  const host = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
  const editor = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
  try {
    host.window.document.documentElement.style.setProperty('--color-accent', '#217e75');
    host.window.document.documentElement.style.setProperty('--color-background', '#10171a');
    host.window.document.documentElement.style.setProperty('--color-card', '#1b2529');
    host.window.document.documentElement.style.setProperty('--font-sans', 'Inter, sans-serif');
    syncEditorChromeTokens(host.window.document, editor.window.document);
    const style = editor.window.document.documentElement.style;
    assert.equal(style.getPropertyValue('--te-accent'), '#217e75');
    assert.equal(style.getPropertyValue('--te-canvas'), '#10171a');
    assert.equal(style.getPropertyValue('--te-panel'), '#1b2529');
    assert.equal(style.getPropertyValue('--te-font'), 'Inter, sans-serif');
    assert.equal(Object.keys(EDITOR_CHROME_TOKEN_MAP).length, 8);
    // A host setting change updates the *same* editor, without rebuilding it.
    host.window.document.documentElement.style.setProperty('--color-accent', '#cb5538');
    syncEditorChromeTokens(host.window.document, editor.window.document);
    assert.equal(style.getPropertyValue('--te-accent'), '#cb5538');
    // An explicit host-supplied token may override an inherited shell value.
    syncEditorChromeTokens(host.window.document, editor.window.document, { '--color-accent': '#2948bd' });
    assert.equal(style.getPropertyValue('--te-accent'), '#2948bd');
    // A missing token is not silently replaced with unrelated customer colors.
    host.window.document.documentElement.style.removeProperty('--color-accent');
    syncEditorChromeTokens(host.window.document, editor.window.document);
    assert.equal(style.getPropertyValue('--te-accent'), '');
  } finally {
    host.window.close();
    editor.window.close();
  }
});
