import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {CoProProjectsScreen} from '../dist/projects.js';
import {CoProToolPanel} from '../dist/tool-sheet.js';

const actions = {onCreate:()=>{},onImport:()=>{},onOpenProject:()=>{},onRecord:()=>{},onOpenTool:()=>{},onRenameProject:()=>{},onDeleteProject:()=>{},onDuplicateProject:()=>{}};

test('MovieMode home has direct create, media, recording, timeline, project library without creation modal', () => {
  const html = renderToStaticMarkup(React.createElement(CoProProjectsScreen,{
    ...actions, projects:[{id:'project:1',title:'Dashboard Walkthrough',kind:'video',status:'draft',updatedAt:'2026-10-16T12:00:00Z',durationMs:25000}],
  }));
  for(const label of ['MovieMode','Create project','Video Studio','Record screen','Your projects','Dashboard Walkthrough','Import media','Search projects','Grid view','List view']) assert.ok(html.includes(label),label);
  assert.doesNotMatch(html,/copro-sheet-backdrop|aria-modal="true"/);
  assert.match(html,/aria-label="MovieMode navigation"/);
  assert.match(html,/aria-label="Project actions for Dashboard Walkthrough"/);
});

test('selected video transform inspector exposes precise working scale/XY/rotation/opacity fields', () => {
  const html = renderToStaticMarkup(React.createElement(CoProToolPanel,{
    tool:'transform',hasSelectedClip:true, selectedClipId:'video:1',onClose:()=>{},
    transform:{scale:1.35,x:12,y:-6,rotation:90,opacity:0.75},onTransformChange:()=>{},
  }));
  for(const label of ['Scale slider','Position X slider','Position Y slider','Rotate slider','Opacity slider','Reset Scale']) assert.ok(html.includes(label),label);
  assert.match(html,/value="135"/);
  assert.match(html,/value="90"/);
  assert.match(html,/value="75"/);
});

test('stickers are editable timeline overlays with explicit creation controls',()=>{
  const html = renderToStaticMarkup(React.createElement(CoProToolPanel,{tool:'stickers',onClose:()=>{},onTextCommit:()=>{}}));
  assert.match(html,/Add Arrow right to timeline/);
  assert.match(html,/Add Star to timeline/);
  assert.doesNotMatch(html,/not yet available/i);
});
