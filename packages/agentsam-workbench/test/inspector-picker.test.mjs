import assert from 'node:assert/strict';
import test from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {InspectorPicker} from '../dist/shell/index.js';
import {studioInspectorFamilies} from '../dist/shell/studio-panels.js';

const render = value => renderToStaticMarkup(createElement(InspectorPicker, {
  families: studioInspectorFamilies, value, onChange() {},
}));

test('inspector exposes the four property categories without a native select', () => {
  const html = render('object');
  for (const group of ['Selection', 'Scene', 'Engineering', 'Document']) {
    assert.match(html, new RegExp('>' + group + '</button>'));
  }
  assert.doesNotMatch(html, /<select/);
  assert.match(html, /aria-pressed="true">Selection/);
  assert.match(html, /Object &amp; Transform/);
  assert.match(html, /Geometry/);
  assert.match(html, /Materials/);
});

test('scene properties are direct contextual buttons and honor external selection', () => {
  const html = render('terrain');
  assert.match(html, /aria-pressed="true">Scene/);
  assert.match(html, /title="Terrain &amp; Site" aria-pressed="true"/);
  for (const label of ['Camera', 'Environment', 'Lighting', 'Rendering', 'Motion &amp; Presentation']) {
    assert.ok(html.includes(label), label);
  }
});
