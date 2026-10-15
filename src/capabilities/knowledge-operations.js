/** Existing knowledge engine, exposed with explicit runtime ownership and budgets. */
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG_PATH, readConfig, scopeKey } from '../knowledge/config.js';
import { openStore, runKnowledgeSearch } from '../commands/knowledge.js';
import { planIndex,runIndex } from '../knowledge/engine.js';
import { resolveContext, createContextBudget } from '../context/index.js';

function configFor(root){
 const file=path.join(root,CONFIG_PATH);
 if(!fs.existsSync(file))return null;
 return readConfig(root);
}

export function knowledgeStatus(root){
 const config=configFor(root);
 if(!config)return {available:false,reason:'knowledge_not_configured',next:'agentsam init . --yes'};
 if(config.storage.driver!=='sqlite') return {available:false,reason:'external_knowledge_host_adapter_required',driver:config.storage.driver,next:'Use the configured authorized host integration'};
 if(config.storage.driver==='sqlite'){
  const file=path.join(root,'.agentsam/knowledge/index.sqlite');
  if(!fs.existsSync(file))return {available:false,reason:'knowledge_index_missing',next:'agentsam index run',driver:'sqlite'};
 }
 return {available:true,driver:config.storage.driver,lane:config.lane?.backend??null,embedding_provider:config.embedding?.provider??null};
}

export async function knowledgeGenerationStatus(root){
 const base=knowledgeStatus(root);
 if(!base.available)return base;
 const config=configFor(root);
 if(config.storage.driver!=='sqlite')return {available:false,reason:'external_knowledge_host_adapter_required'};
 let store;
 try{
   store=await openStore(root,config,true);
   const state=await store?.scopeStatus(scopeKey(config));
   if(state?.active_id)return {...base,active:true,generation_id:state.active_id,scope_key:scopeKey(config)};
   return {...base,available:false,active:false,
     reason:state?.existing_generations?'knowledge_generation_scope_mismatch':'knowledge_generation_missing',
     existing_generations:state?.existing_generations||0,
     next:'Inspect agentsam index history and configuration before rebuilding; use agentsam index plan'};
 }catch(error){
   return {...base,available:false,reason:'knowledge_store_unreadable',detail:String(error.message||error).slice(0,180)};
 }finally{await store?.close();}
}

export async function knowledgeIndex(input={},root){
 const config=configFor(root);
 if(!config)return {ok:false,error:'knowledge_not_configured',next:'agentsam init . --yes'};
 if(input.embed===true)return {ok:false,error:'paid_embedding_requires_separate_explicit_workflow',next:'agentsam index run --embed'};
 // Existing local knowledge engine; no remote provider invocation or forced pipeline replacement.
 if(config.storage.driver!=='sqlite')return {ok:false,error:'external_index_requires_host_adapter',driver:config.storage.driver};
 const mode=input.mode||'plan';
 if(!['plan','run','status'].includes(mode))throw new Error('knowledge_index_mode_invalid');
 if(mode==='status')return knowledgeStatus(root);
 const indexExists=fs.existsSync(path.join(root,'.agentsam/knowledge/index.sqlite'));
 const store=(mode==='plan'&&!indexExists)?null:await openStore(root,config,mode!=='run');
 try{
  if(mode==='plan')return {ok:true,mode,receipt:(await planIndex({root,config,store,embed:false})).receipt};
  const maxInputs=Number(input.max_inputs??100),maxCharacters=Number(input.max_characters??200000);
  if(!Number.isInteger(maxInputs)||maxInputs<1||maxInputs>200||
     !Number.isInteger(maxCharacters)||maxCharacters<1||maxCharacters>1000000)
   throw new Error('knowledge_index_limits_invalid');
  return {ok:true,mode,receipt:await runIndex({root,config,store,embed:false,maxInputs,maxCharacters})};
 }finally{await store?.close();}
}

export function knowledgeSearch(input={},root){
 const query=String(input.query||'').trim();
 if(!query || query.length>2000)throw new Error('knowledge_query_invalid');
 const topK=Number(input.top_k??8),tokenBudget=Number(input.token_budget??4000);
 if(!Number.isInteger(topK)||topK<1||topK>30||!Number.isInteger(tokenBudget)||tokenBudget<128||tokenBudget>16000)
  throw new Error('knowledge_search_budget_invalid');
 return (async()=>{
    const status=await knowledgeGenerationStatus(root);
    if(!status.available)return {ok:false,error:status.reason,next:status.next||null,
      existing_generations:status.existing_generations||0,query,hit_count:0};
    return runKnowledgeSearch({cwd:root,query,topK,tokenBudget,semantic:false,generationId:input.generation_id||null});
  })();
}

export function contextResolve(input={}){
 const objective=String(input.objective||'').trim();
 const windowTokens=Number(input.window_tokens??32768);
 if(!Number.isInteger(windowTokens)||windowTokens<4096||windowTokens>1000000)throw new Error('context_window_invalid');
 const items=Array.isArray(input.items)?input.items:[];
 if(items.length>80)throw new Error('context_item_limit_exceeded');
 return resolveContext({objective,items,refs:input.refs||[],budget:createContextBudget({windowTokens})});
}
