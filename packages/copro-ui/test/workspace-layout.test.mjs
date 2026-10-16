import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CoProStudio } from '../dist/studio.js';
import { ResizeHandle, loadWorkspaceLayout, DEFAULT_WORKSPACE_LAYOUT, clampWorkspaceSize } from '../dist/workspace-layout.js';

const project = {
  id: 'workspace-layout-fixture',
  tracks: [{
    id: 'video-1', kind: 'video', clips: [{
      id: 'clip-1', assetId: 'asset-1', startUs: 0, inUs: 0, durationUs: 5_000_000,
    }],
  }],
};

test('workspace defaults are bounded and can render without localStorage or window', () => {
  assert.deepEqual(loadWorkspaceLayout(), DEFAULT_WORKSPACE_LAYOUT);
  assert.equal(clampWorkspaceSize(-100, 240, 540), 240);
  assert.equal(clampWorkspaceSize(9999, 240, 540), 540);
});

test('drag handles expose accessible range and keyboard guidance', () => {
  const html = renderToStaticMarkup(React.createElement(ResizeHandle, {
    axis: 'x', label: 'Resize tool browser', value: 328, min: 240, max: 540,
    onChange: () => {},
  }));
  assert.match(html, /role="separator"/);
  assert.match(html, /aria-orientation="vertical"/);
  assert.match(html, /aria-valuenow="328"/);
  assert.match(html, /tabindex="0"/i);
});

test('desktop editor separates creation browser and selected clip inspector', () => {
  const html = renderToStaticMarkup(React.createElement(CoProStudio, {
    project, selectedClipId: 'clip-1', playheadUs: 500_000, projectTitle: 'Layout proof',
    mediaItems: [{ id: 'asset-1', name: 'sample.webm', kind: 'video', url: 'blob:test' }],
  }));
  assert.match(html, /id="copro-tool-browser"/);
  assert.match(html, /id="copro-tool-inspector"/);
  assert.match(html, /aria-label="Resize tool browser"/);
  assert.match(html, /aria-label="Resize clip inspector"/);
  assert.match(html, /aria-label="Resize timeline"/);
  assert.match(html, /data-layout-mode="wide"/);
  assert.match(html, /sample\.webm/);
  assert.doesNotMatch(html, /aria-modal="true"/);
});
