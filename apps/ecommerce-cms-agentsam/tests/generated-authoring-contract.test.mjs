import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {inspectGeneratedSection,materializeGeneratedStatic} from '../backend/cms/generated-section.mjs';
import {normalizeSettingFields,settingCssValue} from '../frontend/static/js/generated-settings-schema.mjs';
import {nsForms,lintGeneratedBlock,resolveUidToken,provenanceRecord} from '../frontend/static/js/generation-namespace.mjs';
import {renderGeneratedSettings,bindGeneratedSettings} from '../frontend/static/js/generation-inspector.mjs';
import {createGeneratedBlockRepository,createMemoryObjectStore,createSqlStore} from '../backend/cms/generated-block-repository.mjs';

const definition={kind:'section',type:'feature-product-grid',label:'Product Story',implementation_class:'artifact_static',settings:{
 headline:{type:'text',label:'Headline'},
 cta:{type:'link',label:'CTA'},
 columns:{type:'range',label:'Columns',min:1,max:6,step:1},
 layout:{type:'select',label:'Layout',binding:'style',options:[{value:'split',label:'Split'},{value:'stacked',label:'Stacked'}]},
 background:{type:'color',label:'Background'},
 fontRole:{type:'font-role',label:'Font role'},
 heroMedia:{type:'media',label:'Media asset'},
}};
const settings={headline:'High Octane',cta:'/shop',columns:4,layout:'split',background:'#121212',fontRole:'display',heroMedia:'687'};
const canonical={
 html:'<section data-agentsam-block="__UID__"><h2 data-cms="headline">Fallback</h2><a href="/shop" data-cms="cta" data-cms-attr="href">Shop</a><img src="/media/placeholder.png" data-cms="heroMedia" data-cms-attr="src" alt="concept"></section>',
 css:'[data-agentsam-block="__UID__"] { grid-template-columns: repeat(var(--__UID__-setting-columns), 1fr); background:var(--__UID__-setting-background);font-family:var(--__UID__-setting-fontRole);--__UID__-layout-selection:var(--__UID__-setting-layout)} [data-agentsam-block="__UID__"] h2 {color:inherit}',
 js:'',
};
const section=(def=definition,values=settings,code=canonical)=>inspectGeneratedSection({definition:def,settings:values,canonical:code},'cmsps_demo_123');

test('declared schema wins over initial values, including range/select/color/font and references',()=>{
 const checked=section();assert.equal(checked.ok,true,checked.error);
 assert.equal(checked.fields.columns.type,'range');assert.equal(checked.fields.columns.max,6);
 assert.equal(checked.fields.layout.options[1].value,'stacked');
 assert.equal(checked.fields.background.binding,'style');
 assert.equal(checked.fields.fontRole.type,'font-role');
 assert.equal(checked.fields.heroMedia.type,'media');
 assert.equal(checked.settings.heroMedia,'687');
});

test('legacy contract spelling, bounded numeric units and unsafe CSS values resolve deterministically',()=>{
 const fields={body:{type:'rich_text'},font:{type:'font_role'},preset:{type:'typography_preset'},padding:{type:'spacing',min:0,max:30,step:2,unit:'rem'}};
 const {fields:canonical}=normalizeSettingFields(fields,{body:'Hello',font:'display',preset:'hero',padding:4});
 assert.equal(canonical.body.type,'richtext');
 assert.equal(canonical.font.type,'font-role');
 assert.equal(canonical.preset.type,'typography-preset');
 assert.equal(settingCssValue(4,canonical.padding),'4rem');
 assert.equal(settingCssValue('display',canonical.font),'var(--font-display)');
 assert.throws(()=>normalizeSettingFields(fields,{body:'Hello',font:'display',preset:'hero',padding:3}),/Invalid instance value/);
 assert.throws(()=>normalizeSettingFields({bad:{type:'range',unit:';position:fixed'}},{bad:3}),/Invalid numeric unit/);
 assert.throws(()=>normalizeSettingFields({bad:{type:'select',options:['ok',';body{display:none}']}},{bad:'ok'}),/Invalid select option/);
});

test('visual values need scoped CSS var consumption, not dummy data-cms nodes',()=>{
 assert.equal(section().ok,true);
 const missing=section(definition,settings,{...canonical,css:canonical.css.replace('var(--__UID__-setting-background)','#000')});
 assert.equal(missing.ok,undefined);assert.match(missing.error,/CSS variable binding: background/);
});

test('untyped, invalid, unreferenced or wrongly ranged settings cannot be installed',()=>{
 assert.match(section({...definition,settings:undefined}).error,/declared typed/);
 assert.match(section(definition,{...settings,columns:7}).error,/Invalid instance value/);
 assert.match(section(definition,{...settings,extra:'123'}).error,/Undeclared/);
 assert.match(section(definition,settings,{...canonical,html:canonical.html.replace('data-cms="headline"','')}).error,/markup binding/);
});

test('interactive artifacts reject JS in static lane; native does not generate a static artifact',()=>{
 assert.match(section({...definition,implementation_class:'artifact_interactive'}).error,/interactive artifacts/);
 assert.match(section({...definition,implementation_class:'native'}).error,/Native primitives/);
 assert.match(section(definition,settings,{...canonical,js:'window.foo = 1'}).error,/script-free/);
});

test('immutable section artifact materializes independent instance settings without global CSS',()=>{
 const one=materializeGeneratedStatic({definition,settings,canonical},{instanceId:'cmsps_001',sectionKey:'story-one'});
 const two=materializeGeneratedStatic({definition,settings:{...settings,columns:2},canonical},{instanceId:'cmsps_002',sectionKey:'story-two'});
 assert.match(one.html,/data-cms="story-one.headline"/);
 assert.match(two.html,/data-cms="story-two.heroMedia"/);
 assert.match(one.css,/--agentsam-gen-cmsps-001-setting-columns: 4/);
 assert.match(two.css,/--agentsam-gen-cmsps-002-setting-columns: 2/);
 assert.ok(!one.css.includes('cmsps-002'));
 assert.equal(one.js,'');
 assert.equal(one.html.includes('__UID__'),false);
 assert.equal(two.css.includes('__UID__'),false);
});

test('same nested button semantic key in different sections has different resolved namespaces',()=>{
 const left=nsForms('cmsb_first-instance'),right=nsForms('cmsb_second-instance');
 assert.notEqual(left.css,right.css);
 assert.equal(left.namespace,'agentsam');assert.equal(right.namespace,'agentsam');
 assert.notEqual(resolveUidToken('__UID__',left.instanceId),resolveUidToken('__UID__',right.instanceId));
});

test('CSS linter fails closed for unscoped second selector even if first selector is scoped',()=>{
 const forms=nsForms('cmsb_unique');
 const html=`<div data-agentsam-block="${forms.blockId}"></div>`;
 const ok=`${forms.scope} h2 {color:red}`;
 assert.equal(lintGeneratedBlock({html,css:ok,js:''},forms).ok,true);
 for(const extra of ['.agentsam-gen-cmsb_unique:hover {color:blue}','body{opacity:0}',`${forms.scope}evil {color:red}`]){
  assert.equal(lintGeneratedBlock({html,css:ok+'\n'+extra,js:''},forms).ok,false,extra);
 }
});

test('multi-agent source attribution never changes canonical namespace',()=>{
 const p=provenanceRecord({namespace:'claude-4',provider:'anthropic',model:'claude',source_agent:'worker-3',generation_id:'gen123',source_ref:'donor/revise',normalized_by:'agentsam-intake'});
 assert.equal(p.namespace,'agentsam');assert.equal(p.provider,'anthropic');
 assert.equal(p.source_agent,'worker-3');assert.equal(p.source_ref,'donor/revise');
 assert.equal(p.generation_id,'gen123');
});

test('inspector renders typed fields and routes edits to the selected instance scope',()=>{
 const document=new JSDOM('<main id="inspector"></main><div data-agentsam-block="cmsps_demo_123"></div>').window.document;
 const body=document.querySelector('#inspector');const wrapper=document.querySelector('[data-agentsam-block]');
 const checked=section();const calls=[];
 renderGeneratedSettings(body,checked.settings,checked.fields);
 assert.equal(body.querySelector('[data-generated-setting="columns"]').type,'range');
 assert.equal(body.querySelector('[data-generated-setting="layout"]').tagName,'SELECT');
 assert.equal(body.querySelector('[data-generated-setting="cta"]').type,'url');
 assert.equal(body.querySelector('[data-generated-setting="heroMedia"]').type,'text');
 bindGeneratedSettings(body,wrapper,{onChange:(key,value)=>calls.push([key,value])},checked.fields);
 const columns=body.querySelector('[data-generated-setting="columns"]');columns.value='5';columns.dispatchEvent(new document.defaultView.Event('input'));
 const background=body.querySelector('[data-generated-setting="background"]');background.value='#334455';background.dispatchEvent(new document.defaultView.Event('input'));
 assert.deepEqual(calls,[['columns',5],['background','#334455']]);
 assert.equal(wrapper.style.getPropertyValue('--agentsam-gen-cmsps-demo-123-setting-columns'),'5');
 assert.equal(wrapper.style.getPropertyValue('--agentsam-gen-cmsps-demo-123-setting-background'),'#334455');
});

function database(){
 const db=new DatabaseSync(':memory:');const root=new URL('../db/schema/',import.meta.url);
 db.exec(readFileSync(new URL('accounts.stub.sql',root),'utf8')+'\n'+readFileSync(new URL('cms.sql',root),'utf8'));
 db.prepare("INSERT INTO accounts(id) VALUES ('acct-z')").run();
 db.prepare("INSERT INTO cms_pages(id,account_id,slug,title) VALUES ('page-z','acct-z','mine','Mine')").run();
 db.prepare("INSERT INTO cms_page_sections(id,account_id,page_id,section_key,section_type) VALUES ('section-a','acct-z','page-z','first','group'),('section-b','acct-z','page-z','second','group')").run();
 return db;
}

test('block_key button repeats safely across sections; artifacts are shared but instances are isolated',async()=>{
 const db=database();const objects=createMemoryObjectStore();const repo=createGeneratedBlockRepository(createSqlStore(db),objects);
 const manifest={definition:{kind:'block',type:'button'},canonical:{
  html:'<div data-agentsam-block="__UID__" class="__UID__"><a href="/shop">Shop</a></div>',
  css:'[data-agentsam-block="__UID__"] .__UID__ {color:var(--__UID__-ink)}',js:'',
 }};
 const first=await repo.saveGenerated({accountId:'acct-z',sectionId:'section-a',blockKey:'button',manifest});
 const second=await repo.saveGenerated({accountId:'acct-z',sectionId:'section-b',blockKey:'button',manifest});
 assert.equal(first.ok,true,first.error);assert.equal(second.ok,true,second.error);
 assert.notEqual(first.blockId,second.blockId);assert.equal(first.artifactId,second.artifactId);
 const left=await repo.releaseBuild('acct-z','section-a'),right=await repo.releaseBuild('acct-z','section-b');
 assert.equal(left.ok,true,left.error);assert.equal(right.ok,true,right.error);
 assert.notEqual(left.output[0].html,right.output[0].html);
 assert.equal(left.output[0].html.includes('__UID__'),false);
 assert.equal(right.output[0].css.includes('__UID__'),false);
});
