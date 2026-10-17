import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createCapabilityAdapter} from '../../src/agent/capability-adapter.js';
import {workspaceList,workspaceSearch} from '../../src/capabilities/workspace-files.js';

function setup(t) {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'sam-safe-inspection-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.mkdirSync(path.join(root,'src'),{recursive:true});
 fs.mkdirSync(path.join(root,'.git'),{recursive:true});
 fs.mkdirSync(path.join(root,'.agentsam','data'),{recursive:true});
 fs.mkdirSync(path.join(root,'node_modules','package'),{recursive:true});
 fs.writeFileSync(path.join(root,'src','main.js'),'// SAM original\nconst marker = "inspect registered operations";\n');
 fs.writeFileSync(path.join(root,'src','readme.md'),'Systematic Autonomous Machinery');
 fs.writeFileSync(path.join(root,'.env'),'MODEL_SECRET=SAMPLE_NEVER_EXPOSE');
 fs.writeFileSync(path.join(root,'.git','config'),'SAMPLE_NEVER_EXPOSE');
 fs.writeFileSync(path.join(root,'.agentsam','data','token'),'SAMPLE_NEVER_EXPOSE');
 fs.writeFileSync(path.join(root,'node_modules','package','index.js'),'SAMPLE_NEVER_EXPOSE');
 try { fs.symlinkSync(os.tmpdir(),path.join(root,'src','escaped')); } catch {}
 return root;
}
test('bounded project listing includes sources but excludes secrets, dependency trees and symlinks',t=>{
 const root=setup(t);
 const list=workspaceList({depth:3,max_entries:50},root);
 assert.ok(list.entries.some(x=>x.path==='src/main.js'));
 assert.ok(!list.entries.some(x=>/\.env|\.git|\.agentsam|node_modules|escaped/.test(x.path)));
 assert.equal(list.truncated,false);
 assert.deepEqual(workspaceList({max_entries:1},root).entries.length,1);
 assert.equal(workspaceList({max_entries:1},root).truncated,true);
 assert.throws(()=>workspaceList({path:'../',depth:2},root),/workspace_path_outside_root/);
 assert.throws(()=>workspaceList({path:'.agentsam/data'},root),/workspace_protected_path/);
 assert.throws(()=>workspaceList({path:'src/escaped'},root),/workspace_symlink_not_allowed/);
});
test('search returns bounded real line evidence and cannot crawl hidden files',t=>{
 const root=setup(t);
 const result=workspaceSearch({query:'registered operations',depth:3},root);
 assert.deepEqual(result.matches.map(x=>[x.path,x.line]),[['src/main.js',2]]);
 assert.equal(result.matches[0].snippet.includes('registered operations'),true);
 assert.equal(workspaceSearch({query:'SAMPLE_NEVER_EXPOSE'},root).matches.length,0);
 assert.throws(()=>workspaceSearch({query:'a'},root),/workspace_search_query_invalid/);
 assert.throws(()=>workspaceSearch({query:'find',path:'../'},root),/workspace_path_outside_root/);
});
test('manifest declares both executable read-only operations with proper provider schemas',async t=>{
 const root=setup(t);
 const a=createCapabilityAdapter({projectRoot:root});
 const {compileToolSchema}=await import('../../src/providers/tool-schema.js');
 for(const id of ['workspace.list','workspace.search']){
   assert.equal(a.canInvoke(id),true);
   const tool=a.toolDescriptors().find(x=>x.name===id);
   assert.equal(tool.side_effects,'none');
   assert.ok(compileToolSchema({provider:'openai',name:id,canonicalSchema:tool.input_schema}).hash);
   const result=await a.invoke(id,id==='workspace.search'?{query:'registered operations'}:{depth:3});
   assert.equal(result.capability_id,id);
 }
});
