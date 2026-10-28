import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {RESOLVE_PORTAL_TEMPLATES} from '../../../packages/theme-resolve/src/portal-templates.mjs';
const server=fileURLToPath(new URL('../scripts/preview-sdk-showcase.mjs',import.meta.url));

test('Resolve portal page navigation, CMS draft fixtures, stylesheet and JS are available without database writes',async t=>{
 const port=4398;
 const origin='http://127.0.0.1:'+port;
 const child=spawn(process.execPath,[server],{env:{...process.env,PORT:String(port)},stdio:'ignore'});
 t.after(()=>child.kill('SIGTERM'));
 let started=false;
 for(let i=0;i<50;i++){
  try {const r=await fetch(origin+'/api/admin/cms/pages');if(r.ok){started=true;break;}}catch{}
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 assert.equal(started,true,'server started');
 const list=await(await fetch(origin+'/api/admin/cms/pages')).json();
 for(const template of RESOLVE_PORTAL_TEMPLATES){
  assert.ok(list.pages.some(p=>p.slug===template.slug && p.template_key===template.template_key));
  const doc=await fetch(origin+'/themes/resolve/demo/portal/'+template.path);
  assert.equal(doc.status,200,template.path);
  const markup=await doc.text();
  assert.match(markup,/portal\.js/);
  if(template.slug==='resolve-sign-in'){
    const inspect=await fetch(origin+'/themes/resolve/demo/portal/'+template.path+'?studio_preview=1');
    assert.match(await inspect.text(),/resolve-preview-bridge\.js/);
  }
  const fixture=await fetch(origin+'/api/admin/cms/pages/'+template.slug);
  assert.equal(fixture.status,200);
  const data=await fixture.json();
  assert.equal(data.page.slug,template.slug);
  assert.deepEqual(data.page.sections.map(s=>s.key),template.sections);
  assert.equal(data.page.status,'draft');
 }
 for(const path of ['portal.css','portal.js','catalog.js']){
  const res=await fetch(origin+'/themes/resolve/demo/portal/'+path);
  assert.equal(res.status,200,path);
 }
 const bareEditor=await fetch(origin+'/admin/theme-editor?slug=home',{redirect:'manual'});
 assert.equal(bareEditor.status,302);
 assert.match(bareEditor.headers.get('location')||'',/showcase=resolve/);
 const originalMedia=await fetch(origin+'/themes/resolve/demo/assets/generated/media-ced60fcecc.webp');
 assert.equal(originalMedia.status,200);
 const editor=await fetch(origin+'/admin/theme-editor?slug=resolve-sign-in&showcase=resolve');
 assert.equal(editor.status,200);
 const unauthorized=await fetch(origin+'/api/admin/cms/pages/resolve-sign-in',{method:'POST',body:'{}'});
 assert.notEqual(unauthorized.status,200);
 const bad=await fetch(origin+'/themes/resolve/demo/portal/unlisted');
 assert.notEqual(bad.status,200);
});
