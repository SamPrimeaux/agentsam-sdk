import assert from 'node:assert/strict';
import test from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {BuiltinWidget,creativeWidgetCover,CREATIVE_WIDGET_ENTRIES} from '../dist/widgets/index.js';
test('creative widgets render actual source covers, never fixture metrics',()=>{for(const e of CREATIVE_WIDGET_ENTRIES){const html=renderToStaticMarkup(createElement(BuiltinWidget,{widgetId:e.key}));assert.ok(html.includes(e.title));if(e.key!=='artifact-preview')assert.ok(creativeWidgetCover(e.key)?.startsWith('data:image/svg+xml'));}});
test('artifact preview is empty without a host and renders real host items when provided',()=>{const host={artifactStatus:'ready',artifacts:[{id:'a',title:'Actual artifact',kind:'design'}],openArtifact(){},openEntry(){}};assert.match(renderToStaticMarkup(createElement(BuiltinWidget,{widgetId:'artifact-preview',creativeHost:host})),/Actual artifact/);assert.match(renderToStaticMarkup(createElement(BuiltinWidget,{widgetId:'artifact-preview',creativeHost:{...host,artifacts:[]}})),/No saved artifacts/);});
