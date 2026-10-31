import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CoProStudio } from '../dist/studio.js';
import { CoProTimeline } from '../dist/timeline.js';
import { ResizeHandle, loadWorkspaceLayout, DEFAULT_WORKSPACE_LAYOUT, clampWorkspaceSize } from '../dist/workspace-layout-moviemode.js';

const project = {
  id: 'workspace-layout-fixture',
  tracks: [{
    id: 'video-1', kind: 'video', clips: [{
      id: 'clip-1', assetId: 'asset-1', startUs: 0, inUs: 0, durationUs: 5_000_000,
    }],
  }],
};

test('overlay image clips render one truncated label instead of duplicating the full asset id', () => {
  const filename = 'DreamHouse-V1.4-pool.png:1792804639592:2149398';
  const html = renderToStaticMarkup(React.createElement(CoProTimeline, {
    project:{id:'overlay-label-fixture',tracks:[{id:'overlay-1',kind:'overlay',clips:[{id:'image-1',assetId:'asset:'+filename,startUs:0,inUs:0,durationUs:3_000_000}]}]},
    playheadUs:0,
  }));
  assert.match(html,/class="copro-text-clip"><span>DreamHouse-V1\.4-pool\.png:1792804639592:2149398<\/span><\/span>/);
  assert.doesNotMatch(html,/class="copro-clip-label"/);
  assert.ok(html.includes('title="'+filename+'"'));
});

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
  assert.match(html, /Drop files here or browse/);
  assert.doesNotMatch(html, /aria-modal="true"/);
});


test('empty editor retains project details and full tool navigation without a creation sheet', () => {
  const html = renderToStaticMarkup(React.createElement(CoProStudio, {
    project:{id:'project:blank',tracks:[{id:'v1',kind:'video',clips:[]}]},
    selectedClipId:null,playheadUs:0,projectTitle:'Launch walkthrough',
  }));
  for (const label of ['MovieMode editing categories','Media collections','Import','Media','Subprojects','Yours','Generate','Spaces','Library','Project information','Launch walkthrough','Project details']) {
    const match = label==='Project details'? /aria-label="project settings"|>Project</i : label;
    assert.ok(typeof match==='string' ? html.includes(match) : match.test(html), label);
  }
  assert.doesNotMatch(html,/aria-modal="true"/);
});

test('empty preview offers direct import, template, and title entry points', () => {
  const html = renderToStaticMarkup(React.createElement(CoProStudio, {
    project:{id:'project:blank',tracks:[{id:'video',kind:'video',clips:[]}]},
    selectedClipId:null,playheadUs:0,projectTitle:'Untitled project',
  }));
  assert.match(html,/data-state="empty"/);
  assert.match(html,/aria-label="Start editing"/);
  for (const label of ['Your canvas is ready','Import media','Browse templates','Add title']) assert.ok(html.includes(label),label);
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

test('generated composition clips keep their SVG preview and sample motion/graphics against the timeline', () => {
  const composition={
    id:'project:creative',canvas:{width:1920,height:1080,frameRate:30},
    tracks:[{id:'creative-track',kind:'overlay',clips:[{
      id:'creative-clip',assetId:'asset:creative',startUs:0,durationUs:4_000_000,
      metadata:{creative:{schema:'copro.creative-clip.v1',parameters:{title:'Chapter'}},motion:{id:'rise-in'},graphic:{id:'counter',values:[0,25,50,75,100],durationUs:2_000_000}},
    }]}],
  };
  const html=renderToStaticMarkup(React.createElement(CoProStudio,{
    project:composition,selectedClipId:'creative-clip',playheadUs:1_000_000,projectTitle:'Creative preview',
    previewSrc:'data:image/svg+xml;base64,PHN2Zy8+',previewKind:'image',
    mediaItems:[{id:'asset:unrelated',name:'other.mp4',kind:'video',url:'blob:other'}],
    sampleMotion:()=>({x:0,y:0,scale:1,rotation:0,opacity:1,blur:0,clipInset:0,scaleX:1}),
    sampleGraphic:()=>({text:'50'}),
  }));
  assert.match(html,/src="data:image\/svg\+xml;base64,PHN2Zy8\+"/);
  assert.match(html,/class="copro-preview-graphic copro-preview-graphic-counter"/);
  assert.match(html,/>50<\/span>/);
});
