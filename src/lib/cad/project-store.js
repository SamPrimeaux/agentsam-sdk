import fs from 'node:fs';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {requireValidProject} from './project-contract.js';
export const projectHash=p=>createHash('sha256').update(JSON.stringify(p)).digest('hex');
// Immutable revision files plus one atomically replaced pointer. Single host; no distributed claims.
export class FileProjectStore {
 constructor(root){this.root=path.resolve(root);}
 dir(id){if(!/^[A-Za-z0-9_-]{1,100}$/.test(id))throw new Error('invalid_project_id');return path.join(this.root,id);}
 async read(id,revision){const d=this.dir(id);let r=revision;if(r==null)r=JSON.parse(fs.readFileSync(path.join(d,'head.json'),'utf8')).revision;if(!Number.isSafeInteger(r)||r<1)throw new Error('invalid_revision');return JSON.parse(fs.readFileSync(path.join(d,r+'.json'),'utf8'));}
 async save(project,expectedRevision,message='Saved project'){
  requireValidProject(project);if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0)throw new Error('expected_revision_required');
  const d=this.dir(project.id);fs.mkdirSync(d,{recursive:true});const lock=path.join(d,'write.lock');
  let fd;try{fd=fs.openSync(lock,'wx');}catch{throw new Error('project_busy');}
  try{
   let revision=0;try{revision=(await this.read(project.id)).revision;}catch(e){if(e.code!=='ENOENT')throw e;}
   if(revision!==expectedRevision)throw new Error('revision_conflict');
   const next={...structuredClone(project),version:revision+1,updatedAt:Date.now()};
   const row={project:next,revision:revision+1,content_hash:projectHash(next),message,created_at:Math.floor(Date.now()/1000)};
   fs.writeFileSync(path.join(d,row.revision+'.json'),JSON.stringify(row),{flag:'wx'});
   const tmp=path.join(d,randomUUID()+'.tmp');fs.writeFileSync(tmp,JSON.stringify({revision:row.revision}));fs.renameSync(tmp,path.join(d,'head.json'));return row;
  }finally{fs.closeSync(fd);fs.unlinkSync(lock);}
 }
 async restore(id,revision,expectedRevision){const past=await this.read(id,revision);return this.save(past.project,expectedRevision,'Restored revision '+revision);}
}
