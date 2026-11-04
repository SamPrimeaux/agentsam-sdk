import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {readFileSync} from 'node:fs';
import * as runtime from '../frontend/theme-editor/project.mjs';
import * as contract from '../packages/theme-contract/editor/project.mjs';
import { auditPortableThemeProject } from '../packages/theme-contract/editor/portability.mjs';

const require=createRequire(import.meta.url);
const {JSDOM}=require('jsdom');

async function withDom(fn) {
  const dom=new JSDOM('<!doctype html><html><body></body></html>');
  const previous=globalThis.DOMParser;
  globalThis.DOMParser=dom.window.DOMParser;
  try{return await fn(dom.window);}
  finally {globalThis.DOMParser=previous;dom.window.close();}
}

function page(html,slug,title) {
  return runtime.extractThemePage('<!doctype html><html><head><style>.hero{color:rebeccapurple}</style></head><body>'+html+'</body></html>',{slug,title});
}

function demoProject(pages){
  return {schema:runtime.THEME_PROJECT_SCHEMA,id:'theme_harbor',name:'Harbor',revision:0,
    sourceThemeId:'harbor',pages,tokens:{}};
}
function memoryStore(project) {
  let saved=structuredClone(project);
  return {
    async get(){return structuredClone(saved);},
    async save(next,{expectedVersion}) {
      assert.equal(expectedVersion,Number(saved.revision||0));
      saved=structuredClone(next);
      assert.equal(saved.sectionTemplates,undefined,'derived section catalog is never persisted twice');
      return structuredClone(saved);
    },
    current:()=>structuredClone(saved),
  };
}

test('browser modules are generated from one packaged source, never maintained twice',()=>{
  for(const name of ['project','bridge','cms-adapter']) {
    const source=readFileSync(new URL('../packages/theme-contract/editor/'+name+'.mjs',import.meta.url),'utf8');
    const browser=readFileSync(new URL('../frontend/theme-editor/'+name+'.mjs',import.meta.url),'utf8');
    assert.equal(browser,'// GENERATED from packages/theme-contract/editor/'+name+'.mjs. DO NOT EDIT.\n'+source,name);
  }
  assert.deepEqual(Object.keys(contract).sort(),Object.keys(runtime).sort());
  assert.equal(runtime.THEME_PROJECT_SCHEMA,contract.THEME_PROJECT_SCHEMA);
});

test('generic donor markup becomes semantic header/section/group/footer with typed settings',()=>withDom(()=>{
  const p=page(`<header aria-label="Site header"><nav><ul><li><a href="/">Home</a></li><li><a href="/about">About</a></li></ul></nav></header>
    <main><section class="hero" data-cms-type="hero">
      <h1>Measured expertise</h1><p>Thoughtful professional service.</p>
      <div data-cms-group="Service cards" data-cms-label="Offerings">
        <h2>Services</h2><img src="/office.jpg" alt="Office"><a href="/contact">Get in touch</a>
      </div>
    </section></main>
    <footer><p>Support &amp; contact</p></footer>`,'home','Harbor Home');
  assert.deepEqual(p.sections.map(x=>x.zone),['HEADER','BODY','FOOTER']);
  assert.equal(p.sections[0].schema.blocks.length,0,'navigation remains owned by header');
  const hero=p.sections[1];
  assert.equal(hero.sourceKind,'hero');
  assert.equal(hero.schema.blocks.length,1);
  const group=hero.schema.blocks[0];
  assert.equal(group.kind,'group');
  assert.equal(group.label,'Offerings');
  assert.equal(group.capabilities.reusable,true);
  assert.ok(group.fields.some(f=>f.key.startsWith('media_') && f.group==='Media'));
  assert.ok(group.fields.some(f=>f.key.endsWith('_alt') && f.group==='Accessibility'));
  assert.ok(hero.schema.fields.some(f=>f.key.startsWith('heading_') && f.group==='Content'));
  assert.ok(!hero.schema.fields.some(f=>/^field_\\d+$/.test(f.key)),
    'anonymous text-value fields no longer define CMS inspector controls');
  assert.match(runtime.renderThemePage(p),/Measured expertise/);
  assert.match(runtime.renderThemePage(p),/Office/);
}));

test('multiple source pages expose independent reusable sections and cross-page insert',()=>withDom(async()=>{
  const home=page('<main><section class="hero"><h1>Harbor home</h1><p>Homepage story</p></section></main>','home','Home');
  const contact=page('<main><section class="contact"><h1>Contact</h1><p>Start a conversation.</p></section></main>','contact','Contact');
  assert.equal(home.sections[0].key,contact.sections[0].key,
    'old release projects legitimately reuse section_1 across pages');
  const store=memoryStore(demoProject([home,contact]));
  const adapter=runtime.createThemeProjectAdapter(store.current(),store);
  const registry=await adapter.getRegistry();
  const homeKey=runtime.sourceSectionTemplateKey('home','section_1');
  const contactKey=runtime.sourceSectionTemplateKey('contact','section_1');
  assert.notEqual(homeKey,contactKey,'each source composition has stable independent identity');
  assert.ok(registry.pages.home.sections[homeKey]);
  assert.ok(registry.pages.home.sections[contactKey]);
  assert.equal(registry.pages.home.sections[contactKey].sourcePage,'contact');
  const added=await adapter.addSection('home',contactKey,1);
  const updated=await adapter.getPage('home');
  assert.equal(updated.sections[1].key,added.section_key);
  assert.equal(updated.sections[1].sourceKind,'content-section');
  assert.equal(updated.sections[1].content.heading_1,'Contact');
  const html=(await adapter.resolvePreview('home')).html;
  assert.match(html,/Harbor home/);
  assert.match(html,/Start a conversation/);
  const reopened=runtime.createThemeProjectAdapter(store.current(),store);
  assert.equal((await reopened.getPage('home')).sections.length,2);
  assert.ok((await reopened.getRegistry()).pages.home.sections[contactKey]);
}));

test('source sections can be reused while originals remain unchanged',()=>withDom(async()=>{
  const home=page('<main><section><h2>Solutions</h2><div data-cms-group="Solutions"><h3>Insurance</h3><p>Protection.</p></div></section></main>','home','Home');
  const store=memoryStore(demoProject([home]));
  const adapter=runtime.createThemeProjectAdapter(store.current(),store);
  const section=(await adapter.getPage('home')).sections[0];
  assert.equal(section.schema.blocks[0].kind,'group');
  const duplicate=await adapter.duplicateBlock('home',section.key,'block_1');
  const html=(await adapter.resolvePreview('home')).html;
  assert.equal((html.match(/>Insurance<\/h3>/g)||[]).length,2);
  await adapter.moveBlock('home',section.key,duplicate.block_id,0);
  await adapter.removeBlock('home',section.key,'block_1');
  const only=(await adapter.resolvePreview('home')).html;
  assert.equal((only.match(/>Insurance<\/h3>/g)||[]).length,1);
  assert.match(only,/Solutions/);
}));

test('published theme page claims must be backed by actual reusable CMS pages',()=>withDom(()=>{
  const harbor=demoProject([page('<main><section><h1>Harbor home</h1><p>Overview</p></section></main>','home','Home')]);
  const result=auditPortableThemeProject(harbor,{
    declaredPages:['Home','Expertise','About','Insights','Contact'],
  });
  assert.equal(result.ok,false);
  assert.equal(result.summary.pages,1);
  assert.ok(result.errors.some(x=>x.code==='declared_pages_missing'));
  const exact=auditPortableThemeProject(harbor,{declaredPages:['Home']});
  assert.equal(exact.ok,true,'valid single-page package can still be released as one page');
}));

test('no extra copied theme registry is written when a section is reused',()=>withDom(async()=>{
  const original=page('<main><section><h2>One</h2><p>Body</p></section></main>','home','Home');
  const store=memoryStore(demoProject([original]));
  const adapter=runtime.createThemeProjectAdapter(store.current(),store);
  await adapter.addSection('home',runtime.sourceSectionTemplateKey('home',original.sections[0].key),1);
  assert.equal(store.current().sectionTemplates,undefined);
  assert.equal(store.current().pages[0].sections.length,2);
}));
