import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {CoProProjectsScreen} from '../dist/projects.js';
import {CoProToolPanel} from '../dist/tool-sheet.js';

const actions = {onCreate:()=>{},onImport:()=>{},onOpenProject:()=>{},onRecord:()=>{},onOpenTool:()=>{},onRenameProject:()=>{},onDeleteProject:()=>{},onDuplicateProject:()=>{}};

test('MovieMode home prioritizes saved projects with one create action and no promo landing', () => {
  const html = renderToStaticMarkup(React.createElement(CoProProjectsScreen,{
    ...actions, projects:[{id:'project:1',title:'Dashboard Walkthrough',kind:'video',status:'draft',updatedAt:'2026-10-16T12:00:00Z',durationMs:25000}],
  }));
  for(const label of ['MovieMode','Create project','Your projects','Dashboard Walkthrough','Import','Templates','Search projects','Grid view','List view']) assert.ok(html.includes(label),label);
  assert.doesNotMatch(html,/Create project<\/strong><small>Open the full timeline editor/);
  assert.doesNotMatch(html,/Video Studio|More tools|Template Studio/);
  assert.doesNotMatch(html,/copro-sheet-backdrop|aria-modal="true"/);
  assert.match(html,/aria-label="MovieMode navigation"/);
  assert.match(html,/aria-label="Project actions for Dashboard Walkthrough"/);
  const createButtons = html.split('Create project').length - 1;
  assert.ok(createButtons <= 3, 'home must not spam redundant create CTAs');
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

test('Templates page uses honest project-template language and keeps samples separate', () => {
  const html = renderToStaticMarkup(React.createElement(CoProProjectsScreen,{
    ...actions,
    projects:[
      {id:'demo:weekend',title:'Weekend cut',kind:'video',status:'draft',subtitle:'Sample timeline · no video supplied',updatedAt:'2026-10-01T00:00:00Z',durationMs:11900,aspectRatio:'9:16',example:true},
      {id:'demo:caption',title:'Caption layout',kind:'video',status:'draft',subtitle:'Sample tracks & captions',updatedAt:'2026-10-01T00:00:00Z',durationMs:11900,aspectRatio:'9:16',example:true},
    ],
    initialSection:'templates',
    creativeAssets:[
      {id:'creative:chapter-divider',category:'template',name:'Chapter Divider',group:'editorial',durationUs:4_000_000,aspectRatio:'16:9',previewUrl:'https://assets.test/chapter.svg'},
      {id:'creative:product-launch',category:'template',name:'Product launch',group:'product',durationUs:6_000_000,aspectRatio:'9:16',previewUrl:'https://assets.test/product.svg',featured:true,description:'Project template (product). Instantiates a distinct editable CoPro project.'},
      {id:'creative:documentary-opener',category:'template',name:'Documentary opener',group:'documentary',durationUs:7_000_000,aspectRatio:'16:9',previewUrl:'https://assets.test/documentary.svg',featured:true,description:'Project template (documentary). Instantiates a distinct editable CoPro project.'},
      {id:'creative:social-story',category:'template',name:'Social story',group:'social',durationUs:6_000_000,aspectRatio:'9:16',previewUrl:'https://assets.test/social.svg',featured:true,description:'Project template (social). Instantiates a distinct editable CoPro project.'},
      {id:'creative:caption-story',category:'template',name:'Word focus captions',group:'captions',durationUs:6_000_000,aspectRatio:'9:16',previewUrl:'https://assets.test/captions.svg'},
    ],
    onOpenCreativeTemplate:()=>{},
  }));
  for (const label of ['Templates','Chapter Divider','Product launch','All templates','editorial','product','Search templates','5 templates']) assert.ok(html.includes(label),label);
  assert.match(html,/src="https:\/\/assets\.test\/chapter\.svg"/);
  assert.match(html,/src="https:\/\/assets\.test\/product\.svg"/);
  // Featured cards must render catalog-owned names — not a UI-invented parallel label registry.
  for (const label of ['Featured templates','Documentary opener','Product launch','Social story','Sample timelines','Weekend cut','Caption layout','SAMPLE']) assert.ok(html.includes(label),label);
  assert.doesNotMatch(html,/FEATURED_PROJECT_TEMPLATES|BATCH1_SHOWCASE|Documentary Opener|Product Showcase|Social Video/);
  assert.doesNotMatch(html,/Batch 1 presentation|editable starter projects arrive in Batch 2|EDITABLE COMPOSITION|Use this composition/);
  assert.match(html,/aria-label="Featured project templates"/);
  assert.match(html,/aria-label="Sample timelines"/);
  assert.match(html,/PROJECT TEMPLATES/);
  assert.match(html,/Each card creates a new project from the packaged creative catalog/);
});

test('MovieMode project cards meet the creative resource-card standard', () => {
  const html = renderToStaticMarkup(React.createElement(CoProProjectsScreen,{
    ...actions,
    projects:[{id:'project:1',title:'Dashboard Walkthrough',kind:'video',status:'draft',updatedAt:'2026-10-16T12:00:00Z',durationMs:25000,aspectRatio:'9:16',thumbnailTone:'cyan',subtitle:'Night edit'}],
  }));
  assert.match(html,/mm-resource-card/);
  assert.match(html,/MovieMode · Draft/);
  assert.match(html,/Open edit/);
  assert.match(html,/aria-label="Edit Dashboard Walkthrough"/);
  assert.match(html,/mm-project-cover-art/);
  assert.match(html,/data:image\/svg\+xml/);
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
