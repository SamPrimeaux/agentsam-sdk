import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_EDITOR_APPEARANCE, EDITOR_FONTS, normalizeEditorAppearance } from './editor-appearance.ts';

test('editor typography defaults to an installed-system fallback, not a required remote font', () => {
  assert.deepEqual(normalizeEditorAppearance(null), DEFAULT_EDITOR_APPEARANCE);
  assert.match(EDITOR_FONTS[0].family, /ui-monospace/);
});

test('editor appearance only accepts known fonts and bounded sizes', () => {
  const actual = normalizeEditorAppearance({ fontId: 'plex', fontSize: 40, minimap: true, wordWrap: false });
  assert.deepEqual(actual, { fontId: 'plex', fontSize: 24, minimap: true, wordWrap: false });
  assert.deepEqual(normalizeEditorAppearance({ fontId: 'bad', fontSize: Number.NaN, minimap: 'yes' }), DEFAULT_EDITOR_APPEARANCE);
});
