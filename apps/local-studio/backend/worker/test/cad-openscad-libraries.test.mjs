import test from 'node:test';
import assert from 'node:assert/strict';
import {handleOpenScadLibraries,normalizeLibrary} from '../cad-openscad-libraries.js';

const sample={slug:'bosl2',display_name:'BOSL2',import_line:'include <BOSL2/std.scad>',
  capability_tags:'["rounding","threading"]',license:'BSD-2-Clause',commercial_safe:1,
  priority:1,repo_url:'https://github.com/BelfrySCAD/BOSL2',notes:'Library',active:1,updated_at:10};
function fake(superadmin=1){
 return {DB:{prepare(sql){return {bind(...args){return {first:async()=>sql.includes('auth_users')?{is_superadmin:superadmin}:sample,
 run:async()=>({meta:{changes:1}})}},all:async()=>({results:[sample]})}}}};
}
test('live D1 catalog reports registered, never automatically installed',async()=>{
 const response=await handleOpenScadLibraries(new Request('https://example.com/api/agentsam/openscad-libraries?q=rounding'),fake(),{id:'au'});
 assert.equal(response.status,200);
 const result=await response.json();
 assert.equal(result.source,'cloudflare-d1');
 assert.equal(result.libraries.length,1);
 assert.equal(result.libraries[0].availability,'registered-only');
 assert.deepEqual(result.libraries[0].capability_tags,['rounding','threading']);
});
test('catalog changes require superadmin and same-origin writes',async()=>{
 const body=JSON.stringify({...sample,capability_tags:['rounding']});
 const request=new Request('https://example.com/api/agentsam/openscad-libraries',{method:'POST',body});
 assert.equal((await handleOpenScadLibraries(request,fake(0),{id:'au'})).status,403);
 const cross=new Request('https://example.com/api/agentsam/openscad-libraries',{method:'POST',headers:{Origin:'https://evil.example'},body});
 assert.equal((await handleOpenScadLibraries(cross,fake(),{id:'au'})).status,403);
});
test('registry validation rejects path traversal and invalid capability tags',()=>{
 assert.throws(()=>normalizeLibrary({...Object.fromEntries(Object.entries(sample).filter(([k])=>k!=='updated_at')),import_line:'use <../../secret.scad>'}),/import_line_invalid/);
 assert.throws(()=>normalizeLibrary({...Object.fromEntries(Object.entries(sample).filter(([k])=>k!=='updated_at')),capability_tags:['!bad']}),/capability_tags_invalid/);
 assert.equal(normalizeLibrary(Object.fromEntries(Object.entries(sample).filter(([k])=>k!=='updated_at'))).commercial_safe,1);
});
test('patch must supply concurrency token',async()=>{
 const res=await handleOpenScadLibraries(new Request('https://example.com/api/agentsam/openscad-libraries/bosl2',{method:'PATCH',body:'{}'}),fake(),{id:'au'});
 assert.equal(res.status,400);
 assert.equal((await res.json()).error,'expected_updated_at_required');
});

test('superadmin can create, revise and deactivate a registry record with revision checks',async()=>{
 const writes=[],state={...sample,active:1,updated_at:10};
 const env={DB:{prepare(sql){
  return {
   bind(...args){
    return {
     first:async()=>sql.includes('auth_users')?{is_superadmin:1}:{...state},
     run:async()=>{
      writes.push({sql,args});
      if(sql.startsWith('UPDATE')){state.active=args[8];state.updated_at+=1}
      return {meta:{changes:1}};
     },
    };
   },
   all:async()=>({results:[state]}),
  };
 }}};
 const base='https://example.com/api/agentsam/openscad-libraries';
 const payload={slug:'new-library',display_name:'Test Library',import_line:'use <Test/test.scad>',
   capability_tags:['shapes'],license:'MIT',commercial_safe:1,priority:4,repo_url:null,notes:'Test',active:1};
 const add=await handleOpenScadLibraries(new Request(base,{method:'POST',body:JSON.stringify(payload)}),env,{id:'au_admin'});
 assert.equal(add.status,201);
 const patch=await handleOpenScadLibraries(new Request(base+'/bosl2',{method:'PATCH',body:JSON.stringify({display_name:'Renamed',expected_updated_at:10})}),env,{id:'au_admin'});
 assert.equal(patch.status,200);
 assert.equal(writes.filter(w=>w.sql.startsWith('UPDATE')).length,1);
 const conflict=await handleOpenScadLibraries(new Request(base+'/bosl2',{method:'PATCH',body:JSON.stringify({display_name:'Stale',expected_updated_at:10})}),env,{id:'au_admin'});
 assert.equal(conflict.status,409);
 const remove=await handleOpenScadLibraries(new Request(base+'/bosl2',{method:'DELETE',body:JSON.stringify({expected_updated_at:11})}),env,{id:'au_admin'});
 assert.equal(remove.status,200);
 assert.equal(state.active,0);
});
