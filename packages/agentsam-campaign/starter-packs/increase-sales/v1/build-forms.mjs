import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
function normalizeFormDocument(doc) {
  if(!doc||doc.version!==1||!['popup','inline'].includes(doc.mode)||!Array.isArray(doc.fields)||!doc.fields.length||doc.fields.length>20)throw Error('invalid_form_blueprint');
  const seen=new Set();
  for(const f of doc.fields){
    if(!/^[a-z0-9][a-z0-9-]{1,70}$/.test(f.key)||seen.has(f.key)||!['text','email','tel','textarea','select','checkbox'].includes(f.type))throw Error('invalid_form_field');
    seen.add(f.key);
  }
  return doc;
}
const root=path.dirname(fileURLToPath(import.meta.url));
const out=path.join(root,'forms-dist');
await fs.rm(out,{recursive:true,force:true});
await fs.mkdir(out,{recursive:true});
execFileSync(process.execPath,[path.join(root,'build.mjs')],{cwd:root,stdio:'pipe'});
await fs.cp(path.join(root,'dist'),path.join(out,'previews'),{recursive:true});
const source=JSON.parse(await fs.readFile(path.join(out,'previews','starter-campaigns.json'),'utf8'));
const templates=source.templates;
const prefix='forms/campaigns/increase-sales/v1/';
const owner='@inneranimalmedia/agentsam-campaign';
const formSpecs={
'product-launch':['Early-access product waitlist','Get notified when the new product launches.',['name','email','product','consent'],'popup'],
'collection-promotion':['Collection updates','Receive curated collection updates.',['name','email','interest','consent'],'inline'],
'flash-sale':['Sale alerts signup','Choose to receive sale updates.',['email','consent'],'popup'],
'seasonal-sale':['Seasonal favorites','Receive updates on seasonal selections.',['name','email','interest','consent'],'popup'],
'back-in-stock':['Availability notification request','Request an availability update; this does not reserve inventory.',['email','product','consent'],'inline'],
'preorder':['Preorder interest list','Register your interest. This is not an order or payment.',['name','email','product','consent'],'popup'],
'first-purchase':['New customer updates','Opt in to first-purchase offers when available.',['email','consent'],'popup'],
'customer-winback':['Stay in touch','Choose to hear about relevant new arrivals.',['email','interest','consent'],'inline'],
'subscription-upgrade':['Plan upgrade inquiry','Ask about available subscription plans; no plan changes are made.',['name','email','plan','message','consent'],'inline'],
'custom-sales':['Sales inquiry','Ask about a product or service.',['name','email','message','consent'],'inline'],
};
const fieldCatalog={
name:{key:'name',label:'Your name',type:'text',required:false,placeholder:'Name',options:[]},
email:{key:'email',label:'Email address',type:'email',required:true,placeholder:'you@example.com',options:[]},
product:{key:'product',label:'Which product are you interested in?',type:'text',required:true,placeholder:'Product or item name',options:[]},
interest:{key:'interest',label:'What are you interested in?',type:'textarea',required:false,placeholder:'Share your preferences',options:[]},
message:{key:'message',label:'Tell us more',type:'textarea',required:true,placeholder:'Your message',options:[]},
plan:{key:'plan',label:'What plan are you considering?',type:'text',required:false,placeholder:'Plan or feature of interest',options:[]},
consent:{key:'consent',label:'I agree to receive updates about this request by email.',type:'checkbox',required:true,placeholder:'',options:[]}
};
const htmlEscape=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeJSON=x=>JSON.stringify(x).replace(/</g,'\\u003c');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
async function put(rel,content){const full=path.join(out,rel);await fs.mkdir(path.dirname(full),{recursive:true});const data=typeof content==='string'?content:JSON.stringify(content,null,2)+'\n';await fs.writeFile(full,data);return rel}
const formDocs=new Map();
for(const [id,[title,desc,names,mode]] of Object.entries(formSpecs)){
 const draft={
  version:1,title,description:desc,mode,
  fields:names.map(name=>({...fieldCatalog[name]})),
  appearance:{background:'#ffffff',text:'#191919',accent:'#238552',button:'#238552',radius:12,font:'Inter, system-ui, sans-serif'},
  behavior:{pages:'all',trigger:'manual',device:'all'},
  success:{title:'Request received',message:'Thank you. Your response was received.'},
 };
 const doc=normalizeFormDocument(draft);
 const record={schema:'agentsam.forms.importable-starter.v1',owner,form_key:'campaign-'+id,campaign_template_id:id,
  import_policy:'user_installed_explicitly_as_draft',production_publish:false,requires_verified_consent:true,
  title,description:desc,document:doc};
 formDocs.set(id,record);
 await put('forms/campaign-'+id+'.json',record);
}
for(const t of templates){
 const create={schema:'agentsam.campaign.creation-view.v1',owner,
  campaign_template_id:t.id,template_version:t.template_version,
  route_owner:'Growth UI (consumer)',data_owner:'agentsam-campaign',
  objective_key:t.objective_key,title:t.name,
  configuration_fields:t.fields,
  suggested_channels:t.channel_defaults,
  workflow_kind:t.workflow_kind,
  validation_gates:t.required_checks,
  sections:[
   {id:'basics',title:'Campaign basics',fields:['name','objective','brief','priority']},
   {id:'targets',title:'Products and offer',fields:t.fields.filter(x=>['catalog','collection','discount','select'].includes(x.type)).map(x=>x.key)},
   {id:'audience',title:'Audience',fields:t.fields.filter(x=>x.type==='segment').map(x=>x.key)},
   {id:'channels',title:'Channels',fields:['selected_channels','destination_refs']},
   {id:'creative',title:'Creative',fields:t.fields.filter(x=>['asset','text','textarea'].includes(x.type)).map(x=>x.key)},
   {id:'review',title:'Review and approval',fields:['reviewed_asset_versions','permission_receipts']},
   {id:'schedule',title:'Schedule',fields:t.fields.filter(x=>x.type==='datetime').map(x=>x.key)}
  ],
  requires_host_context:['authorized_account','authorized_site','available_channels'],
  linked_form_blueprint:formDocs.has(t.id)?'forms/campaign-'+t.id+'.json':null,
  production_publish:false,
 };
 await put('creation/'+t.id+'.json',create);
 const data=formDocs.get(t.id);
 const formData=data?.document??null;
 const fieldsHTML=(formData?.fields||[]).map(f=>{
  const label=htmlEscape(f.label);const attr=f.required?' required':'';
  const key=htmlEscape(f.key);
  if(f.type==='checkbox')return '<label class="choice"><input type="checkbox" name="'+key+'"'+attr+'> '+label+'</label>';
  if(f.type==='textarea')return '<label>'+label+'<textarea name="'+key+'"'+attr+' placeholder="'+htmlEscape(f.placeholder)+'"></textarea></label>';
  return '<label>'+label+'<input type="'+htmlEscape(f.type)+'" name="'+key+'"'+attr+' placeholder="'+htmlEscape(f.placeholder)+'"></label>';
 }).join('\n');
 const inlineForm=data?'<form id="form"><h3>'+htmlEscape(data.title)+'</h3><p>'+htmlEscape(data.description)+'</p>'+fieldsHTML+'<button type="submit">Preview submission</button><small>This demo does not save or send submissions.</small></form>':'<div class="nonform">This campaign does not require a signup form. The live CTA would be resolved through the merchant-approved storefront.</div>';
 const content='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+htmlEscape(t.name)+' | Campaign modal preview</title><style>'+
 ':root{font:15px system-ui,-apple-system,sans-serif;color:#1c2924}*{box-sizing:border-box}body{background:#f1f4f0;margin:0;padding:25px;min-height:100vh;display:grid;place-items:center}button{cursor:pointer;border:0;background:#214738;color:white;border-radius:8px;padding:12px 17px;font:600 14px system-ui}button:hover{background:#326954}.stage{max-width:650px;text-align:center}.stage h1{font-size:36px;letter-spacing:-.05em}.stage p{color:#5f6b63}.muted{font-size:12px;color:#667268}.shell{position:fixed;inset:0;background:#15251dc9;display:none;place-items:center;padding:14px;overflow:auto}.shell.open{display:grid}.dialog{position:relative;max-height:95vh;overflow:auto;width:min(100%,570px);padding:35px;background:#fff;border-radius:18px;box-shadow:0 12px 65px #0004}.dialog h2{font-size:30px;letter-spacing:-.045em;margin:12px 0}.dialog p{line-height:1.5;color:#607165}.eyebrow{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#397258;font-weight:700}.close{position:absolute;right:16px;top:13px;background:#eff3ef;color:#325144;padding:7px 12px}.dialog label{display:grid;gap:6px;text-align:left;font-weight:600;font-size:12px;margin:10px 0}.dialog input:not([type=checkbox]),.dialog textarea{padding:11px;width:100%;border:1px solid #b6c6bc;border-radius:8px;font:14px system-ui}.dialog textarea{min-height:80px}.dialog .choice{display:flex;align-items:flex-start;gap:9px}.dialog small{display:block;color:#607064;font-size:11px;margin-top:12px}.nonform{padding:15px;background:#ecf3ee;border-radius:8px;color:#436352;font-size:13px}#notice{color:#214738;font-weight:700}body>footer{position:fixed;bottom:16px;left:0;right:0;text-align:center;color:#617066;font-size:11px}@media(max-width:500px){.dialog{padding:21px}.dialog h2{font-size:25px}.stage h1{font-size:29px}}'+
 '</style></head><body><main class="stage"><p class="eyebrow">AgentSam Campaign · Starter '+t.sort_order+'/14</p><h1>'+htmlEscape(t.name)+'</h1><p>'+htmlEscape(t.summary)+'</p><button id="open">Open campaign popup preview</button><p class="muted">Standalone modal and optional form preview. No live checkout or submission.</p><p><a href="../previews/'+htmlEscape(t.slug)+'.html">Full campaign workspace preview</a></p></main><div class="shell" id="shell"><section class="dialog" role="dialog" aria-modal="true" aria-labelledby="title" tabindex="-1"><button class="close" id="close" aria-label="Close popup">✕</button><p class="eyebrow">'+htmlEscape(t.eyebrow)+'</p><h2 id="title">'+htmlEscape(t.headline)+'</h2><p>'+htmlEscape(t.body)+'</p><button id="cta">'+htmlEscape(t.cta_label)+' →</button><div id="form-slot" hidden>'+inlineForm+'</div><p id="notice" aria-live="polite"></p></section></div><footer>Preview only · Not connected to customer records, payment or publishing.</footer><script>'+
 '(function(){const shell=document.getElementById("shell"),open=document.getElementById("open"),close=document.getElementById("close"),slot=document.getElementById("form-slot"),notice=document.getElementById("notice");function reveal(){shell.classList.add("open");document.querySelector(".dialog").focus();}function dismiss(){shell.classList.remove("open");open.focus();}open.addEventListener("click",reveal);close.addEventListener("click",dismiss);shell.addEventListener("click",e=>{if(e.target===shell)dismiss()});document.addEventListener("keydown",e=>{if(e.key==="Escape"&&shell.classList.contains("open"))dismiss()});document.getElementById("cta").addEventListener("click",()=>{slot.hidden=false;notice.textContent="Preview action only — nothing was published or sent."});document.getElementById("form")?.addEventListener("submit",e=>{e.preventDefault();notice.textContent="Demo submission confirmed. No data was stored or sent.";e.target.reset()});})();'+
 '</script></body></html>';
 await put('modals/'+t.id+'.html',content);
}
const galleryItems=templates.map(t=>'<article><span>'+t.sort_order.toString().padStart(2,'0')+'</span><h3>'+htmlEscape(t.name)+'</h3><p>'+htmlEscape(t.summary)+'</p><nav><a href="previews/'+t.id+'.html">Full preview</a><a href="modals/'+t.id+'.html">Popup demo</a>'+(formDocs.has(t.id)?'<a href="forms/campaign-'+t.id+'.json">Form schema</a>':'')+'</nav></article>').join('');
await put('index.html','<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AgentSam Campaign | Forms and Modal Starter Library</title><style>body{font:15px system-ui;background:#f3f5f2;color:#20382e;margin:0}header{padding:50px max(18px,4vw);max-width:1400px;margin:auto}h1{font-size:clamp(30px,4vw,50px);letter-spacing:-.06em;margin:.25em 0}header p{color:#65756d}main{max-width:1400px;padding:0 max(18px,4vw) 70px;margin:auto;display:grid;grid-template-columns:repeat(3,1fr);gap:14px}article{padding:25px;border:1px solid #d5e2da;border-radius:14px;background:#fff}article span{color:#658572;font-size:11px}h3{font-size:19px;margin:13px 0 5px}article p{color:#637168;min-height:43px}nav{display:flex;gap:12px;flex-wrap:wrap}a{color:#17573d;font-size:12px;font-weight:650}a:hover{text-decoration:none}@media(max-width:970px){main{grid-template-columns:repeat(2,1fr)}}@media(max-width:580px){main{grid-template-columns:1fr}}</style><header><b>AgentSam / Campaign</b><h1>Sales campaigns, ready to customize.</h1><p>14 interactive campaign previews · 14 popup demos · '+formDocs.size+' optional AgentSamForms-compatible definitions. No live sends, offers, or checkout.</p></header><main>'+galleryItems+'</main></html>');
await put('catalog.json',{schema:'agentsam.campaign.forms-distribution.v1',owner,prefix,
 count:templates.length,form_count:formDocs.size,modal_count:templates.length,ready_for_import:true,production_published:false,
 templates:templates.map(t=>({id:t.id,name:t.name,preview:'previews/'+t.id+'.html',modal:'modals/'+t.id+'.html',creation:'creation/'+t.id+'.json',form:formDocs.has(t.id)?'forms/campaign-'+t.id+'.json':null}))
});
await put('README.md',[
'# AgentSam Campaign — Increase Sales form, modal and preview distribution',
'',
'Canonical domain owner: @inneranimalmedia/agentsam-campaign',
'R2: cms/'+prefix,
'',
'This is a distribution of draft-only templates for the Growth UI (consumer), with no D1 mutations or live publishing. The 14 full previews were copied from the verified original R2 distribution.',
'',
'## Assets',
'- 14 existing standalone interactive campaign preview HTML pages (under previews/)',
'- 14 standalone clickable popup/modal demo HTML pages (under modals/)',
'- 14 merchant-facing creation schemas (under creation/)',
'- '+formDocs.size+' AgentSamForms-compatible, optional customer-facing forms (under forms/)',
'- Catalog, checksum manifest and ZIP distribution',
'',
'## AgentSamForms contract',
'The forms/*.json records include document matching normalizeFormDocument from the existing Forms app. They are templates only. To install, a trusted authorized importer must resolve account_id and site_id, create a cms_globals draft with global_type=form, and let the owner review/publish. Never seed across customers automatically.',
'',
'## Campaign contract',
'All campaign definitions and attribution operations belong to @inneranimalmedia/agentsam-campaign. Growth only selects, configures and presents them. CMS retains page, section, media and publication authority.',
'',
'No new CMS spine, separate forms table, live customer data, functional checkout, emails, payment integration, or deployed storefront campaign is included.',
''].join('\n'));
const walk=async function*(dir,relative=''){for(const x of await fs.readdir(dir,{withFileTypes:true})){const r=path.posix.join(relative,x.name);if(x.isDirectory())yield* walk(path.join(dir,x.name),r);else yield r;}};
const fileRecords=[];
for await(const rel of walk(out)){if(rel==='manifest.json')continue;const bytes=await fs.readFile(path.join(out,rel));const type=rel.endsWith('.html')?'text/html':rel.endsWith('.json')?'application/json':rel.endsWith('.md')?'text/markdown':'application/octet-stream';fileRecords.push({path:rel,key:prefix+rel,sha256:sha(bytes),size_bytes:bytes.length,content_type:type});}
const manifest={schema:'agentsam.campaign.forms-pack-manifest.v1',owner,bucket:'cms',r2_prefix:prefix,version:'1.0.0',
 objective_key:'increase_sales',campaigns:templates.length,modals:templates.length,forms:formDocs.size,
 publication_state:'not_published',catalog_authority:'agentsam-campaign',form_authority:'cms_globals (AgentSamForms)',files:fileRecords,
 distribution_file_count:fileRecords.length+1
};
await put('manifest.json',manifest);
console.log(JSON.stringify({output:out,prefix,sourcePreviews:117,templates:templates.length,modalCount:templates.length,formCount:formDocs.size,files:manifest.distribution_file_count,manifestSha:sha(JSON.stringify(manifest,null,2)+'\n')}));

await fs.mkdir(path.join(root,'release'),{recursive:true});
execFileSync('zip',['-q','-r','../release/agentsam-campaign-increase-sales-forms-v1.zip','.'],{cwd:out,stdio:'pipe'});
