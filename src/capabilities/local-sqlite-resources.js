/**
 * Local SQLite lifecycle belongs to the current installation workspace.
 * Never substitutes for Cloudflare D1 and never reuses an operator's D1.
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createLocalSqliteDatabaseSync } from '../local/sqlite.js';

const VALID = /^[a-z][a-z0-9_-]{0,62}$/;
const fail = code => Object.assign(new Error(code),{code});
function location(workspaceRoot,name){
  if(typeof name!=='string'||!VALID.test(name))throw fail('sqlite_name_invalid');
  const root=fs.realpathSync(workspaceRoot);
  const dir=path.join(root,'.agentsam','databases');
  const archive=path.join(root,'.agentsam','archive','databases');
  return {root,dir,archive,name,filename:path.join(dir,name+'.sqlite')};
}
function validateAncestors(root,target){
  let p=target;
  while(p!==root){
    if(fs.existsSync(p)&&fs.lstatSync(p).isSymbolicLink())throw fail('sqlite_symlink_not_allowed');
    p=path.dirname(p);
  }
}
function checkInput(input,allowed){
  if(!input||typeof input!=='object'||Array.isArray(input))throw fail('sqlite_input_invalid');
  if(Object.keys(input).some(x=>!allowed.includes(x)))throw fail('sqlite_unknown_input');
}
export function createLocalDatabase(workspaceRoot,input={}){
  checkInput(input,['name']);
  const loc=location(workspaceRoot,input.name);
  validateAncestors(loc.root,loc.dir);
  if(fs.existsSync(loc.filename))throw fail('sqlite_already_exists');
  fs.mkdirSync(loc.dir,{recursive:true,mode:0o700});
  // File is exclusively created before sqlite opens it. Never overwrite.
  const fd=fs.openSync(loc.filename,'wx',0o600);
  fs.closeSync(fd);
  try {
    const db=createLocalSqliteDatabaseSync(loc.filename);
    try {db.exec('PRAGMA journal_mode=DELETE; PRAGMA user_version=1;');}
    finally{db.close();}
    return {schema:'agentsam.database.resource.v1',engine:'sqlite',scope:'current-workspace',
      name:loc.name,path:path.relative(loc.root,loc.filename),created:true};
  }catch(error){if(fs.existsSync(loc.filename))fs.unlinkSync(loc.filename);throw error;}
}
export function inspectLocalDatabase(workspaceRoot,input={}){
  checkInput(input,['name']);
  const loc=location(workspaceRoot,input.name);
  validateAncestors(loc.root,loc.filename);
  if(!fs.existsSync(loc.filename))throw fail('sqlite_not_found');
  const stat=fs.lstatSync(loc.filename);
  if(!stat.isFile()||stat.size>1024*1024*1024)throw fail('sqlite_resource_invalid');
  const db=createLocalSqliteDatabaseSync(loc.filename);
  try {
    const check=db.prepare('PRAGMA quick_check').get();
    const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(x=>x.name);
    return {schema:'agentsam.database.resource.v1',engine:'sqlite',scope:'current-workspace',
      name:loc.name,path:path.relative(loc.root,loc.filename),bytes:stat.size,mtime_ms:stat.mtimeMs,tables,
      integrity:Object.values(check||{})[0]};
  }finally{db.close();}
}
export function listLocalDatabases(workspaceRoot) {
  const root=fs.realpathSync(workspaceRoot);
  const dir=path.join(root,'.agentsam','databases');
  validateAncestors(root,dir);
  if(!fs.existsSync(dir))return {schema:'agentsam.database.list.v1',databases:[]};
  const names=fs.readdirSync(dir,{withFileTypes:true})
    .filter(x=>x.isFile()&&x.name.endsWith('.sqlite')&&VALID.test(x.name.slice(0,-7)))
    .map(x=>x.name.slice(0,-7)).sort();
  return {schema:'agentsam.database.list.v1',databases:names.map(name=>({name,engine:'sqlite',scope:'current-workspace'}))};
}
export function editLocalDatabase(workspaceRoot,input={}){
  checkInput(input,['name','new_name','expected_bytes','expected_mtime_ms']);
  const source=location(workspaceRoot,input.name);
  const target=location(workspaceRoot,input.new_name);
  if(source.name===target.name)throw fail('sqlite_name_unchanged');
  const state=inspectLocalDatabase(workspaceRoot,{name:source.name});
  if(!Number.isInteger(input.expected_bytes) ||
     input.expected_bytes!==state.bytes ||
     typeof input.expected_mtime_ms!=='number' ||
     input.expected_mtime_ms!==state.mtime_ms)
    throw fail('sqlite_resource_conflict');
  validateAncestors(source.root,target.filename);
  if(fs.existsSync(target.filename))throw fail('sqlite_already_exists');
  for(const suffix of ['-wal','-shm']){
    if(fs.existsSync(source.filename+suffix))throw fail('sqlite_active_wal_update_denied');
  }
  fs.renameSync(source.filename,target.filename);
  return {...inspectLocalDatabase(workspaceRoot,{name:target.name}),updated:true,previous_name:source.name};
}
export function deleteLocalDatabase(workspaceRoot,input={}) {
  checkInput(input,['name','confirm_name']);
  const loc=location(workspaceRoot,input.name);
  if(input.confirm_name!==loc.name)throw fail('sqlite_delete_confirmation_required');
  // integrity-check and ensure only the exact file is archived; do not remove WAL
  // data out from under a live writer.
  const state=inspectLocalDatabase(workspaceRoot,{name:loc.name});
  for(const suffix of ['-wal','-shm']){
    if(fs.existsSync(loc.filename+suffix))throw fail('sqlite_active_wal_archive_denied');
  }
  validateAncestors(loc.root,loc.archive);
  fs.mkdirSync(loc.archive,{recursive:true,mode:0o700});
  const archived=loc.name+'-'+randomUUID()+'.sqlite';
  const dest=path.join(loc.archive,archived);
  fs.renameSync(loc.filename,dest);
  return {schema:'agentsam.database.archive.v1',engine:'sqlite',name:loc.name,archived:true,
    restore_ref:path.relative(loc.root,dest),previous_bytes:state.bytes};
}
export function restoreLocalDatabase(workspaceRoot,input={}){
  checkInput(input,['name','restore_ref']);
  const loc=location(workspaceRoot,input.name);
  if(typeof input.restore_ref!=='string' || !input.restore_ref.startsWith('.agentsam/archive/databases/'+loc.name+'-')||
     !input.restore_ref.endsWith('.sqlite')||input.restore_ref.split('/').length!==4)
    throw fail('sqlite_restore_ref_invalid');
  const src=path.resolve(loc.root,input.restore_ref);
  validateAncestors(loc.root,src);
  if(!fs.existsSync(src))throw fail('sqlite_archive_not_found');
  if(fs.existsSync(loc.filename))throw fail('sqlite_already_exists');
  validateAncestors(loc.root,loc.dir);
  fs.mkdirSync(loc.dir,{recursive:true,mode:0o700});
  fs.renameSync(src,loc.filename);
  return inspectLocalDatabase(workspaceRoot,{name:loc.name});
}
