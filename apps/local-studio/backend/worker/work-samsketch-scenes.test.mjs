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
   return bytes?{arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),body:new Blob([bytes]).stream()}:null;
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
test('SamSpeaks scene settings, PBR finishes, storyboard beats, props and brush strokes validate',()=>{
 const sceneSettings={
  profile:'vox',finish:'titanium',mood:'twilight',explodeAmount:.35,spinSpeed:.28,keyLightAngle:.65,keyIntensity:2.6,
  ambientHue:210,ambientSaturation:24,ambientIntensity:1.15,shadowSoftness:3,cameraShot:'hero',transitionType:'glide',
  cameraDistance:15,fieldOfView:37,autoTour:false,brushEnabled:true,fogEnabled:false,fogDensity:.012,
  wireframe:false,showGrid:false,selectionOutline:true,shadowsEnabled:true,surfaceTreatment:'metal',roughness:.22,metalness:.92,
  loopPresentation:false,voiceMode:'single',voiceName:'Kore',voiceStyle:'Warm cinematic narrator',environment:'studio',
  horizonBrightness:1.12,ambientShadowOpacity:.23,reducedMotion:false,showProperties:true,keepTimeline:true,
 };
 const beat={id:'beat-1',title:'Wide stage',script:'Welcome to SamSpeaks.',ttsMode:'single',voiceName:'Kore',voiceStyle:'Warm narrator',cameraShot:'establishing',transitionType:'glide',mood:'studio',explodeAmount:0};
 const prop={id:'prop-1',name:'Cypress Pine',kind:'prop',propType:'pine',position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],color:'#476a55',material:'metal',finish:'gold',visible:true};
 const valid={...sample(),sceneSettings,storyboard:[beat],brushStrokes:[{id:'stroke-1',points:[[0,0,0],[1,.2,1]],color:'#8d7eff',width:3}],items:[prop]};
 assert.equal(validateSamSketchDocument(valid),true);
 const canonicalPresets={...valid,sceneSettings:{...sceneSettings,finish:'iridescent',mood:'sunset'},storyboard:[{...beat,mood:'sunset'}],items:[{...prop,finish:'iridescent'}]};
 assert.equal(validateSamSketchDocument(canonicalPresets),true);
 assert.equal(validateSamSketchDocument({...valid,sceneSettings:{...sceneSettings,finish:'silver'}}),false);
 assert.equal(validateSamSketchDocument({...valid,items:[{...prop,propType:'unknown'}]}),false);
 assert.equal(validateSamSketchDocument({...valid,storyboard:[{...beat,explodeAmount:2}]}),false);
 assert.equal(validateSamSketchDocument({...valid,brushStrokes:[{id:'stroke-2',points:[[0,0,0]],color:'#8d7eff',width:3}]}),false);
 assert.equal(validateSamSketchDocument({...valid,brushStrokes:Array.from({length:101},(_,index)=>({id:'stroke-'+index,points:[[0,0,0],[1,1,1]],color:'#8d7eff',width:3}))}),false);
 assert.equal(validateSamSketchDocument({...valid,brushStrokes:[{id:'stroke-long',points:Array.from({length:301},(_,index)=>[index/100,0,0]),color:'#8d7eff',width:3}]}),false);
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

const nativeId='sketch_native-scene-aaaa';
const nativeAssetId='art_native_glb_01';
const nativeSource=async(bytes)=>{
 const sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
 return {format:'iamscene',formatVersion:'1.0.0',metadata:{id:nativeId,name:'Imported icon scene'},
  assets:[{id:nativeAssetId,uri:'assets/import.glb',mediaType:'model/gltf-binary',sha256,role:'presentation'}],
  materials:[],scene:{rootNodeIds:['scene-root'],nodes:[{id:'scene-root',name:'Scene',kind:'group',transform:{position:[0,0,0],scale:[1,1,1],rotation:[0,0,0,1]},visible:true}]},
  camera:{projection:'perspective',position:[0,2,5],target:[0,0,0],fov:45,near:0.01,far:100},
  environment:{background:'#ffffff',ambientIntensity:0.5,lights:[]},animations:[],interactions:[]};
};
test('native I.AM Scene and GLB assets are owner-scoped, hash-verified and reloadable',async()=>{
 const h=harness();const glb=new Uint8Array(24);glb.set([0x67,0x6c,0x54,0x46]);
 const document=await nativeSource(glb);
 assert.equal(validateSamSketchDocument(document),true);
 assert.equal(validateSamSketchDocument({...document,assets:[{...document.assets[0],uri:'../../other.glb'}]}),false);
 const create=await handleSamSketchSceneRequest(req('POST','',{id:nativeId,document}),h.env,'owner_one');
 assert.equal(create.status,201,JSON.stringify(await create.clone().json()));
 assert.equal((await create.json()).scene.itemCount,1);
 const assetPath='/'+nativeId+'/assets/'+nativeAssetId;
 assert.equal(isSamSketchSceneRequest(url(assetPath).replace('https://studio.example','')),true);
 const binary=(owner,bytes)=>handleSamSketchSceneRequest(new Request(url(assetPath),{
  method:'PUT',headers:{'content-type':'model/gltf-binary'},body:bytes}),h.env,owner);
 assert.equal((await binary('owner_two',glb)).status,404);
 const wrong=glb.slice();wrong[5]=42;
 assert.equal((await binary('owner_one',wrong)).status,400);
 assert.equal((await binary('owner_one',glb)).status,201);
 const denied=await handleSamSketchSceneRequest(req('GET',assetPath),h.env,'owner_two');
 assert.equal(denied.status,404);
 const get=await handleSamSketchSceneRequest(req('GET',assetPath),h.env,'owner_one');
 assert.equal(get.status,200);assert.equal(get.headers.get('content-type'),'model/gltf-binary');
 assert.deepEqual(new Uint8Array(await get.arrayBuffer()),glb);
 const reopen=await handleSamSketchSceneRequest(req('GET','/'+nativeId),h.env,'owner_one');
 assert.deepEqual((await reopen.json()).document,document);
});

test('native source assets survive account-scoped R2 upload with exact MIME, checksum and extension',async()=>{
 const h=harness();
 const glb=new Uint8Array(24);glb.set([0x67,0x6c,0x54,0x46]);
 const document=await nativeSource(glb);
 const raw=new TextEncoder().encode('v 0 0 0\nv 0 1 0\nv 1 0 0\nf 1 2 3\n');
 const sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',raw))].map(n=>n.toString(16).padStart(2,'0')).join('');
 const assetId='model_original_obj_01';
 document.assets.push({id:assetId,uri:'assets/original.obj',mediaType:'model/obj',sha256,role:'geometry-source'});
 assert.equal(validateSamSketchDocument(document),true);
 assert.equal(validateSamSketchDocument({...document,assets:[document.assets[0],{...document.assets[1],uri:'../../original.obj'}]}),false);
 assert.equal(validateSamSketchDocument({...document,assets:[document.assets[0],{...document.assets[1],mediaType:'text/html'}]}),false);
 const create=await handleSamSketchSceneRequest(req('POST','',{id:nativeId,document}),h.env,'owner_one');
 assert.equal(create.status,201);
 const assetPath='/'+nativeId+'/assets/'+assetId;
 const write=(owner,mime,bytes)=>handleSamSketchSceneRequest(new Request(url(assetPath),{
   method:'PUT',headers:{'content-type':mime},body:bytes,
 }),h.env,owner);
 assert.equal((await write('owner_two','model/obj',raw)).status,404);
 assert.equal((await write('owner_one','model/gltf-binary',raw)).status,415);
 const corrupt=raw.slice();corrupt[4]^=1;
 assert.equal((await write('owner_one','model/obj',corrupt)).status,400);
 assert.equal((await write('owner_one','model/obj',raw)).status,201);
 const stored=[...h.objects.keys()].find(key=>key.includes(assetId));
 assert.ok(stored?.endsWith('.obj'));
 const downloaded=await handleSamSketchSceneRequest(req('GET',assetPath),h.env,'owner_one');
 assert.equal(downloaded.status,200);
 assert.equal(downloaded.headers.get('content-type'),'model/obj');
 assert.deepEqual(new Uint8Array(await downloaded.arrayBuffer()),raw);
 const reopened=await handleSamSketchSceneRequest(req('GET','/'+nativeId),h.env,'owner_one');
 assert.equal((await reopened.json()).document.assets.length,2);
});
