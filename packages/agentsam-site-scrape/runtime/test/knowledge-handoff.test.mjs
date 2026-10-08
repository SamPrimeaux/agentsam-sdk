import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createSiteIndex} from '../index.mjs';
import {siteKnowledgeSources,loadVerifiedSiteIndex} from '../knowledge.mjs';
import {createLocalArchive} from '../node-storage.mjs';
import {defaultConfig,openSqliteStore,planIndex,runIndex,retrieve} from '../../../../src/knowledge/index.js';

const pages=[{url:'https://example.com/about',title:'Example Company',
  content:[{kind:'h1',text:'Contoso greenhouse irrigation'},{kind:'p',text:'Sustainable low-water greenhouse systems.'}],
  links:[],images:[],meta:{description:'Modern greenhouse technology'}}];

test('site graph feeds existing Knowledge planner/indexer/retrieval, not a second RAG pipeline',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'agentsam-site-knowledge-'));
 const config=defaultConfig({include:['sites'],scope:'site-knowledge-fixture'});
 config.embedding={provider:'fixture',model:'vectors-test',revision:'1',dimensions:3,parameters:{}};
 const store=await openSqliteStore(path.join(root,'knowledge.sqlite'));
 try {
   const graph=createSiteIndex(pages);
   const sources=siteKnowledgeSources(graph,config.scope);
   assert.equal(sources.size,1);
   const name=[...sources.keys()][0];assert.match(name,/^sites\/[a-f0-9]{32}\.md$/);
   const plan=await planIndex({root,config,store,siteCrawl:graph,embed:true});
   assert.equal(plan.receipt.files,1);assert.ok(plan.receipt.chunks>=1);
   assert.equal(plan.receipt.site_crawl_snapshot,graph.content_hash);
   let calls=0;
   const embedder={async embed(){calls++;return [1,0.5,0.3];}};
   const indexed=await runIndex({root,config,store,siteCrawl:graph,embed:true,embedder});
   assert.equal(indexed.published,true);assert.equal(calls,plan.receipt.embedding_inputs);
   const unchanged=await runIndex({root,config,store,siteCrawl:graph,embed:true,embedder});
   assert.equal(unchanged.published,false);
   const result=await retrieve({store,config,text:'greenhouse irrigation',semantic:false,topK:2});
   const hits=result.hits||result.results||result.context?.hits||[];
   assert.ok(hits.length>=1,'the Knowledge store must retrieve a page chunk');
   assert.equal(hits[0].source_authority,'site-crawl-evidence');
   assert.equal(hits[0].metadata.url,'https://example.com/about');
   assert.match(hits[0].content,/greenhouse/);
   assert.throws(()=>siteKnowledgeSources({...graph,resources:[...graph.resources,{...graph.resources[0],title:'tampered'}]}),/hash mismatch/);
 }finally{await store.close();fs.rmSync(root,{recursive:true,force:true});}
});

test('site evidence and repository evidence cannot quietly merge authority scopes',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'agentsam-site-knowledge-scope-'));
 try {
   const graph=createSiteIndex(pages);
   const config=defaultConfig({include:['sites']});
   await assert.rejects(planIndex({root,config,siteCrawl:graph,repositoryCrawl:{schema:'agentsam.repository.crawl.v1'}}),/distinct source authorities/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
