import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createDocumentationProject } from '../../../packages/agentsam-docs-theme/cms-project.mjs';
import { validateThemeProjectPayload } from '../backend/cms/theme-project-store.mjs';
import { createThemeProjectAdapter, renderThemePage } from '../packages/theme-contract/editor/project.mjs';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const catalog = JSON.parse(readFileSync(
  new URL('../../../docs/authoring/agentsam-sdk-docs-portal.json', import.meta.url), 'utf8'));
const runtime = readFileSync(
  new URL('../../../packages/agentsam-docs-theme/docs-portal-runtime.js', import.meta.url), 'utf8');
const style = readFileSync(
  new URL('../../../packages/agentsam-docs-theme/docs-portal.css', import.meta.url), 'utf8');
const build = (data=catalog) => createDocumentationProject({
  id:data.id,name:data.name,siteName:data.siteName,version:data.version,pages:data.pages,
  tokens:data.tokens,stylesheets:['/site/global/agentsam-docs-portal.css'],
  runtimeUrl:'/site/global/agentsam-docs-portal.js'
});
async function withDom(callback){
  const dom = new JSDOM('<!doctype html><html><body></body></html>',{
    url:'https://agentsam.inneranimalmedia.com/docs/sam/',runScripts:'outside-only'});
  const old = globalThis.DOMParser;
  globalThis.DOMParser = dom.window.DOMParser;
  try {return await callback(dom.window);}
  finally {globalThis.DOMParser=old;dom.window.close();}
}
function memory(project){
  let snapshot=structuredClone(project);
  return {
    async get(){return structuredClone(snapshot);},
    async save(next,{expectedVersion}){
      assert.equal(expectedVersion,snapshot.revision);
      snapshot=structuredClone(next);
      assert.equal(snapshot.sectionTemplates,undefined,'do not duplicate a registry in the draft');
      return structuredClone(snapshot);
    },
    current(){return structuredClone(snapshot);}
  };
}
test('reusable docs kit creates a valid site-owned theme project with semantic editable sections',()=>{
  const project=validateThemeProjectPayload(build());
  assert.equal(project.schema,'agentsam.theme-project.v1');
  assert.equal(project.pages.length,6);
  assert.ok(project.pages.every(p=>p.status==='draft'));
  assert.ok(project.pages.every(p=>p.sections[0].globalKey==='site-header'));
  assert.ok(project.pages.every(p=>p.sections.at(-1).globalKey==='site-footer'));
  assert.ok(project.pages.flatMap(p=>p.sections).some(s=>s.sourceKind==='documentation-code' &&
    s.schema.fields.some(f=>f.key==='code'&&f.type==='textarea')));
  assert.ok(project.pages.flatMap(p=>p.sections).some(s=>s.sourceKind==='documentation-collection' &&
    s.schema.blocks.some(b=>b.key==='resource_link')));
  assert.ok(project.pages.every(p=>p.sections.every((s,i)=>s.sort_order===i)));
  assert.ok(project.pages.every(p=>p.template.includes('/site/global/agentsam-docs-portal.css')));
  assert.ok(!project.pages.some(p=>p.template.includes('asbd-header.html')));
  assert.ok(!project.pages.some(p=>p.template.includes('data-cms-region="body"')),'not another raw HTML source adapter');
});
test('all site menus and resource cards resolve only to actual pages in the same project',()=>{
  const project=build();
  const paths=new Set(project.pages.map(p=>p.route));
  const header=project.pages[0].sections[0];
  const nav=header.content.__editor.blocks;
  const links=nav.filter(x=>x.templateKey==='nav_link').map(x=>header.content[x.id]);
  assert.equal(links.length,project.pages.length);
  assert.deepEqual(new Set(links.map(x=>x.href)),paths);
  for (const p of project.pages){
    assert.deepEqual(p.sections[0].content,header.content,'site-wide menu starts from one source');
    for (const section of p.sections.filter(s=>s.sourceKind==='documentation-collection')) {
      for (const block of section.content.__editor.blocks) {
        assert.ok(paths.has(section.content[block.id].href));
      }
    }
  }
  const broken=structuredClone(catalog);
  broken.pages[0].content[2].resources.push('missing-page');
  assert.throws(()=>build(broken),/documentation_link_target_missing/);
  const foreign=structuredClone(catalog);
  foreign.pages[1].route='https://other-site.example/docs';
  assert.throws(()=>build(foreign),/documentation_route_invalid/);
});
test('real draft preview renders code, shared navigation and responsive docs layout',()=>withDom(()=>{
  const project=build();
  const rendered=renderThemePage(project.pages.find(p=>p.slug==='merkle-delta'),project.tokens);
  const doc=new DOMParser().parseFromString(rendered,'text/html');
  const links=[...doc.querySelectorAll('.iam-doc-sidebar a.iam-doc-link')];
  assert.equal(links.length,project.pages.length);
  assert.ok(links.some(a=>a.textContent==='Merkle delta'&&a.getAttribute('href')==='/docs/sam/cookbooks/merkle-delta/'));
  assert.equal(doc.querySelectorAll('.iam-doc-sidebar .iam-doc-group').length,3);
  assert.equal(doc.querySelectorAll('.iam-doc-code-section pre code').length,2);
  assert.match(doc.querySelector('.iam-doc-code-section pre code').textContent,/agentsam merkle snapshot/);
  assert.ok(doc.querySelector('main.iam-doc-content'));
  assert.ok(doc.querySelector('[data-cms-section="site_header"] .iam-doc-sidebar'));
  assert.ok(doc.querySelector('.iam-doc-card')===null);
  assert.match(style,/@media\(max-width:730px\)/);
  assert.match(style,/iam-doc-portal.*\{/);
  assert.match(rendered,/--docs-accent/);
}));
test('the same authenticated CMS draft adapter persists article and shared menu edits across refresh',()=>withDom(async()=>{
  const base=build();
  const storage=memory(base);
  const adapter=createThemeProjectAdapter(base,storage);
  const oldPage=await adapter.getPage('merkle-delta');
  const original=oldPage.sections.find(s=>s.sourceKind==='documentation-prose');
  const next=structuredClone(original.content);
  next.body='A revised, verified cookbook introduction.';
  const saved=await adapter.saveDraft('merkle-delta',original.key,next,original.version);
  assert.equal(saved.version,1);
  const header=(await adapter.getPage('merkle-delta')).sections[0];
  const nextMenu=structuredClone(header.content);
  nextMenu.brand='Developer Guides';
  nextMenu.nav_link_2.label='SDK Docs';
  const menuSaved=await adapter.saveDraft('merkle-delta','site_header',nextMenu,header.version);
  assert.equal(menuSaved.version,1);
  assert.equal(storage.current().revision,2);
  const reopened=createThemeProjectAdapter(storage.current(),storage);
  assert.equal((await reopened.getPage('merkle-delta')).sections.find(s=>s.key===original.key).content.body,next.body);
  assert.equal((await reopened.getPage('native-runtime')).sections[0].content.brand,'Developer Guides');
  assert.equal((await reopened.getPage('native-runtime')).sections[0].content.nav_link_2.label,'SDK Docs');
  const preview=(await reopened.resolvePreview('native-runtime')).html;
  assert.match(preview,/Developer Guides/);
  assert.match(preview,/SDK Docs/);
  const newBlock=await reopened.addBlock('native-runtime','site_header','nav_link',2);
  const linked=(await reopened.getPage('docs-overview')).sections[0];
  assert.ok(linked.content[newBlock.block_id],'nav additions propagate to every page');
}));
test('preview interactions use accessible menu toggles, local filtering and live content headings',()=>withDom(window=>{
  const p=build().pages[0];
  const html=renderThemePage(p,catalog.tokens);
  const doc=new window.DOMParser().parseFromString(html,'text/html');
  window.document.replaceChild(window.document.importNode(doc.documentElement,true),window.document.documentElement);
  window.eval(runtime);
  const button=window.document.querySelector('[data-doc-menu]');
  button.click();
  assert.equal(button.getAttribute('aria-expanded'),'true');
  const search=window.document.querySelector('[data-doc-filter]');
  search.value='Merkle';
  search.dispatchEvent(new window.Event('input',{bubbles:true}));
  assert.equal(window.document.querySelectorAll('.iam-doc-link:not([hidden])').length,1);
  assert.equal(window.document.querySelectorAll('[data-doc-toc] a').length,2);
  assert.equal(window.document.querySelector('.iam-doc-sidebar a[href="/docs/sam/"]').getAttribute('aria-current'),'page');
  window.document.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  assert.equal(button.getAttribute('aria-expanded'),'false');
}));
test('documentation builder is portable to an unrelated CMS site and refuses duplicates and unsafe references',()=>{
  const unrelated={
    id:'theme_acme_guides',name:'Acme Engineering Docs',siteName:'Acme',
    version:'1.0.0',tokens:{'--docs-accent':'#123456'},
    pages:[{slug:'overview',route:'/help/',category:'Guides',title:'Overview',summary:'Example',
      content:[{type:'prose',heading:'Overview',body:'Useful information.'}]}]
  };
  const generic=validateThemeProjectPayload(build(unrelated));
  assert.equal(generic.pages[0].sections[0].content.brand,'Acme');
  assert.ok(!generic.pages[0].template.includes('AgentSam'));
  const duplicate=structuredClone(unrelated);
  duplicate.pages.push({...duplicate.pages[0],slug:'another'});
  assert.throws(()=>build(duplicate),/documentation_page_identity_duplicate/);
  const bad=structuredClone(unrelated);
  bad.pages[0].route='//external.example/';
  assert.throws(()=>build(bad),/documentation_route_invalid/);
});
