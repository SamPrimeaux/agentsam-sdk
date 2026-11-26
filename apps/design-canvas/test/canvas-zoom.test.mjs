import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const built = await build({
  entryPoints: [new URL('../src/components/canvas-zoom.ts', import.meta.url).pathname],
  bundle: true, platform: 'node', format: 'esm', write: false
});
const { fitZoom, wheelZoom, anchoredScroll, clampZoom } = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));

test('fit respects both viewport dimensions and does not enlarge smaller boards', () => {
  assert.equal(fitZoom(664, 600, 1200, 675), 50);
  assert.equal(fitZoom(1800, 514, 1200, 900), 50);
  assert.equal(fitZoom(1800, 1500, 1200, 675), 100);
});
test('wheel zoom moves in the correct direction, uses proportional scaling, and clamps safely', () => {
  assert.ok(wheelZoom(100, -120) > 100);
  assert.ok(wheelZoom(100, 120) < 100);
  assert.equal(wheelZoom(400, -120), 400);
  assert.equal(wheelZoom(10, 120), 10);
  assert.equal(clampZoom(650), 400);
  assert.equal(clampZoom(0), 10);
});
test('cursor anchored zoom preserves the document coordinate at different viewport widths', () => {
  for (const viewport of [320, 700, 1600]) {
    for (const next of [25, 100, 240, 400]) {
      const size = 1200, oldZoom = 50, scroll = 300, pointer = viewport / 2 + 50;
      const coordinate = (scroll + pointer - viewport / 2) / (size * oldZoom / 100);
      const updatedScroll = anchoredScroll(size, next, coordinate, pointer, viewport);
      assert.ok(Math.abs((updatedScroll + pointer - viewport / 2) / (size * next / 100) - coordinate) < 1e-9);
    }
  }
});
