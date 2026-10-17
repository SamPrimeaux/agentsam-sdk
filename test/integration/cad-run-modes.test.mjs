import assert from 'node:assert/strict';
import {describe,it} from 'node:test';
import {AgentSamClient} from '../../src/sam/client.js';
import {createSamOS} from '../../src/sam/os.js';
import {executeCadRunMode,CAD_RUN_MODES} from '../../src/sam/packs/cad/modes.js';

function host({approve=true,scope=true}={}) {
 const calls=[],actor={actorId:'editor',accountId:'acct',tenantId:'tenant'};
 const sam=new AgentSamClient({autoSeed:false,os:createSamOS({core:false,cad:{
   resolveTrustedContext:async()=>actor,
   authorize:async ({projectId})=>scope&&projectId!=='other',
   requestApproval:async ()=>approve,
   projectTools:{execute:async (name,args)=>{calls.push({name,args});return {tool:name,revision:args.expected_revision??4,artifact_url:name==='design_model_export'?'https://example.test/real.glb':undefined}}},
 }})});
 return {sam,calls,authorizeMode:async()=>true};
}
describe('Real typed CAD run modes',()=>{
 it('resolves inspect to an actual project read and returns a SAM receipt',async()=>{
   const env=host(),out=await executeCadRunMode({mode:'cad.inspect',input:{project_id:'villa',revision:4}},env);
   assert.equal(out.operation,'cad.project.get');
   assert.equal(env.calls[0].name,'design_project_get');
   assert.equal(env.calls[0].args.project_id,'villa');
   assert.equal(out.result.ok,true);
 });
 it('runs create, edit, export through existing authority and revision gates',async()=>{
   const env=host();
   const create=await executeCadRunMode({mode:'cad.create',input:{project:{id:'villa',schemaVersion:1,pages:[]},expected_revision:0}},env);
   const edit=await executeCadRunMode({mode:'cad.edit',input:{project_id:'villa',expected_revision:4,operation:{type:'add_wall',x:1}}},env);
   const exportResult=await executeCadRunMode({mode:'cad.export',input:{project_id:'villa',revision:5,format:'glb'}},env);
   assert.deepEqual([create.operation,edit.operation,exportResult.operation],['cad.project.save','cad.project.apply','cad.model.export']);
   assert.deepEqual(env.calls.map(x=>x.name),['design_project_save','design_apply_operation','design_model_export']);
 });
 it('submits real runner generation intent only through available capability',async()=>{
   const env=host();
   await assert.rejects(executeCadRunMode({mode:'cad.generate',input:{project_id:'villa',workspace_id:'w1',engine:'freecad',prompt:'Build a room'}},env),/cad_run_operation_failed|operation_unavailable|not_found|capability|unknown|cad_job/i);
 });
 it('rejects missing mode, fake authority, unstructured writes, and rejected approval',async()=>{
   const env=host();
   await assert.rejects(executeCadRunMode({mode:'cad.edit',input:{project_id:'villa',operation:{type:'add_wall'}}},env),/revision_required/);
   await assert.rejects(executeCadRunMode({mode:'cad.create',input:{project_id:'villa'}},env),/document_and_revision_required/);
   await assert.rejects(executeCadRunMode({mode:'cad.inspect',input:{project_id:'villa'}},{sam:env.sam}),/authorization_required/);
   await assert.rejects(executeCadRunMode({mode:'cad.inspect',input:{project_id:'villa'}},{...env,authorizeMode:async()=>false}),/denied/);
   await assert.rejects(executeCadRunMode({mode:'cad.inspect',input:{project_id:'other'}},env),/cad_run_operation_failed|denied|unauthoriz|scope/i);
   await assert.rejects(executeCadRunMode({mode:'cad.edit',input:{project_id:'villa',expected_revision:4,operation:{type:'add_wall'}}},host({approve:false})),/cad_run_operation_failed|approval|denied/i);
   await assert.rejects(executeCadRunMode({mode:'madeup',input:{}},env),/unknown_mode/);
 });
 it('keeps registered mode mapping immutable',()=>{assert.equal(Object.isFrozen(CAD_RUN_MODES),true);assert.equal(CAD_RUN_MODES['cad.export'].operation,'cad.model.export')});
});
