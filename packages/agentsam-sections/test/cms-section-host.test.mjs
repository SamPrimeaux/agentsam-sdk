import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CmsSectionHost, createCmsRendererRegistry, MxsSection } from '../dist/index.js';

const definitions=[
  {id:'d-hero',definition_key:'theme-hero',version:'1',kind:'section',status:'active'},
  {id:'d-grid',definition_key:'theme-grid',version:'2',kind:'section',status:'active'},
  {id:'d-block',definition_key:'theme-action',version:'1',kind:'block',status:'active'}
];
const components=[
  {definition_id:'d-hero',renderer_key:'theme:hero',implementation_status:'verified'},
  {definition_id:'d-grid',renderer_key:'theme:grid',implementation_status:'verified'},
  {definition_id:'d-block',renderer_key:'theme:action',implementation_status:'verified'}
];
const implementations={
  'theme:hero':({section,renderBlocks})=>createElement('article',{'data-theme-layout':'hero'},
    createElement('p',null,String(section.settings.copy ?? '')),renderBlocks()),
  'theme:grid':({section,renderBlocks})=>createElement('div',{'data-theme-layout':'grid'},
    createElement('div',null,String(section.settings.content ?? '')),renderBlocks()),
  'theme:action':({block,renderChildren})=>createElement('a',{href:String(block.settings.href)},
    String(block.settings.label),renderChildren())
};
const host = (registry, section, mode='preview')=>renderToStaticMarkup(createElement(
  CmsSectionHost,{registry,section,mode,viewport:'phone'}
));
test('CMS section host is presentation-neutral: arbitrary renderer and no mandatory title, CTAs or media',()=>{
  const registry=createCmsRendererRegistry(definitions,components,implementations);
  const section={id:'s1',definitionKey:'theme-grid',definitionVersion:'2',rendererKey:'theme:grid',
    settings:{content:'Grid-specific content'},blocks:[]};
  const markup=host(registry,section);
  assert.match(markup,/data-theme-layout="grid"/);
  assert.match(markup,/Grid-specific content/);
  assert.match(markup,/data-cms-section="s1"/);
  assert.doesNotMatch(markup,/mxs-|cms-grid|cms-cta|cms-media|animation/i);
});
test('Nested blocks render using their own verified definitions and stable identities',()=>{
  const registry=createCmsRendererRegistry(definitions,components,implementations);
  const block={id:'b1',definitionKey:'theme-action',definitionVersion:'1',rendererKey:'theme:action',
    settings:{href:'/shop',label:'Explore'},children:[]};
  const section={id:'s2',definitionKey:'theme-hero',definitionVersion:1,rendererKey:'theme:hero',
    settings:{copy:'Welcome'},blocks:[block]};
  const markup=host(registry,section);
  assert.match(markup,/data-theme-layout="hero"/);
  assert.match(markup,/<a href="\/shop">Explore<\/a>/);
  assert.match(markup,/Welcome/);
});
test('Missing or unverified implementations fail closed; editors show diagnostics without fabricated visuals',()=>{
  const registry=createCmsRendererRegistry(definitions,
    [{definition_id:'d-grid',renderer_key:'theme:grid',implementation_status:'unverified'}],
    implementations);
  const section={id:'s3',definitionKey:'theme-grid',definitionVersion:2,rendererKey:'theme:grid',
    settings:{},blocks:[]};
  assert.throws(()=>host(registry,section,'published'),/cms_renderer_unavailable/);
  assert.throws(()=>host(registry,section,'preview'),/cms_renderer_unavailable/);
  assert.match(host(registry,section,'editor'),/Renderer unavailable/);
  assert.doesNotMatch(host(registry,section,'editor'),/data-theme-layout/);
});
test('Definition version mismatches are rejected; hidden published sections remain absent',()=>{
  const registry=createCmsRendererRegistry(definitions,components,implementations);
  const wrong={id:'s4',definitionKey:'theme-hero',definitionVersion:77,rendererKey:'theme:hero',
    settings:{},blocks:[]};
  assert.throws(()=>host(registry,wrong),/cms_renderer_version_mismatch/);
  assert.equal(host(registry,{...wrong,visible:false},'published'),'');
  assert.match(host(registry,{...wrong,visible:false},'editor'),/Hidden section/);
});
test('Renderer cannot silently use another definition or inactive component',()=>{
  const registry=createCmsRendererRegistry(definitions,components,implementations);
  const wrong={id:'s5',definitionKey:'theme-grid',definitionVersion:1,rendererKey:'theme:hero',
    settings:{},blocks:[]};
  assert.throws(()=>host(registry,wrong),/cms_renderer_definition_mismatch/);
  const inactive=createCmsRendererRegistry(
    [{...definitions[1],status:'draft'}],
    [components[1]],implementations
  );
  assert.equal(inactive.keys().length,0);
});
test('Old MxsSection export remains available only for compatibility',()=>{
  assert.equal(typeof MxsSection,'function');
});
