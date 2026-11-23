import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../public/primetech-onboarding/index.html', import.meta.url), 'utf8');

test('public PrimeTech tour exposes the same Assistant shell to the Store Chat preview', () => {
  for (const id of ['ast-panel', 'ast-btn', 'ast-min', 'ast-exp', 'ast-close', 'ast-form', 'ast-end', 'ast-no', 'ast-yes']) {
    assert.ok(source.includes(`id="${id}"`), `${id} is part of the canonical Assistant`);
  }
  assert.match(source, /assistantPreviewMode = new URLSearchParams/);
  assert.match(source, /assistant-preview-site/);
  assert.match(source, /if \(assistantPreviewMode\) setTimeout\(openPanel, 60\)/);
  assert.match(source, /!assistantPreviewMode && window\.claude/);
  assert.match(source, /No inbox or AI service is connected/);
  assert.match(source, /if \(new URLSearchParams\(location\.search\)\.get\("assistantPreview"\) !== "1"\)/);
  assert.match(source, /body\.assistant-preview \.ast-panel\.big/);
  assert.match(source, /max-width: calc\(100vw - 28px\)/);
});
