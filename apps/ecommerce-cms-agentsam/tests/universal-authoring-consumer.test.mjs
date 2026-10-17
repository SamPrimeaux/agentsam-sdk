import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {JSDOM} from 'jsdom';

// Explicit cross-repo contract test, not a duplicate compiler living in FNF.
// CI/release must provide the checked-out package paths for this test.
const themeRoot=process.env.AGENTSAM_THEME_TOOLS_ROOT;
const sdkRoot=process.env.AGENTSAM_SDK_ROOT;
if (!themeRoot || !sdkRoot) {
  throw new Error('Universal authoring acceptance requires AGENTSAM_THEME_TOOLS_ROOT and AGENTSAM_SDK_ROOT; no silently skipped gate');
}
const compiler=await import(pathToFileURL(path.join(themeRoot,'packages/authoring-compiler/src/index.js')).href);
const {createSamOS}=await import(pathToFileURL(path.join(sdkRoot,'src/sam/os.js')).href);
const {AgentSamClient}=await import(pathToFileURL(path.join(sdkRoot,'src/sam/client.js')).href);
const source=readFileSync(new URL('../../../packages/heuristic-theme/storefront/shop.html',import.meta.url),'utf8');

test('FNF shop original: selection -> real compiler binding -> scoped responsive preview -> reload -> reset',async()=>{
  const pristine=source;
  const artifact={source,revision:1,contentHash:'shop-v1',filename:'shop.html'};
  const drafts=new Map();
  const repository={
    async getSource(){return artifact;},
    async saveDraftStyles({pageId,sectionId,edits,expectedCmsRevision}){
      assert.equal(pageId,'shop');assert.equal(sectionId,'hero');
      if(expectedCmsRevision!==drafts.size) return {ok:false};
      drafts.set(drafts.size+1,JSON.parse(JSON.stringify(edits)));
      return {ok:true,revisionId:'section-draft-'+drafts.size};
    },
    async saveSourceDraft(){throw new Error('source_edit_not_configured_for_this_test');}
  };
  const os=createSamOS({core:false,authoring:{compiler,repository,
    resolveTrustedContext:async()=>({accountId:'fnf-acceptance',actorId:'owner'}),
    authorize:async({principal})=>principal.accountId==='fnf-acceptance'
  }});
  const sam=new AgentSamClient({os});
  const inspect=await sam.invoke('sam.authoring.inspect',{artifactId:'shop-reference',scope:'hero'});
  assert.equal(inspect.ok,true);
  const headline=inspect.data.bindings.find(b=>b.authored.cmsField==='headline');
  assert.ok(headline,'Shop Hero authored headline binding');
  assert.ok(headline.controls.some(c=>c.key==='fontSize'));
  const edits=[
    {nodeId:headline.id,property:'fontSize',value:'68px'},
    {nodeId:headline.id,property:'color',value:'#ffffff'},
    {nodeId:headline.id,property:'fontSize',value:'40px',breakpoint:'mobile'}
  ];
  const preview=await sam.invoke('sam.authoring.previewStyles',{artifactId:'shop-reference',
    scope:'hero',expectedRevision:1,expectedHash:'shop-v1',edits});
  assert.equal(preview.ok,true);
  const dom=new JSDOM(preview.data.annotatedHtml,{url:'https://example.test/shop'});
  const node=dom.window.document.querySelector('[data-cms-section="hero"] [data-cms="headline"]');
  assert.ok(node);
  assert.equal(node.getAttribute('data-sam-node'),headline.id);
  const selection=compiler.inspectRenderedElement({compiled:compiler.compileHtmlAuthoring({
    html:source,filename:'shop.html',scope:'hero'
  }),element:node});
  assert.equal(selection.binding.authored.cmsField,'headline');
  const style=dom.window.document.createElement('style');
  style.textContent=preview.data.css;
  dom.window.document.head.appendChild(style);
  assert.match(style.textContent,/font-size:68px !important/);
  assert.match(style.textContent,/@media \(max-width: 767px\)/);
  const write=await sam.invoke('sam.authoring.saveDraftStyles',{
    artifactId:'shop-reference',pageId:'shop',sectionId:'hero',scope:'hero',
    expectedRevision:1,expectedHash:'shop-v1',expectedCmsRevision:0,edits});
  assert.equal(write.ok,true);
  assert.equal(write.data.published,false);
  const reloaded=await sam.invoke('sam.authoring.previewStyles',{
    artifactId:'shop-reference',scope:'hero',expectedRevision:1,expectedHash:'shop-v1',edits:drafts.get(1)});
  assert.equal(reloaded.ok,true);
  assert.equal(reloaded.data.css,preview.data.css);
  const reset=await sam.invoke('sam.authoring.saveDraftStyles',{
    artifactId:'shop-reference',pageId:'shop',sectionId:'hero',scope:'hero',
    expectedRevision:1,expectedHash:'shop-v1',expectedCmsRevision:1,edits:[]});
  assert.equal(reset.ok,true);
  assert.equal(compiler.compileScopedStyles({compiled:compiler.compileHtmlAuthoring({
    html:source,filename:'shop.html',scope:'hero'
  }),edits:drafts.get(2)}).css,'');
  assert.equal(source,pristine,'original Shop HTML was not patched');
  dom.window.close();
});

test('unseen imported section and generated component use identical bindings without authored inspector schema',()=>{
  const cases=[
    '<section><div><h2 data-cms="introCopy">New import</h2></div></section>',
    '<section data-cms-section="hero"><div class="generated"><h2>AI component</h2><a href="#ok">Go</a></div></section>'
  ];
  for(const html of cases){
    const compiled=compiler.compileHtmlAuthoring({html,filename:'unseen.html',scope:'hero',fragment:true});
    const heading=compiled.bindings.find(b=>b.tag==='h2');
    assert.ok(heading?.controls.some(c=>c.key==='fontSize'));
    assert.match(compiler.compileScopedStyles({compiled,edits:[
      {nodeId:heading.id,property:'fontSize',value:'2rem'}]}).css,/font-size:2rem !important/);
    assert.equal(compiled.originalHtml,html);
  }
});
