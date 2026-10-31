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

test('Template Studio combines the real composition catalog with retained editable sample timelines', () => {
  const html = renderToStaticMarkup(React.createElement(CoProProjectsScreen,{
    ...actions,
    projects:[
      {id:'demo:weekend',title:'Weekend cut',kind:'video',status:'draft',subtitle:'Sample timeline · no video supplied',updatedAt:'2026-10-01T00:00:00Z',durationMs:11900,aspectRatio:'9:16',example:true},
      {id:'demo:caption',title:'Caption layout',kind:'video',status:'draft',subtitle:'Sample tracks & captions',updatedAt:'2026-10-01T00:00:00Z',durationMs:11900,aspectRatio:'9:16',example:true},
    ],
    initialSection:'templates',
    creativeAssets:[
      {id:'creative:chapter-divider',category:'template',name:'Chapter Divider',group:'editorial',durationUs:4_000_000,aspectRatio:'16:9',previewUrl:'https://assets.test/chapter.svg'},
      {id:'creative:product-launch',category:'template',name:'Product Launch',group:'product',durationUs:6_000_000,aspectRatio:'9:16',previewUrl:'https://assets.test/product.svg'},
      {id:'creative:documentary-opener',category:'template',name:'Documentary opener',group:'documentary',durationUs:7_000_000,aspectRatio:'16:9',previewUrl:'https://assets.test/documentary.svg'},
      {id:'creative:caption-story',category:'template',name:'Word focus captions',group:'captions',durationUs:6_000_000,aspectRatio:'9:16',previewUrl:'https://assets.test/captions.svg'},
    ],
    onOpenCreativeTemplate:()=>{},
  }));
  for (const label of ['Template studio','Chapter Divider','Product Launch','For you','editorial','product','Search compositions','4 compositions']) assert.ok(html.includes(label),label);
  assert.match(html,/src="https:\/\/assets\.test\/chapter\.svg"/);
  assert.match(html,/src="https:\/\/assets\.test\/product\.svg"/);
  for (const label of ['Sample timelines','Weekend cut','Caption layout','Sample timeline · no video supplied','Caption layout','EXAMPLE','Open sample']) assert.ok(html.includes(label),label);
  assert.match(html,/aria-label="Sample timelines"/);
});

test('creative effects and transition pickers render catalog thumbnails and all four library lanes', () => {
  const creativeAssets=[
    {id:'warm-film',category:'treatment',name:'Warm Film',previewUrl:'https://assets.test/warm.svg'},
    {id:'film-grain',category:'overlay',name:'Film Grain',previewUrl:'https://assets.test/grain.svg'},
    {id:'rise-in',category:'animation',name:'Rise In',durationUs:800_000,previewUrl:'https://assets.test/rise.svg'},
    {id:'typewriter',category:'graphic',name:'Typewriter',previewUrl:'https://assets.test/type.svg'},
    {id:'gl:cross-warp',category:'transition',name:'Cross Warp',previewUrl:'https://assets.test/warp.svg'},
  ];
  const effects=renderToStaticMarkup(React.createElement(CoProToolPanel,{tool:'effects',hasSelectedClip:true,selectedClipId:'clip:1',creativeAssets,onClose:()=>{}}));
  for (const label of ['Looks','Overlays','Motion','Graphics','Warm Film']) assert.ok(effects.includes(label),label);
  assert.match(effects,/src="https:\/\/assets\.test\/warm\.svg"/);
  const transitions=renderToStaticMarkup(React.createElement(CoProToolPanel,{tool:'transitions',hasSelectedClip:true,selectedClipId:'clip:1',creativeAssets,onClose:()=>{}}));
  assert.ok(transitions.includes('Cross Warp'));
  assert.match(transitions,/src="https:\/\/assets\.test\/warp\.svg"/);
});

test('phone workspace keeps player, inline pane, timeline and five-item dock in the agreed order', async () => {
  const {readFile} = await import('node:fs/promises');
  const css = await readFile(new URL('../styles/copro.css',import.meta.url),'utf8');
  const phone = css.slice(css.lastIndexOf('/* Phone: player'));
  assert.match(phone,/grid-template-areas:"player" "pane" "timeline" "dock"/);
  assert.match(phone,/grid-area:pane/);
  assert.match(phone,/position:relative!important/);
  assert.doesNotMatch(phone,/position:absolute/);
  assert.match(phone,/minmax\(190px,24dvh\)/);
  assert.match(phone,/minmax\(140px,20dvh\)/);
  assert.match(phone,/scroll-snap-type:x proximity/);
  assert.match(phone,/env\(safe-area-inset-bottom/);
  const studio = await readFile(new URL('../src/studio.tsx',import.meta.url),'utf8');
  assert.match(studio,/const HANDSET_PRIMARY_TOOLS = \[\s*\[\"media\", \"Media\"\],\s*\[\"audio\", \"Audio\"\],\s*\[\"text\", \"Text\"\],\s*\[\"effects\", \"Effects\"\],\s*\[\"more\", \"More\"\]/);
  assert.match(studio,/data-active-pane=/);
  assert.match(studio,/Selected clip actions/);
});

test('medium workspace uses a 64px rail, one active pane, persistent player and adjustable full-width timeline', async () => {
  const {readFile} = await import('node:fs/promises');
  const css = await readFile(new URL('../styles/copro.css',import.meta.url),'utf8');
  const medium = css.slice(css.lastIndexOf('/* Medium workspaces'));
  assert.match(medium,/grid-template-columns:64px minmax\(250px,min\(34vw,340px\)\) minmax\(0,1fr\)/);
  assert.match(medium,/grid-template-areas:[\s\S]*?"dock pane player"/);
  assert.match(medium,/grid-area:pane/);
  assert.match(medium,/flex-direction:column/);
  assert.match(medium,/grid-area:timeline/);
  const studio = await readFile(new URL('../src/studio.tsx',import.meta.url),'utf8');
  assert.match(studio,/const isNarrow = workspaceWidth < 900/);
  assert.match(studio,/const isCompact = workspaceWidth < 600/);
});

test('phone tool content remains scrollable inside the persistent workspace pane', async () => {
  const {readFile} = await import('node:fs/promises');
  const css = await readFile(new URL('../styles/copro.css',import.meta.url),'utf8');
  const phone = css.slice(css.lastIndexOf('/* Phone: player'));
  assert.match(phone,/\.copro-editing-grid\.is-compact \.copro-tool-panel-body[^}]*overflow-y:auto/);
  assert.match(phone,/\.copro-editing-grid\.is-compact \.mm-more-tools-grid/);
  assert.match(phone,/\.copro-editing-grid\.is-compact>\.copro-context-tools/);
  assert.match(phone,/grid-area:dock/);
});
