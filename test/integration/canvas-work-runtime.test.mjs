import test from 'node:test';
import assert from 'node:assert/strict';
import { createSqliteD1 } from '../../apps/local-studio/backend/worker/work-sqlite-d1.js';
import { handleWorkRequest, isWorkRequest } from '../../apps/local-studio/backend/worker/work-service.js';
import { blankCanvasDocument } from '../../apps/local-studio/backend/worker/work-canvas.js';

// Isolated actual SQLite, with the production D1 columns and constraints read on
// 2026-11-06. R2 is a fault-injectable byte store; no live credentials or writes.
const SCHEMA = `
CREATE TABLE accounts(id TEXT PRIMARY KEY);
CREATE TABLE auth_users(id TEXT PRIMARY KEY, default_account_id TEXT REFERENCES accounts(id));
CREATE TABLE projects(id TEXT PRIMARY KEY, name TEXT, description TEXT, project_type TEXT, owner_user_id TEXT);
CREATE TABLE agentsam_artifacts (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL, tenant_id TEXT NOT NULL, workspace_id TEXT,
 name TEXT NOT NULL, description TEXT, artifact_type TEXT NOT NULL DEFAULT 'html',
 r2_key TEXT NOT NULL, public_url TEXT, source TEXT NOT NULL, tags TEXT DEFAULT '[]',
 is_public INTEGER DEFAULT 0, file_size_bytes INTEGER, created_at INTEGER DEFAULT (unixepoch()),
 updated_at INTEGER DEFAULT (unixepoch()), workspace_slug TEXT, project_key TEXT,
 artifact_status TEXT DEFAULT 'draft', visibility TEXT DEFAULT 'private', mime_type TEXT,
 content_hash TEXT, preview_r2_key TEXT, preview_url TEXT, thumbnail_r2_key TEXT,
 thumbnail_url TEXT, source_run_id TEXT, source_session_id TEXT, source_message_id TEXT,
 source_workflow_id TEXT, source_tool_key TEXT, source_model_key TEXT,
 validation_status TEXT DEFAULT 'untested', published_at INTEGER, archived_at INTEGER,
 metadata_json TEXT DEFAULT '{}', source_skill_id TEXT, r2_bucket TEXT NOT NULL DEFAULT 'artifacts',
 scope TEXT NOT NULL DEFAULT 'user', expires_at INTEGER
);
CREATE TABLE agentsam_executions (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, workspace_id TEXT NOT NULL, user_id TEXT,
 execution_type TEXT NOT NULL, run_id TEXT NOT NULL, execution_key TEXT, status TEXT NOT NULL,
 duration_ms INTEGER NOT NULL DEFAULT 0, started_at_unix INTEGER NOT NULL,
 completed_at_unix INTEGER, error_log_id TEXT, account_id TEXT,
 metadata_json TEXT NOT NULL DEFAULT '{}', UNIQUE (execution_type, run_id)
);
CREATE TABLE agentsam_execution_steps (
 id TEXT PRIMARY KEY, execution_id TEXT NOT NULL REFERENCES agentsam_executions(id) ON DELETE CASCADE,
 workflow_run_id TEXT, agent_run_id TEXT, node_key TEXT NOT NULL, node_type TEXT, step_type TEXT,
 tool_name TEXT, status TEXT NOT NULL DEFAULT 'pending'
 CHECK(status IN ('pending','running','success','failed','skipped','approval_pending','timed_out','retrying')),
 input_json TEXT DEFAULT '{}', output_json TEXT DEFAULT '{}', error_json TEXT DEFAULT '{}',
 started_at INTEGER, completed_at INTEGER, latency_ms INTEGER, attempt INTEGER NOT NULL DEFAULT 1,
 edge_taken TEXT, tokens_in INTEGER NOT NULL DEFAULT 0, tokens_out INTEGER NOT NULL DEFAULT 0,
 cost_usd REAL NOT NULL DEFAULT 0, quality_score REAL, approval_id TEXT,
 created_at_unix INTEGER NOT NULL DEFAULT (unixepoch()), account_id TEXT, capability_key TEXT,
 tool_id TEXT, tool_key TEXT, connection_id TEXT, runtime_lease_id TEXT, orchestration_key TEXT
);
INSERT INTO accounts(id) VALUES ('shared_account');
INSERT INTO auth_users(id,default_account_id) VALUES ('owner_one','shared_account'),('owner_two','shared_account');
INSERT INTO projects VALUES ('private_project','Private project','Owned context','website','owner_two');
`;
const CANVAS = 'canvas_aaaaaaaaaaaa';
const RUN = 'run_aaaaaaaaaaaa';
const base = '/api/work/canvases';
const url = (path='') => 'https://studio.example' + base + path;
const request = (method, path='', body, headers={}) => new Request(url(path), {
 method, headers:{...(body!==undefined?{'content-type':'application/json'}:{}),...headers},
 body:body!==undefined?JSON.stringify(body):undefined,
});
const directions = ['one','two','three','four'].map((id,index)=>({id,title:'Direction '+index,description:'Distinct composition '+index,creativeIntent:'Distinct layout hierarchy '+index}));
const initial = () => ({...blankCanvasDocument(),directions});
function setup(t, generationService) {
 const DB=createSqliteD1(); DB.exec(SCHEMA); t.after(()=>DB.close());
 const objects=new Map(); let failWrite=false;
 const ARTIFACTS={
  async put(key,value){if(failWrite)throw new Error('storage temporarily unavailable');objects.set(key,new Uint8Array(value));},
  async get(key){const bytes=objects.get(key);return bytes?{arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)}:null;},
  async delete(key){objects.delete(key);},
 };
 const pending=[];
 const context={canvasRuntime:{generationService},waitUntil(value){pending.push(value);}};
 const env={DB,ARTIFACTS};
 const invoke=(method,path='',body,owner='owner_one',headers={})=>handleWorkRequest(request(method,path,body,headers),env,owner,context);
 return {DB,objects,env,context,pending,invoke,failWrites(value){failWrite=value;}};
}
async function create(h, document=initial()) {
 const response=await h.invoke('POST','',{id:CANVAS,document});
 assert.equal(response.status,201,await response.clone().text());
 return response.json();
}

// The Work dispatcher only accepts the principal supplied by verified Identity.
// An HTTP header, workspace, site or shared tenant must never stand in for it.
test('Canvas Work routes reject absent identity even with spoofed identity headers',async()=>{
 for(const path of ['', '/'+CANVAS, '/'+CANVAS+'/directions','/'+CANVAS+'/runs','/'+CANVAS+'/events', '/'+CANVAS+'/runs/'+RUN+'/execute']){
  assert.equal(isWorkRequest(base+path),true,path);
  const response=await handleWorkRequest(request('POST',path,{}, {'x-user-id':'owner_one','x-account-id':'shared_account'}),{},null);
  assert.equal(response.status,401,path);
  assert.equal((await response.json()).error,'unauthorized');
 }
});

test('one principal cannot read or mutate another principal Canvas within the same tenant',async t=>{
 const h=setup(t); const created=await create(h);
 const duplicate=await h.invoke('POST','',{id:CANVAS,document:initial()});
 assert.equal(duplicate.status,200); assert.equal((await duplicate.json()).canvas.id,CANVAS);
 for(const [method,path,body] of [
  ['GET','/'+CANVAS],['PUT','/'+CANVAS,{document:initial()}],['DELETE','/'+CANVAS],
  ['GET','/'+CANVAS+'/events'],['POST','/'+CANVAS+'/directions',{}],
  ['POST','/'+CANVAS+'/runs',{id:RUN,base_revision:created.canvas.revision,direction_id:'one'}],
 ]){
  const response=await h.invoke(method,path,body,'owner_two',{'if-match':'"'+created.canvas.contentHash+'"'});
  assert.equal(response.status,404,method+' '+path+': '+await response.clone().text());
 }
 const list=await (await h.invoke('GET','',undefined,'owner_two')).json();
 assert.deepEqual(list.canvases,[]);
 const row=await h.DB.prepare('SELECT * FROM agentsam_artifacts WHERE id=?').bind(CANVAS).first();
 assert.equal(row.user_id,'owner_one'); assert.equal(row.tenant_id,'shared_account');
 assert.equal(row.visibility,'private'); assert.equal(row.is_public,0); assert.equal(row.archived_at,null);
});

test('cross-origin Canvas writes fail before any document or execution is created',async t=>{
 const h=setup(t);
 const response=await h.invoke('POST','',{id:CANVAS,document:initial()},'owner_one',{origin:'https://other.example'});
 assert.equal(response.status,403);
 assert.equal((await h.DB.prepare('SELECT count(*) AS n FROM agentsam_artifacts').first()).n,0);
 assert.equal(h.objects.size,0);
});

test('two concurrent writers use SQLite CAS and reopening retains the winning revision',async t=>{
 const h=setup(t);const created=await create(h);const hash=created.canvas.contentHash;
 const responses=await Promise.all(['First writer','Second writer'].map(name=>h.invoke('PUT','/'+CANVAS,{document:{...initial(),name}},'owner_one',{'if-match':'"'+hash+'"'})));
 assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
 const winner=await responses.find(r=>r.status===200).json();
 const reopened=await (await h.invoke('GET','/'+CANVAS)).json();
 assert.equal(reopened.canvas.revision,2); assert.equal(reopened.canvas.contentHash,winner.canvas.contentHash);
 assert.notEqual(reopened.canvas.contentHash,hash);
 assert.ok(['First writer','Second writer'].includes(reopened.document.name));
 const history=await (await h.invoke('GET','/'+CANVAS+'/history')).json();
 assert.ok(history.history?.length || history.revisions?.length,'prior saved revision remains available');
});

async function queue(h, revision=1) {
 const response=await h.invoke('POST','/'+CANVAS+'/runs',{id:RUN,base_revision:revision,direction_id:'one',provider:'openai',model_id:'gpt-5.4-mini'});
 assert.equal(response.status,202,await response.clone().text()); return response.json();
}
const execute = h => h.invoke('POST','/'+CANVAS+'/runs/'+RUN+'/execute',{});
const readStream = async response => (await response.text()).trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
const deferred = () => {let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};

test('streamed operations are persisted, owned, cursor-resumable and reopen from saved bytes',async t=>{
 const h=setup(t,{async executeCanvasGeneration({document,emit,apply}){
  await emit('generation.plan',{plan:{name:'Saved creation',pages:[]}});
  await apply({...document,name:'Saved creation'}, {type:'document.rename',target:CANVAS});
 }});
 await create(h); await queue(h);
 const duplicate=await h.invoke('POST','/'+CANVAS+'/runs',{id:RUN,base_revision:1,direction_id:'one'});
 assert.equal(duplicate.status,200);
 const response=await execute(h); assert.equal(response.status,200);
 assert.match(response.headers.get('content-type'),/application\/x-ndjson/);
 const streamed=await readStream(response);
 assert.ok(streamed.some(event=>event.type==='canvas.saved'));
 assert.deepEqual(streamed.at(-1),{type:'run.status',status:'completed'});
 const reopened=await (await h.invoke('GET','/'+CANVAS)).json();
 assert.equal(reopened.document.name,'Saved creation'); assert.equal(reopened.canvas.revision,2);
 const receipt=await (await h.invoke('GET','/'+CANVAS+'/events')).json();
 assert.deepEqual(receipt.events.map(event=>event.type),['run.queued','run.started','generation.plan','canvas.saved','run.completed']);
 assert.ok(receipt.events.every(event=>event.runId===RUN));
 const after=await (await h.invoke('GET','/'+CANVAS+'/events?after='+receipt.events[1].sequence)).json();
 assert.deepEqual(after.events.map(event=>event.type),['generation.plan','canvas.saved','run.completed']);
 const other=await h.invoke('GET','/'+CANVAS+'/events?after=0',undefined,'owner_two');
 assert.equal(other.status,404);
 const run=await (await h.invoke('GET','/'+CANVAS+'/runs/'+RUN)).json();
 assert.equal(run.run.status,'completed'); assert.equal(run.run.checkpoint.contentHash,reopened.canvas.contentHash);
 assert.equal((await h.DB.prepare('PRAGMA foreign_key_check').all()).results.length,0);
});

test('cancel during generation prevents subsequent apply and a duplicate executor cannot take the lease',async t=>{
 const entered=deferred(),release=deferred();
 t.after(()=>release.resolve());
 const h=setup(t,{async executeCanvasGeneration({document,apply}){
  entered.resolve(); await release.promise;
  await apply({...document,name:'Must never save'}, {type:'document.rename',target:CANVAS});
 }});
 const before=await create(h); await queue(h);
 const response=await execute(h); await entered.promise;
 const second=await execute(h); assert.equal(second.status,409);
 const wrongOwner=await h.invoke('POST','/'+CANVAS+'/runs/'+RUN+'/cancel',{},'owner_two');
 assert.equal(wrongOwner.status,404);
 const cancelled=await h.invoke('POST','/'+CANVAS+'/runs/'+RUN+'/cancel',{});
 assert.equal(cancelled.status,200); assert.equal((await cancelled.json()).run.status,'cancelled');
 release.resolve(); await readStream(response);
 const reopened=await (await h.invoke('GET','/'+CANVAS)).json();
 assert.equal(reopened.canvas.contentHash,before.canvas.contentHash);
 assert.equal(reopened.canvas.revision,1);
 const receipts=await (await h.invoke('GET','/'+CANVAS+'/events')).json();
 assert.ok(receipts.events.some(event=>event.type==='run.cancelled'));
 assert.ok(!receipts.events.some(event=>event.type==='canvas.saved'));
});

test('manual edit during a model operation wins and generation records a recoverable conflict',async t=>{
 const entered=deferred(),release=deferred(); t.after(()=>release.resolve());
 const h=setup(t,{async executeCanvasGeneration({document,apply}){
  entered.resolve(); await release.promise;
  await apply({...document,name:'Stale model output'},{type:'document.rename',target:CANVAS});
 }});
 const before=await create(h);await queue(h);
 const response=await execute(h);await entered.promise;
 const edit=await h.invoke('PUT','/'+CANVAS,{document:{...initial(),name:'User edit'}},'owner_one',{'if-match':'"'+before.canvas.contentHash+'"'});
 assert.equal(edit.status,200);release.resolve();
 const events=await readStream(response);
 assert.equal(events.at(-1).status,'failed'); assert.equal(events.at(-1).error.code,'revision_conflict');
 const saved=await (await h.invoke('GET','/'+CANVAS)).json();assert.equal(saved.document.name,'User edit');
 const run=await (await h.invoke('GET','/'+CANVAS+'/runs/'+RUN)).json();assert.equal(run.run.status,'failed');
 const retry=await h.invoke('POST','/'+CANVAS+'/runs/'+RUN+'/retry',{base_revision:saved.canvas.revision});
 assert.equal(retry.status,200); assert.equal((await retry.json()).run.status,'queued');
});

test('storage failure during generation retains the saved source and persists the failure receipt',async t=>{
 const h=setup(t,{async executeCanvasGeneration({document,apply}){
  h.failWrites(true);
  await apply({...document,name:'Interrupted save'},{type:'document.rename',target:CANVAS});
 }});
 const before=await create(h);await queue(h);
 const response=await execute(h);const events=await readStream(response);
 assert.equal(events.at(-1).status,'failed');
 h.failWrites(false);
 const saved=await (await h.invoke('GET','/'+CANVAS)).json();
 assert.equal(saved.canvas.contentHash,before.canvas.contentHash);assert.equal(saved.document.name,before.document.name);
 const receipts=await (await h.invoke('GET','/'+CANVAS+'/events')).json();
 assert.ok(receipts.events.some(event=>event.type==='run.failed'));
 assert.ok(!receipts.events.some(event=>event.type==='canvas.saved'));
});

test('private project context is rejected before invoking generation',async t=>{
 let calls=0;const h=setup(t,{async prepareCanvasDirections(){calls++;return {directions};}});
 await create(h);
 const denied=await h.invoke('POST','/'+CANVAS+'/directions',{projectId:'private_project'});
 assert.equal(denied.status,404);assert.equal((await denied.json()).error,'project_not_found');assert.equal(calls,0);
});

test('real generation orchestrator reads packaged knowledge and progressively commits provider output',async t=>{
 const h=setup(t);await create(h);await queue(h);
 const plan={name:'Generated workspace',tokens:{ink:'#172126'},pages:[{id:'home',name:'Home',purpose:'A useful entry page',width:1200,height:900}],dataRequirements:[]};
 const artboard={artboard:{id:'home',background:'#ffffff',nodes:[{id:'home_title',type:'text',name:'Title',x:40,y:40,width:500,height:70,text:'Your working space',style:{fontSize:40,color:'#172126'}}]}};
 const outputs=[plan,artboard];let completions=0;const prompts=[];
 Object.assign(h.context.canvasRuntime,{
  resolveCredential:async()=>({value:'isolated-test-credential',source:'test'}),
  fetchImpl:async(input,options={})=>{
   const path=new URL(String(input)).pathname;
   if(path==='/v1/models')return Response.json({data:[{id:'gpt-5.4-mini',object:'model'}]});
   assert.equal(path,'/v1/responses');
   const body=JSON.parse(options.body);prompts.push(body.instructions);
   const result=outputs[completions++];assert.ok(result,'no unexpected provider invocation');
   return Response.json({id:'response_'+completions,object:'response',status:'completed',output_text:JSON.stringify(result),usage:{input_tokens:100,output_tokens:50}});
  },
 });
 const response=await execute(h);const events=await readStream(response);
 assert.equal(events.at(-1).status,'completed',JSON.stringify(events.at(-1)));
 assert.equal(completions,2);
 const saved=await (await h.invoke('GET','/'+CANVAS)).json();
 assert.equal(saved.canvas.revision,3);assert.equal(saved.document.artboards[0].nodes[0].text,'Your working space');
 assert.equal(saved.document.provenance.generation.runId,RUN);
 assert.deepEqual(saved.document.provenance.generation.completedArtboardIds,['home']);
 const receipts=await (await h.invoke('GET','/'+CANVAS+'/events')).json();
 assert.equal(receipts.events.filter(event=>event.type==='canvas.saved').length,2);
 const skills=receipts.events.filter(event=>event.type==='skill.loaded');
 assert.ok(skills.some(event=>event.payload.id==='agentsam-canvas-creation'));
 assert.ok(skills.every(event=>event.payload.sha256));
 assert.ok(prompts.every(prompt=>prompt.includes('Canvas')));
 const models=receipts.events.filter(event=>event.type==='model.completed');
 assert.equal(models.length,2);assert.ok(models.every(event=>event.payload.response_id));
});

test('retrying an old run cannot bypass the single active generation invariant',async t=>{
 const h=setup(t);await create(h);await queue(h);
 assert.equal((await h.invoke('POST','/'+CANVAS+'/runs/'+RUN+'/cancel',{})).status,200);
 const newer='run_bbbbbbbbbbbb';
 const created=await h.invoke('POST','/'+CANVAS+'/runs',{id:newer,base_revision:1,direction_id:'two'});
 assert.equal(created.status,202);
 const retried=await h.invoke('POST','/'+CANVAS+'/runs/'+RUN+'/retry',{base_revision:1});
 assert.equal(retried.status,409);
 const runs=await h.DB.prepare("SELECT id,status FROM agentsam_executions WHERE execution_key=? AND status IN ('queued','running')").bind(CANVAS).all();
 assert.deepEqual(runs.results.map(row=>row.id),[newer]);
});

test('an interrupted executor cannot claim while a newer generation is queued',async t=>{
 const entered=deferred(),release=deferred();t.after(()=>release.resolve());
 const h=setup(t,{async executeCanvasGeneration({document,apply}){entered.resolve();await release.promise;await apply({...document,name:'Disconnected output'});}});
 await create(h);await queue(h);
 const first=await execute(h);await entered.promise;await first.body.cancel();
 const state=await (await h.invoke('GET','/'+CANVAS+'/runs/'+RUN)).json();assert.equal(state.run.status,'interrupted');
 const newer='run_bbbbbbbbbbbb';
 assert.equal((await h.invoke('POST','/'+CANVAS+'/runs',{id:newer,base_revision:1,direction_id:'two'})).status,202);
 const resumed=await execute(h);
 release.resolve();await Promise.all(h.pending);
 assert.equal(resumed.status,409);
 const active=await h.DB.prepare("SELECT id FROM agentsam_executions WHERE execution_key=? AND status IN ('queued','running')").bind(CANVAS).all();
 assert.deepEqual(active.results.map(row=>row.id),[newer]);
});

test('a stale emitter cannot append events or overwrite a newer lease checkpoint',async t=>{
 const entered=deferred(),release=deferred();let calls=0;let delayed=false;t.after(()=>release.resolve());
 const h=setup(t,{async executeCanvasGeneration({document,emit,apply}){
  const name=++calls===1?'stale':'current';
  await emit('generation.plan',{plan:{name,pages:[]}});
  await apply({...document,name});
 }});
 await create(h);await queue(h);
 const original=h.env.DB;
 h.env.DB={...original,prepare(sql){
  const statement=original.prepare(sql);
  return {...statement,bind(...args){
   const bound=statement.bind(...args);
   return {...bound,async run(){
    if(!delayed&&sql.includes('INSERT')&&sql.includes('agentsam_execution_steps')&&args.some(value=>typeof value==='string'&&value.includes('"name":"stale"'))){delayed=true;entered.resolve();await release.promise;}
    return bound.run();
   }};
  }};
 }};
 const oldResponse=await execute(h);await entered.promise;
 assert.equal((await h.invoke('POST','/'+CANVAS+'/runs/'+RUN+'/cancel',{})).status,200);
 assert.equal((await h.invoke('POST','/'+CANVAS+'/runs/'+RUN+'/retry',{base_revision:1})).status,200);
 const freshResponse=await execute(h);const freshEvents=await readStream(freshResponse);
 assert.equal(freshEvents.at(-1).status,'completed');
 release.resolve();await readStream(oldResponse);await Promise.all(h.pending);
 const saved=await (await h.invoke('GET','/'+CANVAS)).json();assert.equal(saved.document.name,'current');
 const run=await (await h.invoke('GET','/'+CANVAS+'/runs/'+RUN)).json();
 assert.equal(run.run.checkpoint.plan.name,'current');
 const events=await (await h.invoke('GET','/'+CANVAS+'/events')).json();
 assert.ok(!events.events.some(event=>event.payload?.plan?.name==='stale'));
});
