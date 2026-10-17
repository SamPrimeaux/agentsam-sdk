#!/usr/bin/env node
/**
 * Resource CRUD audit: a resource has Create/List/Read/Update/Delete semantics.
 * Action-oriented operations (scan/execute/invoke) are not invented as CRUD.
 * Prints traceable gaps instead of pretending manifest existence = readiness.
 */
import fs from 'node:fs/promises';
import manifest from '../../protocol/capabilities/manifest.json' with { type:'json' };
const resources=new Map();
const verbs=['create','list','read','update','delete'];
function add(resource,verb,id){
  if(!resources.has(resource))resources.set(resource, Object.fromEntries(verbs.map(v=>[v,[]])));
  const v=resources.get(resource);
  if(v[verb])v[verb].push(id);
}
for(const item of Object.values(manifest.capabilities||{})){
  if(item.resource&&item.verb){
    const v=item.verb==='get'?'read':item.verb==='edit'?'update':item.verb;
    if(verbs.includes(v))add(item.resource,v,item.id);
  }
}
const patterns=[
 ['cloudflare-d1',{create:'agentsam_d1_create',list:'agentsam_cf_d1_list',read:'agentsam_d1_query',
   update:'agentsam_d1_write',delete:'agentsam_d1_delete'}],
];
for(const [resource,pairs] of patterns)
  for(const [verb,id] of Object.entries(pairs))
    if(manifest.capabilities[id]&&!resources.get(resource)?.[verb].includes(id))add(resource,verb,id);
const knownOwners={
 'cloudflare-d1':{
  'agentsam_d1_write':'database SQL mutation, NOT database metadata update',
  'agentsam_d1_delete':'SQL row deletion, NOT database resource deletion',
  'agentsam_d1_query':'SQL SELECT, NOT database resource get/describe',
 },
};
const report=[...resources].map(([resource,declared])=>{
  const ops=Object.fromEntries(verbs.map(v=>[v,(declared[v]||[]).map(id=>{
    const op=manifest.capabilities[id];
    return {id,status:op?.status||'unknown',declared:true,
      bound:false,verified:false,ownership_note:knownOwners[resource]?.[id]||null};
  })]));
  const misleading=Object.values(ops).flat().filter(x=>x.ownership_note);
  const missing=verbs.filter(v=>!ops[v].length||ops[v].every(x=>x.ownership_note));
  return {resource,missing,operations:ops,mixed_semantics:misleading.map(x=>x.id),
    note:'Manifest entries are declarations. Host binding and permissions must be separately verified.'};
});
const output={schema:'sam.crud.coverage.v1',resources:report,open_resource_gaps:report.filter(x=>x.missing.length).length};
const argv=process.argv.slice(2), out=argv.indexOf('--out');
const data=JSON.stringify(output,null,2)+'\n';
if(out>=0){if(!argv[out+1])throw Error('crud_out_path_required');await fs.writeFile(argv[out+1],data);}
process.stdout.write(data);
