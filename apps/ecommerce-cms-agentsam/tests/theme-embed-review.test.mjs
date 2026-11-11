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

test('embed catalog matches manifests and declares installable templates',()=>{
  execFileSync(process.execPath,[new URL('../scripts/sync-theme-embed-catalog.mjs',import.meta.url).pathname,'--check']);
  const catalog=JSON.parse(readFileSync(catalogPath,'utf8'));
  for(const k of ['form_inline','form_popup','store_chat','grow_capture'])assert.ok(catalog.apps.some(x=>x.key===k),k);
  assert.equal(catalog.preview_only,false);
  assert.equal(catalog.installable,true);
  assert.equal(catalog.apps.find(x=>x.key==='newsletter_subscribe').default_config.double_opt_in,true);
});
test('packaged editor lists embeds and installs through the CMS catalog-resources API',{skip:!JSDOM&&'jsdom is not installed on this machine'},async()=>{
  const dom=new JSDOM('<!doctype html><html><body><div data-drawer-mode="sections"></div><div data-drawer-mode="app-embeds"></div>'+
    '<aside data-drawer-panel="app-embeds"><input id="te-embed-search"><div id="te-embed-empty">No embeds installed</div></aside>'+
    '<aside class="theme-editor-panel"><div id="te-inspector-body"></div></aside></body></html>',{
    url:'https://example.test/admin/theme-editor?slug=home&marketplace_kind=cms_embed&marketplace_key=announcement_bar',runScripts:'outside-only'
  });
  const w=dom.window;
  w.structuredClone=globalThis.structuredClone;
  w.matchMedia=()=>({matches:false});
  const catalog=JSON.parse(readFileSync(catalogPath,'utf8'));
  const calls=[];
  w.fetch=async(url,options={})=>{
    calls.push({url:String(url),method:(options.method||'GET').toUpperCase(),body:options.body||null});
    if(String(url).includes('/embed-catalog.json')) return {ok:true,json:async()=>catalog};
    if(String(url).includes('/catalog-resources') && (options.method||'GET').toUpperCase()==='GET')
      return {ok:true,json:async()=>({ok:true,installed:[],catalog:catalog.apps})};
    if(String(url).includes('/catalog-resources') && (options.method||'').toUpperCase()==='POST')
      return {ok:true,status:201,json:async()=>({ok:true,section_key:'announcement-bar-test',catalog_key:'announcement_bar'})};
    return {ok:true,json:async()=>({})};
  };
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  try{
    w.eval(src('theme-embed-review.js'));
    w.document.dispatchEvent(new w.CustomEvent('theme-editor:global-settings-ready'));
    await tick();
    assert.match(w.document.querySelector('.ter-inspector-head').textContent, /Announcement bar/i);
    assert.ok(calls.every(call => call.method === 'GET'), 'marketplace arrival only opens configuration');
    assert.equal(w.document.querySelectorAll('[data-embed-open]').length,catalog.apps.length);
    assert.equal(w.document.querySelector('#te-embed-empty'),null);
    w.document.querySelector('[data-embed-open="store_chat"]').click();
    const chatPane=w.document.querySelector('[data-drawer-panel="app-embeds"] .ter-left-inspector');
    const greeting=chatPane.querySelector('[data-embed-input="greeting"]');
    greeting.value='Welcome to the store';
    greeting.dispatchEvent(new w.Event('input',{bubbles:true}));
    assert.equal(w.ThemeEmbedReview.getDraft('store_chat').greeting,'Welcome to the store');
    assert.ok(chatPane.querySelector('[data-embed-select="horizontal_position"]'));
    assert.ok(chatPane.querySelector('[data-embed-input="border_radius"]'));

    assert.equal(w.ThemeEmbedReview.isPreviewOnly,false);
    assert.ok(w.document.querySelector('[data-open-embed-picker]'));
    w.ThemeEmbedReview.openPicker();
    const picker=w.document.querySelector('.te-embed-picker-dialog');
    assert.ok(picker.open);
    assert.equal(picker.querySelectorAll('[data-picker-configure]').length,catalog.apps.length);
    assert.match(picker.textContent,/InnerAnimalMedia App Store/);
    picker.querySelector('[data-picker-configure="newsletter_subscribe"]').click();
    assert.equal(picker.open,false);
    assert.ok(w.document.querySelector('[data-embed-install]'),'picker opens the real CMS installer instead of installing silently');
    w.document.querySelector('[data-embed-open="customer_billing"]').click();
    assert.match(w.document.querySelector('.ter-inspector-scroll').textContent,/authenticated billing route/);
    assert.ok(w.document.querySelector('[data-embed-select="style"]'));
    assert.equal(w.document.querySelector('[data-embed-input="button_href"]'),null);
    w.document.querySelector('[data-embed-preview]').click();
    assert.match(w.document.querySelector('dialog').textContent,/host must provide an authenticated billing destination/i);
    assert.equal(w.document.querySelector('dialog button[disabled]')?.textContent,'View billing');
    w.document.querySelector('dialog').close();
    w.document.querySelector('[data-embed-open="newsletter_subscribe"]').click();
    assert.match(w.document.querySelector('[data-embed-note]').textContent,/not installed/i);
    assert.ok(w.document.querySelector('[data-embed-install]'));
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
    dialog.close();
    w.document.querySelector('[data-embed-open="announcement_bar"]').click();
    await w.document.querySelector('[data-embed-install]').dispatchEvent(new w.Event('click',{bubbles:true}));
    await tick();
    assert.ok(calls.some(call => call.method==='POST' && call.url.includes('/catalog-resources')));
    w.document.querySelector('[data-drawer-mode="sections"]').click();
    assert.equal(w.document.querySelector('.te-embed-review-inspector').hidden,true);
    assert.equal(w.document.querySelector('#te-inspector-body').hasAttribute('aria-hidden'),false);
  }finally{dom.window.close();}
});
test('installed Theme Project editor cannot silently write CMS embeds to an unrelated site page',{skip:!JSDOM&&'jsdom is not installed'},async()=>{
  const dom=new JSDOM('<!doctype html><html><body><div data-drawer-mode="app-embeds"></div>'+
    '<aside data-drawer-panel="app-embeds"><input id="te-embed-search"><div id="te-embed-empty"></div></aside>'+
    '<aside class="theme-editor-panel"><div id="te-inspector-body"></div></aside></body></html>',{
    url:'https://example.test/admin/theme-project-editor?site_id=theme-store&project=theme_heuristic',
    runScripts:'outside-only',
  });
  const w=dom.window, calls=[];
  w.AgentSamThemeEditorHost={adapter:{capabilities:{publish:false}}};
  w.structuredClone=globalThis.structuredClone;
  w.matchMedia=()=>({matches:false});
  w.fetch=async url=>{
    calls.push(String(url));
    return {ok:true,json:async()=>JSON.parse(readFileSync(catalogPath,'utf8'))};
  };
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  try{
    w.eval(src('theme-embed-review.js'));
    await tick();
    assert.equal(w.ThemeEmbedReview.isPreviewOnly,true);
    assert.equal(calls.length,1,'no unauthorized catalog-resources GET');
    w.ThemeEmbedReview.openPicker();
    assert.match(w.document.querySelector('.te-embed-picker-dialog').textContent,/project-scoped installation adapter/i);
    w.document.querySelector('[data-picker-configure="newsletter_subscribe"]').click();
    assert.equal(w.document.querySelector('[data-embed-install]'),null);
    assert.match(w.document.querySelector('.ter-inspector-scroll').textContent,/Preview only/);
    assert.ok(w.document.querySelector('[data-embed-preview]'));
    assert.equal(calls.length,1,'no unauthorized writes');
  }finally{dom.window.close();}
});
test('showcase mode leaves Resolve preview unmodified',{skip:!JSDOM&&'jsdom is not installed on this machine'},()=>{
  const dom=new JSDOM('<aside data-drawer-panel="app-embeds"></aside><aside class="theme-editor-panel"></aside>',{
    url:'https://example.test/admin/theme-editor?showcase=resolve',runScripts:'outside-only'});
  try{dom.window.eval(src('theme-embed-review.js'));assert.equal(dom.window.ThemeEmbedReview,undefined);}
  finally{dom.window.close();}
});

test('review UI is wired to catalog install APIs and keeps theme settings owners intact',()=>{
  const code=src('theme-embed-review.js');
  const html=readFileSync(new URL('../frontend/static/theme-editor.html',import.meta.url),'utf8');
  const settings=src('theme-settings-live.js');
  const core=src('theme-editor.js');
  assert.match(html,/\/admin\/js\/theme-embed-review\.js/);
  assert.match(html,/\/admin\/css\/theme-embed-review\.css/);
  assert.match(code,/\/admin\/theme-editor\/embed-catalog\.json/);
  assert.match(code,/\/api\/admin\/cms\/pages\/.*catalog-resources/);
  assert.match(code,/data-embed-install/);
  assert.match(code,/isPreviewOnly:!canInstall/);
  assert.match(code,/event\.preventDefault\(\)/);
  assert.doesNotMatch(code,/Copy preview JSON|navigator\.clipboard/);
  for(const key of ['brand.logoUrl','page.maxWidth','inputs.radius','overlays.placement','icons.style']){
    assert.ok(settings.includes(key),'missing CMS-connected theme draft control '+key);
  }
  assert.match(core,/Matching CMS pages/);
  assert.match(core,/ui_review/);
  assert.match(core,/localShowcase/);
});
