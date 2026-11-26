import assert from 'node:assert/strict';
import test from 'node:test';
import { withBrowserAnnotationBridge } from '../frontend/src/components/workbench/browser-build-result.ts';
import { buildAnnotationBridgeScript } from '@inneranimalmedia/agentsam-workbench/agent/annotation-selection';

test('opaque-origin browser previews use the shared bounded annotation bridge', () => {
  const html = withBrowserAnnotationBridge('<!doctype html><html><head></head><body><p>Preview</p></body></html>');
  const bridge = buildAnnotationBridgeScript();
  assert.match(html, /<script>[\s\S]*agentsam-browser[\s\S]*<\/script><\/body>/);
  assert.match(bridge, /annotation-mode/);
  assert.match(bridge, /data-annotation-target/);
  assert.match(bridge, /data-annotation-control/);
  assert.match(bridge, /data-annotation-ignore/);
  assert.match(bridge, /field value withheld/);
  assert.doesNotMatch(bridge, /closest\([^)]*\)\s*\|\|\s*element/);
});
