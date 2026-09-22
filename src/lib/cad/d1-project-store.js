import {randomUUID} from 'node:crypto';
import {requireValidProject} from './project-contract.js';
import {projectHash} from './project-store.js';
// Reuses blueprint documents + immutable R2 scene snapshots. No new tables.
// scope is supplied by the authenticated host, never by tool arguments.
export class D1ProjectStore {
 constructor({db,objects,bucket,scope}) {
  if(!scope?.account_id||!scope?.workspace_id||!scope?.tenant_id||!bucket)throw new Error('authenticated_design_scope_required');
  this.db=db;this.objects=objects;this.bucket=bucket;this.scope=scope;
 }
 async read(id,revision){
  const s=this.scope;
  const row=await this.db.prepare("SELECT * FROM designstudio_design_blueprints WHERE id=? AND tenant_id=? AND workspace_id=? AND json_extract(intent_json,'$.account_id')=?").bind(id,s.tenant_id,s.workspace_id,s.account_id).first();
  if(!row)throw new Error('project_not_found');
  const current=JSON.parse(row.generation_config_json||'{}').project_revision;
  if(revision==null||revision===current){const p=JSON.parse(row.sketch_json);return {project:p,revision:current,content_hash:projectHash(p)};}
  const snapshot=await this.db.prepare("SELECT r2_key FROM scene_snapshots WHERE project_id=? AND user_id=? AND workspace_id=? AND tenant_id=? AND version=? AND project_type='CAD_PROJECT'").bind(id,s.account_id,s.workspace_id,s.tenant_id,revision).first();
  if(!snapshot)throw new Error('revision_not_found');
  const object=await this.objects.get(snapshot.r2_key);if(!object)throw new Error('revision_object_missing');
  const saved=JSON.parse(await object.text());requireValidProject(saved.project);if(saved.content_hash!==projectHash(saved.project))throw new Error('revision_digest_mismatch');return saved;
 }
 async save(project,expectedRevision,message='Saved project'){
  requireValidProject(project);
  if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0)throw new Error('expected_revision_required');
  const s=this.scope,revision=expectedRevision+1,now=Math.floor(Date.now()/1000),id='scene_'+randomUUID().replaceAll('-','');
  const p={...structuredClone(project),version:revision,updatedAt:Date.now()};
  const saved={project:p,revision,content_hash:projectHash(p),message,created_at:now};
  const key='design-projects/'+encodeURIComponent(s.account_id)+'/'+encodeURIComponent(p.id)+'/'+revision+'/'+saved.content_hash+'.json';
  await this.objects.put(key,JSON.stringify(saved),{httpMetadata:{contentType:'application/json'}});
  const statements=[];
  if(expectedRevision===0){
   statements.push(this.db.prepare("INSERT INTO designstudio_design_blueprints (id,tenant_id,workspace_id,title,intent_json,sketch_json,generation_config_json,status) VALUES (?,?,?,?,?,?,?,'structured')").bind(p.id,s.tenant_id,s.workspace_id,p.name,JSON.stringify({account_id:s.account_id,contract:'cad.project.v1'}),JSON.stringify(p),JSON.stringify({project_revision:revision,content_hash:saved.content_hash})));
  }else{
   statements.push(this.db.prepare("UPDATE designstudio_design_blueprints SET title=?,sketch_json=?,generation_config_json=json_set(generation_config_json,'$.project_revision',?,'$.content_hash',?),updated_at=datetime('now') WHERE id=? AND tenant_id=? AND workspace_id=? AND json_extract(intent_json,'$.account_id')=? AND json_extract(generation_config_json,'$.project_revision')=?").bind(p.name,JSON.stringify(p),revision,saved.content_hash,p.id,s.tenant_id,s.workspace_id,s.account_id,expectedRevision));
  }
  // D1 batch is transactional; changes() guards the snapshot against a failed CAS.
  statements.push(this.db.prepare("INSERT INTO scene_snapshots (id,workspace_id,user_id,tenant_id,name,project_type,entity_count,r2_key,r2_bucket,project_id,version,description,created_at,updated_at) SELECT ?,?,?,?,?,'CAD_PROJECT',?,?,?,?,?,?,?,? WHERE changes()=1").bind(id,s.workspace_id,s.account_id,s.tenant_id,p.name,p.walls.length+p.rooms.length+p.doors.length+p.windows.length,key,this.bucket,p.id,revision,message,now,now));
  let results;try{results=await this.db.batch(statements);}catch(e){throw new Error('project_save_failed:'+e.message);}
  if(results[0]?.meta?.changes!==1)throw new Error('revision_conflict');
  return saved;
 }
 async restore(id,revision,expectedRevision){const row=await this.read(id,revision);return this.save(row.project,expectedRevision,'Restored revision '+revision);}
}
