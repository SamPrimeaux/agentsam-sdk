import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root = new URL('../',import.meta.url);
const read = p=>readFileSync(new URL(p,root),'utf8');
const server=fileURLToPath(new URL('scripts/preview-sdk-showcase.mjs',root));
test('existing bundled manifests own every editor embed and enforce first name in form configuration',()=>{
 const core=JSON.parse(read('agentsam.app.json'));
 const resend=JSON.parse(read('apps/resend/agentsam.app.json'));
 const embeds=[...core.storefront_embeds,...resend.storefront_embeds];
 assert.deepEqual(embeds.map(e=>e.key).sort(),[
  'announcement_bar','announcement_modal','contact_form','newsletter_modal','newsletter_subscribe'
 ].sort());
 for(const embed of embeds){
  assert.ok(embed.default_config);
  assert.ok(embed.permissions.length);
  assert.ok(embed.surfaces.includes('storefront_embed'));
  if(embed.key.startsWith('newsletter')) {
   assert.deepEqual(embed.default_config.required_fields,['email','first_name']);
   assert.equal(embed.default_config.double_opt_in,true);
   assert.equal(embed.default_config.fields.includes('last_name'),false);
  }
 }
 assert.equal(resend.configuration.credential_secret,'RESEND_API_KEY');
});
test('embedded configuration UI provides local install, toggle, configure, delete, form field and preview actions',()=>{
 const editor=read('frontend/static/js/theme-editor.js');
 const studio=read('frontend/static/js/resolve-studio.js');
 const bridge=read('frontend/static/js/resolve-preview-bridge.js');
 assert.match(editor,/const resolveShowcase/);
 assert.match(editor,/AgentSamResolveStudio\?\.mount/);
 for(const action of ['data-rs-install','data-rs-preview','data-rs-check','data-rs-remove-field',
 'data-rs-add-field','data-rs-reset','data-rs-agent','data-rs-scroll','data-rs-required']){
  assert.ok(studio.includes(action),'missing visual editor action '+action);
 }
 for(const behavior of ['agentsam:resolve-update','agentsam:resolve-select',
 'agentsam:resolve-detected','scrollIntoView','preview_only','first_name']){
  assert.ok(bridge.includes(behavior),'missing preview interaction '+behavior);
 }
 assert.match(bridge,/event\.preventDefault\(\)/);
 assert.match(bridge,/Invalid email|valid email/);
});
test('typed signup contract requires first name without a table NOT NULL, and blocks suppressed contacts', async ()=>{
 const {validateSignupFields,allowsSubscriptionTransition}=await import('../backend/cms/storefront-embed-contract.ts');
 const config={required_fields:['email','first_name']};
 assert.deepEqual(validateSignupFields({email:'alex@example.com'},config),{ok:false,error:'first_name is required'});
 assert.deepEqual(validateSignupFields({email:'alex@example.com',first_name:'Alex'},config),{
  ok:true,fields:{email:'alex@example.com',first_name:'Alex',last_name:null}
 });
 assert.equal(allowsSubscriptionTransition('pending'),true);
 for(const status of ['bounced','complained','unsubscribed'])assert.equal(allowsSubscriptionTransition(status),false);
});

test('local server serves the real Resolve app, manifest-driven catalog, and refuses writes',async t=>{
 const port=4373, origin='http://127.0.0.1:'+port;
 const child=spawn(process.execPath,[server],{env:{...process.env,PORT:String(port)},stdio:'ignore'});
 t.after(()=>child.kill('SIGTERM'));
 let started=false;
 for(let i=0;i<50;i++){
  try{const r=await fetch(origin+'/admin/theme-editor?slug=home&showcase=resolve');if(r.ok){started=true;break}}catch{}
  await new Promise(resolve=>setTimeout(resolve,75));
 }
 assert.equal(started,true,'SDK local preview running');
 for(const path of ['/admin/js/resolve-studio.js','/admin/js/resolve-preview-bridge.js',
 '/themes/resolve/demo/?studio_preview=1','/themes/resolve/demo/assets/index-D8au46Z5.js',
 '/themes/resolve/demo/assets/index-BSaLpPG1.css','/api/admin/cms/embed-catalog']){
  const response=await fetch(origin+path);
  assert.equal(response.status,200,path);
 }
 const catalog=await (await fetch(origin+'/api/admin/cms/embed-catalog')).json();
 assert.equal(catalog.preview_only,true);
 assert.equal(catalog.apps.length,5);
 assert.equal(catalog.apps.find(x=>x.key==='newsletter_modal').provider,'resend');
 assert.equal(catalog.apps.find(x=>x.key==='newsletter_modal').connection_status,'preview_only');
 const html=await (await fetch(origin+'/themes/resolve/demo/?studio_preview=1')).text();
 assert.match(html,/resolve-preview-bridge\.js/);
 assert.match(html,/index-D8au46Z5\.js/);
 const clean=await (await fetch(origin+'/themes/resolve/demo/')).text();
 assert.doesNotMatch(clean,/resolve-preview-bridge\.js/);
 const write=await fetch(origin+'/api/admin/cms/pages/home',{method:'PUT',headers:{'Content-Type':'application/json'},body:'{}'});
 assert.notEqual(write.status,200);
});
