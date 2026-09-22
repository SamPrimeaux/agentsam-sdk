import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {localProjectRuntime} from '../src/lib/cad/project-cli.js';
test('packaged app API shares CLI revisions, emits events and rejects stale writes',{skip:process.env.AGENTSAM_TEST_CAD_APP!=='1'},async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'cad-app-proof-')),port=31987;
 const app=new URL('../apps/cad-creator/backend/',import.meta.url);
 const child=spawn(process.execPath,['dist/server.mjs'],{cwd:app,env:{...process.env,NODE_ENV:'production',PORT:String(port),HOST:'127.0.0.1',AGENTSAM_CAD_PROJECT_ROOT:root},stdio:['ignore','pipe','pipe']});
 let log='';child.stdout.on('data',d=>log+=d);child.stderr.on('data',d=>log+=d);
 t.after(()=>{child.kill();fs.rmSync(root,{recursive:true,force:true});});
 const base='http://127.0.0.1:'+port;
 let ready=false;
 for(let i=0;i<80;i++){try{const r=await fetch(base);if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}
 assert.ok(ready,log);
 async function call(name,input){const res=await fetch(base+'/api/cad/project/tools/'+name,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)});return {status:res.status,body:await res.json()};}
 const project=JSON.parse(fs.readFileSync(new URL('./fixtures/cad/courtyard-house.json',import.meta.url),'utf8'));
 const saved=await call('design_project_save',{project,expected_revision:0});assert.equal(saved.status,200);
 const runtime=localProjectRuntime(root);assert.equal((await runtime.execute('design_project_get',{project_id:project.id})).content_hash,saved.body.result.content_hash);
 const abort=new AbortController();t.after(()=>abort.abort());
 const events=await fetch(base+'/api/cad/project/events',{signal:abort.signal});const reader=events.body.getReader();
 const edited=await runtime.execute('design_apply_operation',{project_id:project.id,expected_revision:1,operation:{type:'update_wall',wallId:'wall-0',updates:{height3D:132}}});
 const event=await Promise.race([reader.read(),new Promise((_,reject)=>setTimeout(()=>reject(new Error('event timeout')),5000))]);
 assert.match(new TextDecoder().decode(event.value),/"revision":2/);
 const reopened=await call('design_project_get',{project_id:project.id,expected_content_hash:edited.content_hash});assert.equal(reopened.body.result.revision,2);
 assert.equal((await call('design_project_save',{project,expected_revision:1})).status,409);
 const denied=await fetch(base+'/api/cad/project/tools/design_project_get',{method:'POST',headers:{'content-type':'application/json',origin:'https://other.example'},body:JSON.stringify({project_id:project.id})});assert.equal(denied.status,403);
 abort.abort();
});
