import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mediaKindForPath, isMarkdownPath, isHtmlPath, MAX_EDITOR_TEXT_CHARS } from './media.ts';

test('classifies media for the shared IDE without routing binary files through Monaco', () => {
  assert.equal(mediaKindForPath('assets/photo.webp'), 'image');
  assert.equal(mediaKindForPath('videos/intro.MP4'), 'video');
  assert.equal(mediaKindForPath('audio/theme.wav'), 'audio');
  assert.equal(mediaKindForPath('docs/guide.pdf'), 'pdf');
  assert.equal(mediaKindForPath('src/main.ts'), null);
  assert.equal(mediaKindForPath('docs/guide.md'), null);
});

test('recognizes editable document source and original HTML previews', () => {
  assert.equal(isMarkdownPath('README.md'), true);
  assert.equal(isMarkdownPath('article.MDX'), true);
  assert.equal(isHtmlPath('page/index.HTML'), true);
  assert.equal(isHtmlPath('src/index.tsx'), false);
  assert.equal(MAX_EDITOR_TEXT_CHARS, 500_000);
});
