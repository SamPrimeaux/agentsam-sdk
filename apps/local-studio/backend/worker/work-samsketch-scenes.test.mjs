import test from 'node:test';
import assert from 'node:assert/strict';
import {handleSamSketchSceneRequest,isSamSketchSceneRequest,validateSamSketchDocument} from './work-samsketch-scenes.js';

const id='sketch_aaaaaaaaaaaa';
const url=(suffix='')=>'https://studio.example/api/work/samsketch/scenes'+suffix;
const sample=()=>({version:1,name:'Working scene',brand:'agentsam',chapter:0,items:[]});
const req=(method,path='',body,hash)=>new Request(url(path),{method,headers:{...(body?{'content-type':'application/json'}:{}),...(hash?{'if-match':'"'+hash+'"'}:{})},body:body&&method!=='GET'&&method!=='HEAD'?JSON.stringify(body):undefined});
function harness(){
 const rows=new Map(),objects=new Map();
 let brokenReads=false;
 const DB={prepare(sql){return{bind(...args){return{
  async first(){
   if(sql.includes('FROM auth_users'))return {default_account_id:'account_one'};
   if(sql.includes('SELECT id,user_id,artifact_type'))return rows.get(args[0])||null;
   const row=rows.get(args[0]);
   return row&&row.user_id===args[1]&&row.artifact_type==='samsketch-scene'&&!row.archived_at?{...row}:null;
  },
  async all(){
   return{results:[...rows.values()].filter(x=>x.user_id===args[0]&&x.artifact_type==='samsketch-scene'&&!x.archived_at).map(x=>({...x}))};
  },
  async run(){
   if(sql.startsWith('INSERT')){
    if(rows.has(args[0]))return{meta:{changes:0}};
    rows.set(args[0],{id:args[0],user_id:args[1],tenant_id:args[2],name:args[3],artifact_type:'samsketch-scene',r2_key:args[4],content_hash:args[6],thumbnail_r2_key:args[7],metadata_json:args[8],updated_at:1762500000});
    return{meta:{changes:1}};
   }
   if(sql.includes('SET archived_at')){
    const row=rows.get(args[0]);if(!row||row.user_id!==args[1])return{meta:{changes:0}};
    row.archived_at=1762500000;return{meta:{changes:1}};
   }
   const row=rows.get(args[6]);if(!row||row.user_id!==args[7]||row.content_hash!==args[8])return{meta:{changes:0}};
   Object.assign(row,{name:args[0],r2_key:args[1],content_hash:args[3],thumbnail_r2_key:args[4],metadata_json:args[5],updated_at:1762500001});
   return{meta:{changes:1}};
  }
 };}}}};
 const ARTIFACTS={
  async put(key,body){objects.set(key,new Uint8Array(body));},
  async get(key){
   if(brokenReads)return null;
   const bytes=objects.get(key);
   return bytes?{arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)}:null;
  },
  async delete(key){objects.delete(key);},
 };
 return{env:{DB,ARTIFACTS},rows,objects,setBrokenRead:value=>brokenReads=value};
}
test('SamSketch route matches only narrow private scene paths',()=>{
 assert.equal(isSamSketchSceneRequest('/api/work/samsketch/scenes'),true);
 assert.equal(isSamSketchSceneRequest('/api/work/samsketch/scenes/'+id),true);
 assert.equal(isSamSketchSceneRequest('/api/work/samsketch/scenes/../../projects'),false);
});
test('blank scene is valid, duplicate IDs and malformed transforms are rejected',()=>{
 assert.equal(validateSamSketchDocument(sample()),true);
 const one={id:'mesh-1',name:'Mesh',kind:'box',position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],color:'#abc123',material:'clay',visible:true};
 assert.equal(validateSamSketchDocument({...sample(),items:[one,one]}),false);
 assert.equal(validateSamSketchDocument({...sample(),items:[{...one,position:[NaN,0,0]}]}),false);
 assert.equal(validateSamSketchDocument({...sample(),items:[{...one,partOverrides:{foo:{scale:[0,Infinity,1]}}}]}),false);
});
test('create persists a private scene, retry is idempotent and reload reads same bytes',async()=>{
 const h=harness();
 const first=await handleSamSketchSceneRequest(req('POST','',{id,document:sample()}),h.env,'owner_one');
 assert.equal(first.status,201);
 const receipt=await first.json();
 assert.equal(receipt.scene.id,id);
 const second=await handleSamSketchSceneRequest(req('POST','',{id,document:sample()}),h.env,'owner_one');
 assert.equal(second.status,200);assert.equal((await second.json()).created,false);
 assert.equal(h.rows.size,1);assert.equal(h.rows.get(id).tenant_id,'account_one');
 const reopen=await handleSamSketchSceneRequest(req('GET','/'+id),h.env,'owner_one');
 assert.equal(reopen.status,200);assert.deepEqual((await reopen.json()).document,sample());
});
test('owner isolation covers list, read, update and delete',async()=>{
 const h=harness();await handleSamSketchSceneRequest(req('POST','',{id,document:sample()}),h.env,'owner_one');
 const other='owner_two';
 assert.deepEqual((await (await handleSamSketchSceneRequest(req('GET'),h.env,other)).json()).scenes,[]);
 for(const method of ['GET','DELETE','PUT']){
  const result=await handleSamSketchSceneRequest(req(method,'/'+id,{document:sample()}),h.env,other);
  assert.equal(result.status,404);
 }
 assert.equal(h.rows.get(id).archived_at,undefined);
});
test('update uses optimistic hash, rejects stale writer and retains saved revision',async()=>{
 const h=harness();const first=await handleSamSketchSceneRequest(req('POST','',{id,document:sample()}),h.env,'owner_one');
 const oldHash=(await first.json()).scene.contentHash;
 let updated=await handleSamSketchSceneRequest(req('PUT','/'+id,{document:{...sample(),name:'Revised'}},'incorrect'),h.env,'owner_one');
 assert.equal(updated.status,409);
 updated=await handleSamSketchSceneRequest(req('PUT','/'+id,{document:{...sample(),name:'Revised'}},oldHash),h.env,'owner_one');
 assert.equal(updated.status,200);
 assert.equal((await updated.json()).scene.revision,2);
 const stale=await handleSamSketchSceneRequest(req('PUT','/'+id,{document:sample()},oldHash),h.env,'owner_one');
 assert.equal(stale.status,409);
 const reopen=await handleSamSketchSceneRequest(req('GET','/'+id),h.env,'owner_one');
 assert.equal((await reopen.json()).document.name,'Revised');
});
test('missing R2 asset fails rather than returning an invented scene',async()=>{
 const h=harness();await handleSamSketchSceneRequest(req('POST','',{id,document:sample()}),h.env,'owner_one');
 h.setBrokenRead(true);
 const res=await handleSamSketchSceneRequest(req('GET','/'+id),h.env,'owner_one');
 assert.equal(res.status,424);
 assert.equal((await res.json()).error,'scene_asset_missing_or_invalid');
});
test('delete archives the scene without exposing it to another account',async()=>{
 const h=harness();await handleSamSketchSceneRequest(req('POST','',{id,document:sample()}),h.env,'owner_one');
 const del=await handleSamSketchSceneRequest(req('DELETE','/'+id),h.env,'owner_one');
 assert.equal(del.status,200);
 const reopen=await handleSamSketchSceneRequest(req('GET','/'+id),h.env,'owner_one');
 assert.equal(reopen.status,404);
});

test('interrupted update readback leaves the previously saved document intact',async()=>{
 const h=harness();
 const original=await handleSamSketchSceneRequest(req('POST','',{id,document:sample()}),h.env,'owner_one');
 const digest=(await original.json()).scene.contentHash;
 const beforeKey=h.rows.get(id).r2_key;
 h.setBrokenRead(true);
 const failed=await handleSamSketchSceneRequest(req('PUT','/'+id,{document:{...sample(),name:'Interruption'}},digest),h.env,'owner_one');
 assert.equal(failed.status,502);
 assert.equal(h.rows.get(id).r2_key,beforeKey);
 assert.equal(h.rows.get(id).content_hash,digest);
 h.setBrokenRead(false);
 const read=await handleSamSketchSceneRequest(req('GET','/'+id),h.env,'owner_one');
 assert.equal((await read.json()).document.name,'Working scene');
});

test('concurrent duplicate create requests resolve to one stable owner-owned scene',async()=>{
 const h=harness();
 const results=await Promise.all([
  handleSamSketchSceneRequest(req('POST','',{id,document:sample()}),h.env,'owner_one'),
  handleSamSketchSceneRequest(req('POST','',{id,document:sample()}),h.env,'owner_one'),
 ]);
 assert.deepEqual(results.map(result=>result.status).sort(),[200,201]);
 assert.equal(h.rows.size,1);
});
