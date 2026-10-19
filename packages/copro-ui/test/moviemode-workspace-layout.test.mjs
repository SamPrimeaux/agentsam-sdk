import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CoProStudio } from '../dist/studio.js';
import { ResizeHandle, loadWorkspaceLayout, DEFAULT_WORKSPACE_LAYOUT, clampWorkspaceSize } from '../dist/workspace-layout-moviemode.js';

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


test('empty editor retains project details and full tool navigation without a creation sheet', () => {
  const html = renderToStaticMarkup(React.createElement(CoProStudio, {
    project:{id:'project:blank',tracks:[{id:'v1',kind:'video',clips:[]}]},
    selectedClipId:null,playheadUs:0,projectTitle:'Launch walkthrough',
  }));
  for (const label of ['MovieMode editing categories','Media collections','Import','Subprojects','Generate','Library','Project information','Launch walkthrough','Project details']) {
    const match = label==='Project details'? /aria-label="project settings"|>Project</i : label;
    assert.ok(typeof match==='string' ? html.includes(match) : match.test(html), label);
  }
  assert.doesNotMatch(html,/aria-modal="true"/);
});

test('reference-first desktop default is dense but fully user-adjustable',()=>{
  assert.equal(DEFAULT_WORKSPACE_LAYOUT.browserWidth,490);
  assert.equal(DEFAULT_WORKSPACE_LAYOUT.inspectorWidth,350);
  assert.equal(DEFAULT_WORKSPACE_LAYOUT.timelineHeight,0); // automatic 45% on initial layout
  assert.equal(DEFAULT_WORKSPACE_LAYOUT.browserFloating,false);
  assert.equal(DEFAULT_WORKSPACE_LAYOUT.inspectorFloating,false);
  const html=renderToStaticMarkup(React.createElement(CoProStudio,{project,selectedClipId:'clip-1',playheadUs:0,projectTitle:'Layout proof'}));
  const browserStart=html.indexOf('id="copro-tool-browser"');
  const categories=html.indexOf('class="mm-editor-categories"');
  const inspector=html.indexOf('id="copro-tool-inspector"');
  assert.ok(browserStart!==-1 && categories>browserStart && inspector>categories);
  assert.match(html,/aria-label="Undock Media browser"/);
  assert.match(html,/aria-label="Undock inspector"/);
  assert.match(html,/aria-label="Workspace layout preset"/);
  assert.doesNotMatch(html,/class="copro-desktop-rail"/);
});
