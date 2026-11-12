import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createThemeProjectAdapter } from '../packages/theme-contract/editor/project.mjs';
import { createThemeEditorBridge } from '../packages/theme-contract/editor/bridge.mjs';
import { clampPanelWidth, PANEL_WIDTHS } from '../frontend/static/js/theme-editor-resize.mjs';
import { renderThemeSettings, validateThemeSettings } from '../backend/cms/theme-style-contract.mjs';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');

function section(key, zone, globalKey, label) {
  return {
    key, zone, ...(globalKey ? { globalKey } : {}), name: label,
    sourceKind: zone === 'BODY' ? 'content-section' : globalKey,
    html: '<section><strong data-theme-project-field="label"></strong></section>',
    status: 'draft', version: 0,
    content: {label,__editor:{templateKey:key,visibility:{enabled:true},blocks:[]}},
    schema:{key,label,fields:[{key:'label',label:'Text',type:'text'}],blocks:[],settings:[]},
  };
}
function fixture() {
  const home = {
    slug:'home',title:'Home',template:'<!doctype html><html><body><!--theme-section:section_1--><!--theme-section:section_2--><!--theme-section:section_3--></body></html>',
    sections:[
      section('section_1','HEADER','site-header','Global brand'),
      section('section_2','BODY',null,'Home content'),
      section('section_3','FOOTER','site-footer','Global copyright'),
    ],
  };
  const gift = {
    slug:'gift-card',title:'Gift card',template:'<!doctype html><html><body><!--theme-section:section_1--></body></html>',
    sections:[section('section_1','BODY',null,'Gift-card body')],
  };
  const project={schema:'agentsam.theme-project.v1',id:'theme_editor_workspace',name:'Example',revision:0,pages:[home,gift],tokens:{}};
  let saved=structuredClone(project);
  const store={
    get:async()=>structuredClone(saved),
    save:async(candidate,{expectedVersion})=>{
      assert.equal(expectedVersion,saved.revision);
      saved=structuredClone(candidate);return structuredClone(saved);
    },
    current:()=>structuredClone(saved),
  };
  return {project,store};
}
async function withDom(fn) {
  const dom=new JSDOM('<!doctype html><html><body></body></html>');
  const previous=globalThis.DOMParser;globalThis.DOMParser=dom.window.DOMParser;
  try {return await fn();}
  finally {globalThis.DOMParser=previous;dom.window.close();}
}

test('desktop panel widths are bounded without changing draft content',()=>{
  assert.equal(clampPanelWidth('tree',100),PANEL_WIDTHS.tree.min);
  assert.equal(clampPanelWidth('tree',1000),PANEL_WIDTHS.tree.max);
  assert.equal(clampPanelWidth('inspector',390),390);
  assert.equal(clampPanelWidth('catalog',900,600),600);
  assert.throws(()=>clampPanelWidth('unknown',200),/Unknown/);
  const html=readFileSync(new URL('../frontend/static/theme-editor.html',import.meta.url),'utf8');
  assert.match(html,/theme-editor-resize\.mjs/);
  const mounted=readFileSync(new URL('../frontend/theme-editor/mount.mjs',import.meta.url),'utf8');
  assert.match(mounted,/load\('\/admin\/js\/theme-editor-resize\.mjs'\)/);
  const css=readFileSync(new URL('../frontend/static/css/theme-editor.css',import.meta.url),'utf8');
  assert.match(css,/--te-tree-width/);
  assert.match(css,/--te-catalog-width/);
});

test('installed site header and footer are selectable and inherited by pages without duplicate data',()=>withDom(async()=>{
  const {project,store}=fixture();
  const adapter=createThemeProjectAdapter(project,store);
  const site=await adapter.getPage('site');
  assert.equal(site.sections.length,2);
  assert.deepEqual(site.sections.map(x=>x.globalKey),['site-header','site-footer']);
  assert.ok(site.sections.every(x=>x.key.startsWith('global_')));
  const gift=await adapter.getPage('gift-card');
  assert.equal(gift.sections.length,1,'stored gift-card page is unchanged');
  const rendered=(await adapter.resolvePreview('gift-card')).html;
  assert.match(rendered,/Global brand/);
  assert.match(rendered,/Gift-card body/);
  assert.match(rendered,/Global copyright/);
  assert.match(rendered,/data-theme-section="global_site-header"/);
  assert.equal(store.current().pages[1].sections.length,1,'preview does not persist duplicate chrome');
  assert.ok((await adapter.getRegistry()).pages.site);
  const header=site.sections.find(x=>x.zone==='HEADER');
  await adapter.saveDraft('site',header.key,{...header.content,label:'Customer brand'},header.version);
  const reloaded=createThemeProjectAdapter(store.current(),store);
  assert.match((await reloaded.resolvePreview('gift-card')).html,/Customer brand/);
  assert.equal(store.current().pages[0].sections.length,3);
}));

test('theme controls save through existing project revision and rehydrate after reopening',async()=>{
  const {project,store}=fixture();
  const adapter=createThemeProjectAdapter(project,store);
  const bridge=createThemeEditorBridge(adapter);
  assert.deepEqual(bridge.getThemeSettings(),{});
  const changes={controls:{'page.bg':'#ffffff','buttons.primary.radius':18,'type.h1.size':'48px'},
    paletteLinks:{'page.bg':1}};
  assert.deepEqual(validateThemeSettings(changes),{ok:true});
  await bridge.updateThemeSettings(changes);
  const reopened=createThemeEditorBridge(createThemeProjectAdapter(store.current(),store));
  assert.deepEqual(reopened.getThemeSettings(),changes);
  assert.match(renderThemeSettings(changes),/body\{background-color:#ffffff\}/);
  assert.match(renderThemeSettings(changes),/border-radius:18px/);
  assert.equal(validateThemeSettings({controls:{'nonsense.bad':'x'}}).ok,false);
  assert.equal(validateThemeSettings({controls:{'css.source':'@import "https://example.com"'}}).ok,false);
});

test('immutable theme project writes reject invalid site-wide settings',async()=>{
  const { validateThemeProjectPayload }=await import('../backend/cms/theme-project-store.mjs');
  const {project}=fixture();
  assert.doesNotThrow(()=>validateThemeProjectPayload({...project,
    themeSettings:{controls:{"buttons.primary.bg":"#112233"}}}));
  assert.throws(()=>validateThemeProjectPayload({...project,
    themeSettings:{controls:{"unknown.bad":"not-approved"}}}),/theme_project_settings_invalid/);
  assert.throws(()=>validateThemeProjectPayload({...project,
    themeSettings:{controls:{"css.source":'@import "https://example.com/style.css"'}}}),/theme_project_settings_invalid/);
});
