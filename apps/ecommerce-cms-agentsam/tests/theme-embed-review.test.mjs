import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
const require=createRequire(new URL('../package.json',import.meta.url));
let JSDOM; try { ({JSDOM}=require('jsdom')); } catch {}
const src=file=>readFileSync(new URL('../frontend/static/js/'+file,import.meta.url),'utf8');
const catalogPath=new URL('../frontend/static/theme-editor/embed-catalog.json',import.meta.url);
const tick=()=>new Promise(done=>setTimeout(done,0));

test('embed catalog exactly matches source manifests and builds without npm publishing',()=>{
  execFileSync(process.execPath,[new URL('../scripts/sync-theme-embed-catalog.mjs',import.meta.url).pathname,'--check']);
  const catalog=JSON.parse(readFileSync(catalogPath,'utf8'));
  assert.equal(catalog.apps.length,5);
  assert.equal(catalog.preview_only,true);
  assert.equal(catalog.apps.find(x=>x.key==='newsletter_subscribe').default_config.double_opt_in,true);
});
test('packaged editor displays all available embeds and previews forms without sending or installing',{skip:!JSDOM&&'jsdom is not installed on this machine'},async()=>{
  const dom=new JSDOM('<!doctype html><html><body><div data-drawer-mode="sections"></div><div data-drawer-mode="app-embeds"></div>'+
    '<aside data-drawer-panel="app-embeds"><input id="te-embed-search"><div id="te-embed-empty">No embeds installed</div></aside>'+
    '<aside class="theme-editor-panel"><div id="te-inspector-body"></div></aside></body></html>',{
    url:'https://example.test/admin/theme-editor?slug=home',runScripts:'outside-only'
  });
  const w=dom.window;
  w.structuredClone=globalThis.structuredClone;
  w.matchMedia=()=>({matches:false});
  let transmissions=0;
  const catalog=JSON.parse(readFileSync(catalogPath,'utf8'));
  w.fetch=async()=>{transmissions++;return {ok:true,json:async()=>catalog};};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  try{
    w.eval(src('theme-embed-review.js'));
    await tick();
    assert.equal(transmissions,1,'fetch only manifest UI catalog');
    assert.equal(w.document.querySelectorAll('[data-embed-open]').length,5);
    assert.equal(w.document.querySelector('#te-embed-empty'),null,'retire misleading empty-installed state');
    assert.equal(w.ThemeEmbedReview.isPreviewOnly,true);
    w.document.querySelector('[data-embed-open="newsletter_subscribe"]').click();
    assert.equal(w.document.querySelector('[data-embed-note]').textContent.includes('Not saved'),true);
    assert.ok(w.document.querySelector('[data-embed-required="first_name"]').checked);
    const heading=w.document.querySelector('[data-embed-input="heading"]');
    heading.value='Test newsletter';
    heading.dispatchEvent(new w.Event('input',{bubbles:true}));
    assert.equal(w.ThemeEmbedReview.getDraft('newsletter_subscribe').heading,'Test newsletter');
    w.document.querySelector('[data-embed-preview]').click();
    const dialog=w.document.querySelector('dialog.te-embed-review-dialog');
    assert.ok(dialog.open);
    const form=dialog.querySelector('[data-embed-form]');
    form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
    assert.match(dialog.querySelector('[role="status"]').textContent,/First name is required/);
    assert.equal(transmissions,1,'preview never sent submission');
    w.document.querySelector('[data-drawer-mode="sections"]').click();
    assert.equal(w.document.querySelector('.te-embed-review-inspector').hidden,true);
    assert.equal(w.document.querySelector('#te-inspector-body').hasAttribute('aria-hidden'),false);
  }finally{dom.window.close();}
});
test('showcase mode leaves Resolve preview unmodified',{skip:!JSDOM&&'jsdom is not installed on this machine'},()=>{
  const dom=new JSDOM('<aside data-drawer-panel="app-embeds"></aside><aside class="theme-editor-panel"></aside>',{
    url:'https://example.test/admin/theme-editor?showcase=resolve',runScripts:'outside-only'});
  try{dom.window.eval(src('theme-embed-review.js'));assert.equal(dom.window.ThemeEmbedReview,undefined);}
  finally{dom.window.close();}
});

test('review UI is manifest-backed and never exposes install, publish or Copy JSON actions',()=>{
  const code=src('theme-embed-review.js');
  const html=readFileSync(new URL('../frontend/static/theme-editor.html',import.meta.url),'utf8');
  const settings=src('theme-settings-live.js');
  const core=src('theme-editor.js');
  assert.match(html,/\/admin\/js\/theme-embed-review\.js/);
  assert.match(html,/\/admin\/css\/theme-embed-review\.css/);
  assert.match(code,/\/admin\/theme-editor\/embed-catalog\.json/);
  assert.match(code,/event\.preventDefault\(\)/);
  assert.match(code,/Not installed/);
  assert.match(code,/No information was sent/);
  assert.doesNotMatch(code,/\/api\/admin\/cms\/components.*PUT|Copy preview JSON|navigator\.clipboard/);
  for(const key of ['brand.logoUrl','page.maxWidth','inputs.radius','overlays.placement','icons.style']){
    assert.ok(settings.includes(key),'missing CMS-connected theme draft control '+key);
  }
  assert.match(core,/function renderPageOptions/);
  assert.match(core,/function renderPageOptions/);
});
