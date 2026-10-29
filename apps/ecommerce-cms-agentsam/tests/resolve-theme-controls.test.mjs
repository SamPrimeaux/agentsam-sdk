import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const scripts={
  settings:readFileSync(new URL('../frontend/static/js/resolve-theme-settings.js',import.meta.url),'utf8'),
  studio:readFileSync(new URL('../frontend/static/js/resolve-studio.js',import.meta.url),'utf8'),
  preview:readFileSync(new URL('../../../packages/theme-resolve/site/portal/preview-settings.js',import.meta.url),'utf8')
};
function storage(){
 const records=new Map();
 return {getItem:k=>records.get(k)??null,setItem:(k,v)=>records.set(k,v),
  removeItem:k=>records.delete(k),get length(){return records.size}};
}
test('Resolve has 18 real theme-setting accordion categories and scoped controls',()=>{
 let output='';
 const root={
  get innerHTML(){return output;},set innerHTML(v){output=v;},
  querySelectorAll:()=>[],querySelector:()=>null
 };
 const context={
  document:{querySelector:()=>root},location:{search:'?showcase=resolve'},
  window:{AgentSamResolveStudio:{getThemeSettings:()=>({}),updateThemeSettings:()=>true}},
  URLSearchParams,console
 };
 vm.runInNewContext(scripts.settings,context,{timeout:1000});
 const expected=['Logo and favicon','Color palette','Typography','Page','Animations','Badges',
  'Buttons','Cart','Drawers','Icons','Input fields','Popovers and modals','Prices',
  'Product cards','Search','Swatches','Variant pickers','Custom CSS'];
 for(const name of expected)assert.ok(output.includes(name),name);
 assert.equal((output.match(/data-rts-panel="/g)||[]).length,18);
 assert.match(output,/data-rts-key="palette.accent"/);
 assert.match(output,/data-rts-key="overlays.radius"/);
 assert.match(output,/data-rts-key="css.source"/);
 assert.match(output,/Copy theme settings JSON/);
 assert.match(output,/Reset all overrides/);
 assert.match(output,/D1 are not connected/);
 assert.ok(context.window.ResolveThemeSettingsPanel);
 assert.equal(context.window.ResolveThemeSettingsPanel.cssError('@import url(example.css);')!=='',true);
 assert.equal(context.window.ResolveThemeSettingsPanel.cssError('.rp-btn { color: red; }'),'');
});
test('Resolve draft creator stores typed page templates only in local workspace storage',()=>{
 const window={},ls=storage();
 const context={
  location:{search:'?showcase=resolve'},URLSearchParams,
  window,localStorage:ls,console,Date,Math,JSON,
  document:{getElementById:()=>null}
 };
 vm.runInNewContext(scripts.studio,context,{timeout:1000});
 assert.ok(window.AgentSamResolveStudio);
 const kinds=['products','collections','pages','blogs','posts','metaobject'];
 for(const kind of kinds){
  const p=window.AgentSamResolveStudio.createDraft(kind,'Sample '+kind);
  assert.match(p.slug,/^resolve-draft-/);
  assert.equal(p.status,'draft');
  assert.equal(p.localDraft,true);
  assert.equal(p.sections.length>0,true);
  assert.equal(window.AgentSamResolveStudio.getDraft(p.slug).title,'Sample '+kind);
  assert.equal(JSON.parse(p.metadata_json).preview_only,true);
 }
 assert.equal(window.AgentSamResolveStudio.getDrafts().length,6);
 const product=window.AgentSamResolveStudio.getDrafts().find(p=>p.kind==='products');
 assert.equal(window.AgentSamResolveStudio.deleteDraft(product.slug),true);
 assert.equal(window.AgentSamResolveStudio.getDraft(product.slug),null);
 assert.equal(window.AgentSamResolveStudio.getDrafts().length,5);
 const props=window.AgentSamResolveStudio.getThemeSettings();
 assert.equal(Object.keys(props).length,0);
 assert.equal(window.AgentSamResolveStudio.updateThemeSettings({'palette.accent':'#ff7619'}),true);
 assert.equal(window.AgentSamResolveStudio.getThemeSettings()['palette.accent'],'#ff7619');
 assert.ok(ls.length>0);
});
test('Shared preview CSS reflects valid Resolve settings, discards unsafe CSS and colors',()=>{
 const styles={};
 let sheet=null;
 const doc={
  documentElement:{style:{setProperty:(key,value)=>{styles[key]=value;}}},
  head:{append:el=>{sheet=el;}},
  createElement:tag=>({tagName:tag,textContent:'',id:''})
 };
 const w={};
 vm.runInNewContext(scripts.preview,{window:w,document:doc,console},{timeout:1000});
 w.ResolveThemeSettingsPreview.apply({
  'palette.accent':'#ff7619','cards.columns':'4','buttons.radius':12,
  'css.source':'.rp-preview { padding: 8px; }'
 });
 assert.equal(styles['--rts-accent'],'#ff7619');
 assert.equal(styles['--rts-grid-cols'],'4');
 assert.equal(styles['--rts-button-radius'],'12px');
 assert.match(sheet.textContent,/\.rp-preview \{ padding: 8px; \}/);
 w.ResolveThemeSettingsPreview.apply({'palette.accent':'red','css.source':'@import url(https://example.org);'});
 assert.equal(styles['--rts-accent'],'#8b181b');
 assert.doesNotMatch(sheet.textContent,/@import/);
});

test('Resolve editor preserves connected merchant settings source and adds local creation actions',()=>{
 const editor=readFileSync(new URL('../frontend/static/js/theme-editor.js',import.meta.url),'utf8');
 const host=readFileSync(new URL('../frontend/static/theme-editor.html',import.meta.url),'utf8');
 const live=readFileSync(new URL('../frontend/static/js/theme-settings-live.js',import.meta.url),'utf8');
 assert.match(editor,/openResolveCreation/);
 assert.match(editor,/getDrafts/);
 assert.match(editor,/getDraft\?\./);
 assert.match(editor,/Create local draft/);
 assert.match(editor,/Create & edit draft/);
 assert.match(editor,/switchPage\(draft.slug\)/);
 assert.match(host,/\/admin\/js\/resolve-theme-settings\.js/);
 assert.match(live,/if \(new URLSearchParams\(location.search\).get\('showcase'\) === 'resolve'\) return;/);
});
