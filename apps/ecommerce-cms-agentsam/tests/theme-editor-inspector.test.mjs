import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const editor = readFileSync(
  new URL('../frontend/static/js/theme-editor.js', import.meta.url),
  'utf8',
);

test('style settings filter keeps Surface group regardless of case', () => {
  assert.match(editor, /surface/i);
  assert.ok(
    editor.includes('/^(layout|spacing|surface|appearance|media)$/i') ||
      editor.includes('/^(layout|spacing|surface|appearance|media)$/I'),
    'settings group filter should accept Surface alongside Spacing',
  );
});

test('inspector subtitle shows human labels, not raw keys', () => {
  assert.ok(
    !editor.includes("sectionLabel + ' · ' + blockMeta.id"),
    'block subtitle should not expose the raw block id',
  );
  assert.ok(
    !editor.includes(") + ' · ' + section.key"),
    'section subtitle should not expose the raw section key',
  );
});

test('canvas breadcrumb shows human labels, not raw keys', () => {
  assert.ok(
    editor.includes('humanize(sectionKey'),
    'selection breadcrumb should humanize the section key',
  );
});
