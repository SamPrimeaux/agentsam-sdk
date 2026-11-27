import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {identifyCadFileFormat,isCadAutoDiscoveryCandidate,cadFormatCandidates} from '@inneranimalmedia/agentsam-contracts/source-types/cad';
import {createAgentSourceKindReference} from '@inneranimalmedia/agentsam-contracts/source-types/registry';
import type {AgentSourceFormatReference,AgentSourceKindReference} from '@inneranimalmedia/agentsam-contracts/source-types';

export type CadSource = {
  id:string; project:string; revision:string; relativePath:string;
  format:string; role:'native-bim'|'parametric'|'presentation'|'exchange'|'verification';
  status:'source-only'|'review-only'|'verification-only';
  bytes:number; sha256:string;
  /** Filesystem provenance and filename-based format identity; neither implies an importer. */
  sourceKindRef?:AgentSourceKindReference;
  formatRef?:AgentSourceFormatReference;
  /** Other canonical candidates when extension alone cannot resolve identity. */
  formatCandidates?:AgentSourceFormatReference[];
};
const RECEIPT=/((model-exchange|exchange-receipt|glb-review-receipt|geometry-verification|bim-assembly-receipt|render-manifest)\.json)$/i;
// Avoid blocking the local CAD server on every library refresh for unchanged GLBs/Blend files.
const digestCache=new Map<string,{size:number;mtimeMs:number;sha256:string}>();
// Stream disk reads in bounded chunks. IFC archives, footage and scans may be
// gigabytes; buffering entire files to hash them exhausts memory.
function sha256File(filename:string):string {
  const digest=createHash('sha256');
  const fd=fs.openSync(filename,'r');
  const buffer=Buffer.allocUnsafe(1024*1024);
  try {
    let count:number;
    while((count=fs.readSync(fd,buffer,0,buffer.length,null))>0)
      digest.update(buffer.subarray(0,count));
  }finally{fs.closeSync(fd)}
  return digest.digest('hex');
}
const revisionFrom=(s:string):string=>{
  const match=s.match(/(?:^|[\\/])v(1(?:[.-][0-9]+)?)(?:[\\/]|$)/i)
    ||s.match(/DreamHouse-V(1(?:[.-][0-9]+)?)/i);
  return match ? 'V'+match[1].replace('-', '.') : 'unversioned';
};

/** Local-only source inventory. No import or promotion is implied by discovery. */
export function ownerCadRoots(): Array<{project:string;root:string}> {
  const home=os.homedir();
  const configured=(process.env.AGENTSAM_CAD_SOURCE_ROOTS||'').split(path.delimiter).filter(Boolean);
  const roots=configured.length?configured:[
    path.join(home,'dreamhouse'),
    path.join(home,'agentsam-3d-studio'),
    path.join(home,'agentsam-cad-machinery'),
  ];
  return roots.map(root=>({
    project:path.basename(root).toLowerCase()==='dreamhouse'?'DreamHouse':path.basename(root),
    root:path.resolve(root),
  }));
}

export function discoverCadSources(roots:Array<{project:string;root:string}>,maxFiles=256):CadSource[]{
  const result:CadSource[]=[];
  for(const configured of roots){
    const root=path.resolve(configured.root);
    if(!fs.existsSync(root)||!fs.statSync(root).isDirectory())continue;
    const walk=(dir:string,depth:number)=>{
      if(depth>6||result.length>=maxFiles)return;
      for(const entry of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
        if(result.length>=maxFiles)return;
        if(entry.name.startsWith('.')||entry.name==='node_modules'||entry.name==='target')continue;
        const full=path.join(dir,entry.name);
        if(entry.isSymbolicLink())continue;
        if(entry.isDirectory()){walk(full,depth+1);continue;}
        if(!entry.isFile())continue;
        const receipt=RECEIPT.test(entry.name);
        const detected=identifyCadFileFormat(entry.name);
        // Generic JSON sidecars vastly outnumber CAD sources. Named receipts and
        // native .iamscene.json documents remain discoverable.
        if(!detected || !isCadAutoDiscoveryCandidate(detected.id,entry.name)
          || (detected.id==='data.json'&&!receipt))continue;
        const stat=fs.statSync(full);
        if(stat.size===0)continue;
        const relativePath=path.relative(root,full).replaceAll(path.sep,'/');
        const role:CadSource['role']=receipt
          ? (entry.name.includes('exchange')?'exchange':'verification')
          : detected.role;
        const status=role==='verification'?'verification-only'
          :role==='presentation'?'review-only':'source-only';
        const cached=digestCache.get(full);
        let sha256=cached?.size===stat.size&&cached.mtimeMs===stat.mtimeMs?cached.sha256:'';
        if(!sha256){
          try{sha256=sha256File(full);}
          catch{continue;} // source changed during scan; retry next request
          digestCache.set(full,{size:stat.size,mtimeMs:stat.mtimeMs,sha256});
        }
        result.push({
          id:createHash('sha256').update(configured.project+'\n'+relativePath).digest('hex').slice(0,20),
          project:configured.project,revision:revisionFrom(relativePath),
          relativePath,format:receipt?'JSON':detected.extension.replace(/^\./,'').replace(/\.json$/,'').toUpperCase(),
          sourceKindRef:createAgentSourceKindReference('filesystem.file'),
          formatRef:{catalog:'agentsam.source-types.v2',id:detected.id,extension:detected.extension},
          ...(cadFormatCandidates(entry.name).length>1 ? {formatCandidates:cadFormatCandidates(entry.name)} : {}),
          role,status,bytes:stat.size,sha256,
        });
      }
    };
    walk(root,0);
  }
  return result;
}
