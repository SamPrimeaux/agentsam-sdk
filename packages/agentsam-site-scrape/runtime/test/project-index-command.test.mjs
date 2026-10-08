import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {defaultConfig} from '../../../../src/knowledge/config.js';
import {createLocalArchive,verifyLocalArchive} from '../node-storage.mjs';
import {crawlSite} from '../core.mjs';
import {runNativeSiteScrape} from '../node-runner.mjs';
import {resolveProjectSeed,latestProjectArchive} from '../project-site.mjs';

async function tempProject(testContext) {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'agentsam-exact-site-index-'));
 testContext.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.mkdirSync(path.join(root,'.agentsam'));
 const config=defaultConfig({include:['src'],scope:'app'});
 config.embedding={provider:'fixture',model:'fixture-test',revision:'1',dimensions:3,parameters:{}};
 fs.writeFileSync(path.join(root,'.agentsam','knowledge.json'),JSON.stringify(config));
 return root;
}
function response(url,body,contentType='text/html'){
 return {url,status:200,body:Buffer.from(body),contentType};
}
async function archiveFixture(root) {
 const archive=createLocalArchive({projectRoot:root});
 const receipt=await crawlSite({url:'https://example.com/',maxPages:1,fetchPage:async(url)=>
  url.endsWith('/robots.txt')?response(url,'User-agent: *\nDisallow: /secret','text/plain'):
   response(url,'<html><head><title>Site</title></head><body><h1>Indexed project page</h1></body></html>'),
  onPage:archive.onPage});
 return archive.finalize(receipt);
}
async function command(args,cwd) {
 let stdout='',stderr='';
 const code=await runNativeSiteScrape(args,{cwd,stdout:{write:part=>stdout+=part},stderr:{write:part=>stderr+=part}});
 return {code,stdout,stderr,json:()=>JSON.parse(stdout)};
}

test('exact `agentsam site index` indexes the latest project archive, not a missing cwd manifest',async t=>{
 const root=await tempProject(t),staged=await archiveFixture(root);
 const result=await command(['index'],root);
 assert.equal(result.code,0,result.stderr);
 assert.equal(result.json().action,'site.index');
 assert.equal(result.json().run_id,staged.manifest.run_id);
 assert.equal(result.json().knowledge.published,true);
 const repeated=await command(['index'],root);
 assert.equal(repeated.code,0,repeated.stderr);
 assert.equal(repeated.json().knowledge.no_change,true);
});

test('exact `agentsam site index .` treats dot as the project and leaves source unchanged',async t=>{
 const root=await tempProject(t),staged=await archiveFixture(root);
 const result=await command(['index','.'],root);
 assert.equal(result.code,0,result.stderr);
 assert.equal(result.json().project_root,fs.realpathSync(root));
 assert.equal(result.json().run_id,staged.manifest.run_id);
 assert.equal(verifyLocalArchive(staged.root).run_id,staged.manifest.run_id);
});

test('bare site index without project evidence/site config gives actionable guidance instead of ENOENT',async t=>{
 const root=await tempProject(t);
 const none=await command(['index'],root);
 assert.equal(none.code,2);
 assert.match(none.stderr,/No crawl archive or project site URL/);
 assert.match(none.stderr,/site index https:\/\//);
 assert.doesNotMatch(none.stderr,/ENOENT|manifest.json/);
});

test('project Wrangler custom routes determine site seed without hardcoded FNF or ALLOWED_ORIGINS',async t=>{
 const root=await tempProject(t);
 fs.writeFileSync(path.join(root,'wrangler.toml'),`[vars]\nALLOWED_ORIGINS = 'https://api.example.net'\n[[routes]]\npattern = 'www.project-example.com'\ncustom_domain = true\n[[routes]]\npattern = 'project-example.com'\ncustom_domain = true\n`);
 assert.deepEqual(resolveProjectSeed(root),{url:'https://project-example.com/',source:'project-wrangler-custom-domain'});
 const project=path.join(root,'.agentsam','site-scrape.json');
 fs.writeFileSync(project,JSON.stringify({site:{url:'https://other-example.com/start'}}));
 assert.deepEqual(resolveProjectSeed(root),{url:'https://other-example.com/start',source:'project:.agentsam/site-scrape.json'});
 assert.equal(latestProjectArchive(root),null);
});

test('graph view is separately named and verified, index is not raw JSON export',async t=>{
 const root=await tempProject(t),archive=await archiveFixture(root);
 const graph=await command(['graph',archive.root],root);
 assert.equal(graph.code,0,graph.stderr);
 assert.equal(graph.json().schema,'agentsam.site.index.v1');
 const verified=await command(['verify',archive.root],root);
 assert.equal(verified.code,0,verified.stderr);
 assert.equal(verified.json().ok,true);
});
