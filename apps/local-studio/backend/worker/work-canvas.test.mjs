import test from 'node:test';
import assert from 'node:assert/strict';
import {handleCanvasRequest,blankCanvasDocument,validateCanvasDocument,isCanvasRequest,readCanvas,saveCanvas} from './work-canvas.js';
import {canvasStorageFixture} from './test/canvas-storage-fixture.mjs';

const id='canvas_aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',rid='run_bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const path='/api/work/canvases';
const request=(method,suffix='',data,hash,headers={})=>new Request('https://studio.example'+path+suffix,{
 method,headers:{...(data?{'content-type':'application/json'}:{}),...(hash?{'if-match':'"'+hash+'"'}:{}),...headers},
 body:data===undefined?undefined:JSON.stringify(data),
});
const call=(h,method,suffix='',data,hash,owner='owner_a',context={})=>handleCanvasRequest(request(method,suffix,data,hash),h.env,owner,context);
async function create(h){const response=await call(h,'POST','',{id});assert.equal(response.status,201);return response.json();}
const node=()=>({id:'heading',type:'text',name:'Heading',x:10,y:10,width:200,height:70,text:'Actual editable text',style:{fontSize:32}});
const board=()=>({id:'home',name:'Home',x:0,y:0,width:1200,height:800,background:'#ffffff',nodes:[node()]});
const directions=()=>Array.from({length:4},(_,i)=>({id:'direction-'+i,title:'Direction '+i,description:'Composition '+i,creativeIntent:'Intent '+i}));

test('route recognition is narrow and validates nested documents and responsive values',()=>{
 assert.equal(isCanvasRequest(path+'/'+id+'/runs/'+rid+'/execute'),true);
 assert.equal(isCanvasRequest(path+'/../../other'),false);
 const doc={...blankCanvasDocument(),artboards:[board()]};
 assert.equal(validateCanvasDocument(doc),true);
 assert.equal(validateCanvasDocument({...doc,artboards:[{...board(),id:'heading'}]}),false);
 assert.equal(validateCanvasDocument({...doc,artboards:[{...board(),nodes:[node(),node()]}]}),false);
 assert.equal(validateCanvasDocument({...doc,artboards:[{...board(),nodes:[{...node(),style:{background:'url(https://evil.example)'}}]}]}),false);
 assert.equal(validateCanvasDocument({...doc,artboards:[{...board(),nodes:[{...node(),responsive:{390:{width:320,style:{fontSize:24}}}}]}]}),true);
});
test('creative workspace artifacts persist through the same private Canvas artifact and list filter',async t=>{
 const h=canvasStorageFixture();t.after(h.close);
 await create(h); // An existing legacy Canvas remains outside the creative gallery.
 const creativeId='canvas_creative-aabbccddeeff';
 const artifact={
  id:creativeId,type:'slides',name:'Brand Guidelines',createdAt:new Date().toISOString(),
  updatedAt:new Date().toISOString(),workspace:'slides',
  data:{slides:[{id:'slide_1234567890abcdef',name:'Cover',background:'#ffffff',objects:[{id:'object_1234567890abcdef',type:'text',name:'Title',x:30,y:30,w:400,h:80,text:'Brand Guidelines'}],notes:'',comments:[]}]}
 };
 const document={
  ...blankCanvasDocument(),name:artifact.name,host:'slides',
  artboards:[{id:'slide_1234567890abcdef',name:'Cover',x:0,y:0,width:1200,height:675,background:'#ffffff',nodes:[node()]}],
  creativeWorkspace:{schema:'agentsam.creative-workspace.v1',artifact}
 };
 const created=await call(h,'POST','',{id:creativeId,document});
 assert.equal(created.status,201);
 const payload=await created.json();
 assert.equal(payload.canvas.creativeSchema,'agentsam.creative-workspace.v1');
 assert.equal(payload.canvas.creativeType,'slides');
 const list=await (await call(h,'GET','?workspace=creative')).json();
 assert.deepEqual(list.canvases.map(item=>item.id),[creativeId]);
 const reopened=await call(h,'GET','/'+creativeId);
 assert.equal(reopened.status,200);
 assert.deepEqual((await reopened.json()).document.creativeWorkspace.artifact,artifact);
 const row=await h.DB.prepare('SELECT metadata_json FROM agentsam_artifacts WHERE id=?').bind(creativeId).first();
 assert.equal(JSON.parse(row.metadata_json).creativeSchema,'agentsam.creative-workspace.v1');
 const mismatched={...document,creativeWorkspace:{...document.creativeWorkspace,artifact:{...artifact,id:'canvas_different-aabbccddeeff'}}};
 assert.equal(validateCanvasDocument(mismatched),true);
 assert.equal((await call(h,'PUT','/'+creativeId,{document:mismatched},payload.canvas.contentHash)).status,400);
});
test('create is private, idempotent and exact durable bytes reopen',async t=>{
 const h=canvasStorageFixture();t.after(h.close);
 const a=await create(h);
 assert.equal(a.document.artboards.length,0);
 assert.equal(a.canvas.revision,1);
 const retry=await call(h,'POST','',{id});assert.equal(retry.status,200);assert.equal((await retry.json()).created,false);
 assert.deepEqual((await (await call(h,'GET','/'+id)).json()).document,a.document);
 const row=await h.DB.prepare('SELECT * FROM agentsam_artifacts WHERE id=?').bind(id).first();
 assert.equal(row.user_id,'owner_a');assert.equal(row.visibility,'private');assert.equal(row.tenant_id,'account_a');
 assert.equal(h.objects.size,1);
 assert.equal((await call(h,'POST','',{id},undefined,'owner_b')).status,409);
});
test('every lifecycle request isolates principals and refuses signed-out and cross-origin mutation',async t=>{
 const h=canvasStorageFixture();t.after(h.close);const a=await create(h);
 for(const method of ['GET','PUT','DELETE'])assert.equal((await call(h,method,'/'+id,method==='PUT'?{document:a.document}:undefined,a.canvas.contentHash,'owner_b')).status,404);
 assert.equal((await call(h,'GET','',undefined,undefined,null)).status,401);
 assert.deepEqual((await (await call(h,'GET','',undefined,undefined,'owner_b')).json()).canvases,[]);
 const cross=await handleCanvasRequest(request('POST','',{id:'canvas_crossorigin-aabbcc'},undefined,{origin:'https://evil.example'}),h.env,'owner_a');
 assert.equal(cross.status,403);
 assert.equal(h.objects.size,1);
});
test('concurrent save CAS preserves winner, history and exact restore; stale archive refused',async t=>{
 const h=canvasStorageFixture();t.after(h.close);const a=await create(h);
 const doc={...a.document,name:'First saved design',artboards:[board()]};
 const writes=await Promise.all([call(h,'PUT','/'+id,{document:doc},a.canvas.contentHash),call(h,'PUT','/'+id,{document:{...doc,name:'Other writer'}},a.canvas.contentHash)]);
 assert.deepEqual(writes.map(r=>r.status).sort(),[200,409]);
 const current=await readCanvas(h.env,'owner_a',id);assert.equal(current.canvas.revision,2);
 assert.equal(h.objects.size,3); // first JSON, winning JSON and its saved thumbnail; losing CAS cleans up.
 const savedRow=await h.DB.prepare('SELECT thumbnail_r2_key FROM agentsam_artifacts WHERE id=?').bind(id).first();
 assert.match(savedRow.thumbnail_r2_key,/^canvas\/owner_a\/canvas_[a-z0-9-]+\/thumb-rev-2-[a-z0-9-]+\.svg$/);
 assert.ok(h.objects.has(savedRow.thumbnail_r2_key));
 const thumbnail=new TextDecoder().decode(h.objects.get(savedRow.thumbnail_r2_key));
 assert.match(thumbnail, /<svg[^>]*width="512"/);
 assert.match(thumbnail,/Actual edi/);
 assert.equal((await call(h,'DELETE','/'+id,undefined,a.canvas.contentHash)).status,409);
 const history=await (await call(h,'GET','/'+id+'/history')).json();assert.equal(history.revisions.length,2);
 const restore=await call(h,'POST','/'+id+'/restore',{revision:1},current.canvas.contentHash);
 assert.equal(restore.status,200);const restored=await restore.json();assert.deepEqual(restored.document,a.document);assert.equal(restored.canvas.revision,3);
});
test('failed and missing object writes never advance metadata or return fabricated document',async t=>{
 const h=canvasStorageFixture();t.after(h.close);const a=await create(h);
 h.failWrites(true);const response=await call(h,'PUT','/'+id,{document:{...a.document,name:'Unsaved'}},a.canvas.contentHash);assert.equal(response.status,500);
 h.failWrites(false);assert.equal((await readCanvas(h.env,'owner_a',id)).canvas.revision,1);
 h.breakReads(true);assert.equal((await call(h,'GET','/'+id)).status,424);
});
test('thumbnail failure never blocks a durable editable Canvas revision',async t=>{
 const h=canvasStorageFixture();t.after(h.close);const initial=await create(h);
 h.failThumbnailWrites(true);
 const doc={...initial.document,name:'Working without preview',artboards:[board()]};
 const saved=await call(h,'PUT','/'+id,{document:doc},initial.canvas.contentHash);
 assert.equal(saved.status,200);
 const row=await h.DB.prepare('SELECT thumbnail_r2_key FROM agentsam_artifacts WHERE id=?').bind(id).first();
 assert.equal(row.thumbnail_r2_key,null);
 const opened=await readCanvas(h.env,'owner_a',id);
 assert.equal(opened.canvas.revision,2);
 assert.deepEqual(opened.document,doc);
 assert.equal(h.objects.size,2);
});
test('real SQL execution lifecycle emits actual saves and is idempotent; wrong owner cannot read run',async t=>{
 const h=canvasStorageFixture();t.after(h.close);const a=await create(h);
 await saveCanvas(h.env,'owner_a',id,{...a.document,directions:directions()},a.canvas.contentHash);
 const data={id:rid,direction_id:'direction-0',base_revision:2,provider:'test',model_id:'test'};
 assert.equal((await call(h,'POST','/'+id+'/runs',data)).status,202);
 assert.equal((await call(h,'POST','/'+id+'/runs',data)).status,200);
 assert.equal((await call(h,'GET','/'+id+'/runs/'+rid,undefined,undefined,'owner_b')).status,404);
 const runtime={generationService:{async executeCanvasGeneration({document,emit,apply}){
  await emit('knowledge.loaded',{skillIds:['actual-test-skill']});
  await emit('generation.plan',{plan:{artboards:[{id:'home'}]}});
  await apply({...document,artboards:[board()]},{type:'artboard.created',target:'home'});
 }}};
 const executed=await call(h,'POST','/'+id+'/runs/'+rid+'/execute',{},undefined,'owner_a',{canvasRuntime:runtime});
 assert.equal(executed.status,200);const stream=await executed.text();assert.match(stream,/canvas.saved/);assert.match(stream,/completed/);
 const run=await (await call(h,'GET','/'+id+'/runs/'+rid)).json();assert.equal(run.run.status,'completed');assert.equal(run.run.checkpoint.revision,3);
 const eventPage=await (await call(h,'GET','/'+id+'/events?after=0')).json();assert.ok(eventPage.events.some(e=>e.type==='canvas.saved'));assert.ok(eventPage.cursor>0);
 assert.deepEqual((await readCanvas(h.env,'owner_a',id)).document.artboards,[board()]);
 assert.equal((await call(h,'POST','/'+id+'/runs/'+rid+'/execute',{})).status,409);
});
test('manual concurrent save fails generation CAS without overwriting manual document',async t=>{
 const h=canvasStorageFixture();t.after(h.close);const a=await create(h);
 await call(h,'POST','/'+id+'/runs',{id:rid,instruction:'Create a page',base_revision:1});
 const runtime={generationService:{async executeCanvasGeneration({document,apply}){
  await saveCanvas(h.env,'owner_a',id,{...document,name:'Manual edit wins'},a.canvas.contentHash);
  await apply({...document,artboards:[board()]});
 }}};
 const executed=await call(h,'POST','/'+id+'/runs/'+rid+'/execute',{},undefined,'owner_a',{canvasRuntime:runtime});await executed.text();
 const run=await (await call(h,'GET','/'+id+'/runs/'+rid)).json();assert.equal(run.run.status,'failed');assert.equal(run.run.error.code,'revision_conflict');
 assert.equal((await readCanvas(h.env,'owner_a',id)).document.name,'Manual edit wins');
});
test('cancel prevents later generated save and retry requires current revision',async t=>{
 const h=canvasStorageFixture();t.after(h.close);await create(h);
 await call(h,'POST','/'+id+'/runs',{id:rid,instruction:'Create a page',base_revision:1});
 const runtime={generationService:{async executeCanvasGeneration({document,apply}){
  assert.equal((await call(h,'POST','/'+id+'/runs/'+rid+'/cancel',{})).status,200);
  await apply({...document,artboards:[board()]});
 }}};
 const executed=await call(h,'POST','/'+id+'/runs/'+rid+'/execute',{},undefined,'owner_a',{canvasRuntime:runtime});await executed.text();
 assert.equal((await readCanvas(h.env,'owner_a',id)).canvas.revision,1);
 const run=await (await call(h,'GET','/'+id+'/runs/'+rid)).json();assert.equal(run.run.status,'cancelled');
 assert.equal((await call(h,'POST','/'+id+'/runs/'+rid+'/retry',{base_revision:0})).status,409);
 assert.equal((await call(h,'POST','/'+id+'/runs/'+rid+'/retry',{base_revision:1})).status,200);
});

test('cancellation during R2 write atomically prevents publishing the new revision',async t=>{
 const h=canvasStorageFixture();t.after(h.close);await create(h);
 await call(h,'POST','/'+id+'/runs',{id:rid,instruction:'Create a page',base_revision:1});
 const put=h.env.ARTIFACTS.put;
 h.env.ARTIFACTS.put=async(...args)=>{await put(...args);await call(h,'POST','/'+id+'/runs/'+rid+'/cancel',{});};
 const runtime={generationService:{async executeCanvasGeneration({document,apply}){await apply({...document,artboards:[board()]});}}};
 const response=await call(h,'POST','/'+id+'/runs/'+rid+'/execute',{},undefined,'owner_a',{canvasRuntime:runtime});await response.text();
 assert.equal((await readCanvas(h.env,'owner_a',id)).canvas.revision,1);
 assert.equal(h.objects.size,1);
});


test('Page, Document and Spreadsheet artifacts persist through the shared creative Canvas lifecycle',async t=>{
 const h=canvasStorageFixture();t.after(h.close);
 const artifacts=[
  {id:'canvas_page-aaaaaaaaaaaa',type:'page',name:'To-do List',workspace:'page',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),data:{title:'To-do List',subtitle:'A living task list',blocks:[{id:'pageblock_aaaaaaaa',type:'task_list',title:'To do',items:[{id:'task_aaaaaaaa',text:'Review the template',checked:false}]}]}},
  {id:'canvas_document-bbbbbbbbbbbb',type:'document',name:'Project Brief',workspace:'document',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),data:{title:'Project Brief',subtitle:'Working brief',blocks:[{id:'docblock_bbbbbbbb',type:'heading',text:'Overview'},{id:'docblock_bbbbbbbc',type:'paragraph',text:'Describe the project.'}]}},
  {id:'canvas_spreadsheet-cccccccccccc',type:'spreadsheet',name:'Project Tracker',workspace:'spreadsheet',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),data:{activeSheetId:'sheet_cccccccc',sheets:[{id:'sheet_cccccccc',name:'Tracker',columns:[{id:'column_cccccccc',label:'Task',type:'text'}],rows:[{id:'row_cccccccc',cells:{column_cccccccc:'Review the template'}}]}]}}
 ];
 for(const artifact of artifacts){
  const document={...blankCanvasDocument(),name:artifact.name,host:artifact.type,creativeWorkspace:{schema:'agentsam.creative-workspace.v1',artifact}};
  const response=await call(h,'POST','',{id:artifact.id,document});
  assert.equal(response.status,201,artifact.type);
  const payload=await response.json();
  assert.equal(payload.canvas.creativeType,artifact.type);
  const stored=await h.DB.prepare('SELECT thumbnail_r2_key FROM agentsam_artifacts WHERE id=? AND user_id=?').bind(artifact.id,'owner_a').first();
  assert.ok(stored.thumbnail_r2_key,artifact.type+' initial thumbnail');
  assert.ok(h.objects.has(stored.thumbnail_r2_key),artifact.type+' thumbnail object');
  const reopened=await call(h,'GET','/'+artifact.id);
  assert.equal(reopened.status,200);
  assert.deepEqual((await reopened.json()).document.creativeWorkspace.artifact,artifact);
 }
 const list=await (await call(h,'GET','?workspace=creative')).json();
 assert.deepEqual(new Set(list.canvases.map(item=>item.id)),new Set(artifacts.map(item=>item.id)));
 const page=artifacts[0];
 const invalid={...blankCanvasDocument(),name:page.name,host:'page',creativeWorkspace:{schema:'agentsam.creative-workspace.v1',artifact:{...page,data:{...page.data,blocks:[{id:'pageblock_bad',type:'task_list',title:'To do',items:[{id:'task_bad',text:'Bad item',checked:'no'}]}]}}}};
 assert.equal(validateCanvasDocument(invalid),false);
});
