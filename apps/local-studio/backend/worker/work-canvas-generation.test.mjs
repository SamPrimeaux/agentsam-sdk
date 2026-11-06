import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareCanvasDirections,executeCanvasGeneration,validateGeneratedArtboard} from './work-canvas-generation.js';

const directions=Array.from({length:4},(_,i)=>({id:'direction-'+i,title:'Direction '+i,
  description:'A distinct compositional direction number '+i,creativeIntent:'A purposeful creative intention number '+i}));
const empty=()=>({version:1,name:'Untitled',host:'work',brief:'An accessible independent application',
  artboards:[],tokens:{},components:[],assets:[],dataRequirements:[],provenance:{},directions});
const plan={name:'Notebook',tokens:{color:'#191919'},pages:[
  {id:'home',name:'Home',purpose:'Read and navigate',width:1200,height:900},
  {id:'about',name:'About',purpose:'Explain the project',width:1200,height:900},
],dataRequirements:[]};
const board=id=>({id,background:'#fff',nodes:[{id:id+'_title',type:'text',name:'Title',x:20,y:20,
  width:400,height:60,text:id==='home'?'Notebook':'About',style:{fontSize:40,color:'#191919'}}]});
const run={id:'run_test',provider:'openai',model_id:'gpt-5.4-mini',direction_id:'direction-0'};
function provider(outputs,{onRequest,credential=true}={}) {
  const calls=[];
  return {calls, resolveCredential:async()=>credential?{value:'test-only-credential',source:'user_vault'}:null,
    fetchImpl:async(url,init)=>{
      calls.push(String(url)); onRequest?.(url,init);
      if(String(url).endsWith('/models'))return Response.json({data:[{id:'gpt-5.4-mini'}]});
      const next=outputs.shift();
      if(next instanceof Error)throw next;
      if(next instanceof Response)return next;
      assert.ok(next,'unexpected provider request');
      return Response.json({id:'response_'+calls.length,output_text:JSON.stringify(next),
        usage:{input_tokens:100,output_tokens:50}});
    }};
}
function execution(document,runtime,options={}) {
  const events=[],saved=[];
  return {events,saved,args:{env:{},user:{id:'user-a'},document,run,emit:async(type,payload)=>events.push({type,payload}),
    apply:async(next,receipt)=>{saved.push({document:structuredClone(next),receipt});return {document:next};},
    shouldCancel:async()=>false,runtime,...options}};
}
test('directions use actual provider result and do not load pretend skills',async()=>{
  const runtime=provider([{directions}]);
  const result=await prepareCanvasDirections({env:{},user:{id:'user-a'},document:empty(),context:run,runtime});
  assert.deepEqual(result.directions,directions);
  assert.equal(result.model_id,'gpt-5.4-mini');
  assert.equal(runtime.calls.length,2);
});
test('unavailable provider has no fallback; blocked models never call a provider',async()=>{
  const runtime=provider([],{credential:false});
  await assert.rejects(prepareCanvasDirections({env:{},user:{id:'u'},document:empty(),context:run,runtime}),/credential_unavailable/);
  await assert.rejects(prepareCanvasDirections({env:{},user:{id:'u'},document:empty(),context:{...run,model_id:'gpt-5.5'},runtime}),/blocked_by_policy/);
  assert.equal(runtime.calls.length,0);
});
test('generation applies real structure and each completed artboard and reads skill sources',async()=>{
  const runtime=provider([plan,{artboard:board('home')},{artboard:board('about')}]);
  const e=execution(empty(),runtime);
  const result=await executeCanvasGeneration(e.args);
  assert.equal(e.saved.length,3);
  assert.deepEqual(e.saved.map(s=>s.receipt.type),['canvas.structure.created','canvas.artboard.created','canvas.artboard.created']);
  assert.equal(e.saved[0].document.artboards[0].nodes.length,0);
  assert.equal(e.saved[1].document.artboards[0].nodes[0].text,'Notebook');
  assert.equal(result.document.artboards[1].nodes[0].text,'About');
  const skills=e.events.filter(e=>e.type==='skill.loaded');
  assert.equal(skills.length,5);
  assert.ok(skills.every(e=>e.payload.sha256.length===64 && e.payload.source.endsWith('SKILL.md')));
  assert.ok(e.events.find(e=>e.type==='model.completed').payload.usage.output_tokens>0);
});
test('cancel during model response prevents all document mutations',async()=>{
  let cancelled=false;
  const runtime=provider([plan],{onRequest:url=>{if(String(url).endsWith('/responses'))cancelled=true;}});
  const e=execution(empty(),runtime,{shouldCancel:async()=>cancelled});
  await assert.rejects(executeCanvasGeneration(e.args),/canvas_generation_cancelled/);
  assert.equal(e.saved.length,0);
});
test('revision conflict stops generation before further model calls',async()=>{
  const runtime=provider([plan,{artboard:board('home')}]);
  const e=execution(empty(),runtime,{apply:async()=>{throw new Error('canvas_revision_conflict');}});
  await assert.rejects(executeCanvasGeneration(e.args),/canvas_revision_conflict/);
  assert.equal(runtime.calls.filter(url=>url.endsWith('/responses')).length,1);
});
test('checkpoint resume does not recreate already saved artboards',async()=>{
  const first=execution(empty(),provider([plan,{artboard:board('home')},new Error('network')]));
  await assert.rejects(executeCanvasGeneration(first.args),/canvas_provider_request_failed/);
  const saved=first.saved.at(-1).document;
  const checkpoint=first.events.find(e=>e.type==='generation.plan').payload;
  const second=execution(saved,provider([{artboard:board('about')}]),{run:{...run,checkpoint}});
  const result=await executeCanvasGeneration(second.args);
  assert.equal(second.saved.length,1);
  assert.equal(result.document.artboards[0].nodes[0].text,'Notebook');
  assert.equal(result.document.artboards[1].nodes[0].text,'About');
});
test('a selected element edit preserves every unrelated element',async()=>{
  const doc={...empty(),artboards:[{...board('home'),width:1200,height:900,x:0,y:0},{...board('about'),width:1200,height:900,x:1300,y:0}]};
  const patch={...doc.artboards[0].nodes[0],text:'Changed'};
  const e=execution(doc,provider([{patches:[patch],summary:'Updated title'}]),{run:{...run,instruction:'Change this title',selection:['home_title']}});
  const result=await executeCanvasGeneration(e.args);
  assert.equal(result.document.artboards[0].nodes[0].text,'Changed');
  assert.deepEqual(result.document.artboards[1],doc.artboards[1]);
});
test('model output cannot mutate a different selected resource',async()=>{
  const doc={...empty(),artboards:[{...board('home'),width:1200,height:900,x:0,y:0},{...board('about'),width:1200,height:900,x:1300,y:0}]};
  const e=execution(doc,provider([{patches:[{...doc.artboards[1].nodes[0],text:'Oops'}]}]),{run:{...run,instruction:'Change title',selection:['home_title']}});
  await assert.rejects(executeCanvasGeneration(e.args),/canvas_edit_target_not_authorized/);
  assert.equal(e.saved.length,0);
});
test('unsafe geometry and actions are rejected',()=>{
  assert.throws(()=>validateGeneratedArtboard({...board('home'),nodes:[{...board('home').nodes[0],width:NaN}]},{id:'home'}),/geometry/);
  assert.throws(()=>validateGeneratedArtboard({...board('home'),nodes:[{...board('home').nodes[0],action:{type:'navigate',target:'javascript:alert(1)'}}]},{id:'home'}),/action/);
});
test('invalid direction count is an error with no fixture substitute',async()=>{
  await assert.rejects(prepareCanvasDirections({env:{},user:{id:'u'},document:empty(),context:run,runtime:provider([{directions:directions.slice(0,3)}])}),/four_directions/);
});

test('private skill mentions resolve only the verified account and expose genuine receipts',async()=>{
  let bound;
  const env={DB:{prepare:sql=>{
    assert.match(sql,/account_id=\?/);
    return {bind:(...args)=>{bound=args;return {all:async()=>({results:[{id:'skill_private',name:'Private guidance',
      content_markdown:'Use a concise and accessible project description.',content_checksum:'f'.repeat(64),version:2}]})};}};
  }}};
  const e=execution(empty(),provider([plan,{artboard:board('home')},{artboard:board('about')}]),{
    env,run:{...run,instruction:'[skill:skill_private] Apply this guidance'},
  });
  await executeCanvasGeneration(e.args);
  assert.deepEqual(bound,['user-a','skill_private']);
  assert.equal(e.events.find(e=>e.payload.id==='skill_private').payload.source,'private_skill_catalog');
});
test('private skill lookup failure does not silently continue',async()=>{
  const e=execution(empty(),provider([]),{run:{...run,instruction:'[skill:skill_private] Help'}});
  await assert.rejects(executeCanvasGeneration(e.args),/private_skill_storage_unavailable/);
  assert.equal(e.saved.length,0);
});
test('unverified backend claims and model endpoint bindings are rejected',async()=>{
  const requested={...plan,dataRequirements:[{id:'contacts',description:'Save contacts',status:'available'}]};
  const e=execution(empty(),provider([requested,{artboard:board('home')},{artboard:board('about')}]));
  const result=await executeCanvasGeneration(e.args);
  assert.equal(result.unavailable[0].status,'unavailable');
  assert.throws(()=>validateGeneratedArtboard({...board('home'),nodes:[{
    ...board('home').nodes[0],binding:{endpoint:'/api/admin/delete'},
  }]},{id:'home'}),/binding_requires_authorized_adapter/);
});
