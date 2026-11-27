import test from 'node:test';
import assert from 'node:assert/strict';
import { assertInlineSvgSource } from '../src/svg-validation.js';

const valid = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g"><stop offset="0" stop-color="#123456"/></linearGradient></defs><path d="M10 10h80v80H10z" fill="url(#g)"/></svg>';

test('accepts inline SVG with local gradient references', () => {
  assert.equal(assertInlineSvgSource(valid), valid);
});

test('rejects active script content', () => {
  assert.throws(() => assertInlineSvgSource('<svg><script>alert(1)</script></svg>'), /svg_embedded_content_unsupported/);
});

test('rejects event-handler attributes', () => {
  assert.throws(() => assertInlineSvgSource('<svg onload="alert(1)"><path d="M0 0"/></svg>'), /svg_active_content_unsupported/);
});

test('rejects external href references', () => {
  assert.throws(() => assertInlineSvgSource('<svg><use href="https://example.com/mark.svg#mark"/></svg>'), /svg_external_reference_unsupported/);
});

test('rejects external paint-server references', () => {
  assert.throws(() => assertInlineSvgSource('<svg><path fill="url(https://example.com/paint.svg#gradient)" d="M0 0"/></svg>'), /svg_external_reference_unsupported/);
});

test('rejects embedded style attributes instead of silently dropping design styling', () => {
  assert.throws(() => assertInlineSvgSource('<svg><path style="fill:red" d="M0 0"/></svg>'), /svg_style_attributes_unsupported/);
});

test('rejects oversized SVG sources', () => {
  assert.throws(() => assertInlineSvgSource('<svg>' + ' '.repeat(256_001) + '</svg>'), /svg_source_too_large/);
});
