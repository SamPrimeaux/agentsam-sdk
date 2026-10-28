import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSvgMarkup } from "../src/node/vector.js";

test("dependency-free SVG normalization preserves geometry and standardizes the icon contract", () => {
  const source = '<svg width="24px" height="24px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M4 12h16"/></svg>';
  const result = normalizeSvgMarkup(source, { iconId: "arrow", semanticId: "navigation.arrow", strokeWidth: 2 });
  assert.match(result.svg, /width="24" height="24" viewBox="0 0 24 24"/);
  assert.match(result.svg, /stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/);
  assert.match(result.svg, /data-semantic="navigation\.arrow"/);
  assert.match(result.svg, /<path d="M4 12h16"\/>/);
  assert.equal(result.pathCount, 1);
  assert.equal(result.hasLiveText, false);
});

test("SVG normalization accepts an XML declaration and keeps the source viewport", () => {
  const source = '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M4 12h16"/></svg>';
  const result = normalizeSvgMarkup(source, { iconId: "arrow", semanticId: "navigation.arrow" });
  assert.match(result.svg, /id="icon-arrow"/);
  assert.match(result.svg, /data-semantic="navigation\.arrow"/);
  assert.equal(result.pathCount, 1);
});

test("SVG normalization rejects active content and live text", () => {
  assert.throws(() => normalizeSvgMarkup('<svg viewBox="0 0 24 24"><script>alert(1)</script><path d="M0 0h1"/></svg>'), { code: "svg_active_content" });
  assert.throws(() => normalizeSvgMarkup('<svg viewBox="0 0 24 24"><text>logo</text><path d="M0 0h1"/></svg>'), { code: "svg_live_text" });
});

test("SVG normalization rejects missing geometry, invalid viewport, and unsuitable strokes", () => {
  assert.throws(() => normalizeSvgMarkup('<svg viewBox="0 0 24 24"></svg>'), { code: "svg_geometry_missing" });
  assert.throws(() => normalizeSvgMarkup('<svg><path d="M0 0h1"/></svg>'), { code: "svg_viewbox_invalid" });
  assert.throws(() => normalizeSvgMarkup('<svg viewBox="0 0 24 24"><path d="M0 0h1"/></svg>', { strokeWidth: 4 }), { code: "svg_stroke_width_invalid" });
});
