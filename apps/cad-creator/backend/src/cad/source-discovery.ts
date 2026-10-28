import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';

export type CadSource = {
  id:string; project:string; revision:string; relativePath:string;
  format:string; role:'native-bim'|'parametric'|'presentation'|'exchange'|'verification';
  status:'source-only'|'review-only'|'verification-only';
  bytes:number; sha256:string;
};
const EXTENSIONS=new Set(['.fcstd','.ifc','.blend','.glb','.gltf','.step','.stp','.scad','.dxf','.dwg']);
const RECEIPT=/((model-exchange|exchange-receipt|glb-review-receipt|geometry-verification|bim-assembly-receipt|render-manifest)\.json)$/i;
// Avoid blocking the local CAD server on every library refresh for unchanged GLBs/Blend files.
const digestCache=new Map<string,{size:number;mtimeMs:number;sha256:string}>();
const ROLE:Record<string,CadSource['role']>={
  '.fcstd':'native-bim','.ifc':'native-bim','.scad':'parametric','.step':'native-bim',
  '.stp':'native-bim','.blend':'presentation','.glb':'presentation','.gltf':'presentation',
  '.dxf':'exchange','.dwg':'exchange',
};
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
        const ext=path.extname(entry.name).toLowerCase();
        const receipt=RECEIPT.test(entry.name);
        const sceneImage= configured.project==='DreamHouse' &&
          /(^|\/)presentation\/renders\//.test(path.relative(root,full).replaceAll(path.sep,'/')) &&
          ['.png','.jpg','.jpeg','.webp'].includes(ext);
        if(!EXTENSIONS.has(ext)&&!receipt&&!sceneImage)continue;
        const stat=fs.statSync(full);
        if(stat.size===0)continue;
        const relativePath=path.relative(root,full).replaceAll(path.sep,'/');
        const role=sceneImage?'presentation':receipt?(entry.name.includes('exchange')?'exchange':'verification'):(ROLE[ext]||'exchange');
        const status=role==='native-bim'||role==='parametric'?'source-only':role==='presentation'?'review-only':'verification-only';
        const cached=digestCache.get(full);
        let sha256=cached?.size===stat.size&&cached.mtimeMs===stat.mtimeMs?cached.sha256:'';
        if(!sha256){
          try{sha256=createHash('sha256').update(fs.readFileSync(full)).digest('hex');}
          catch{continue;} // source changed during scan; retry next request
          digestCache.set(full,{size:stat.size,mtimeMs:stat.mtimeMs,sha256});
        }
        result.push({
          id:createHash('sha256').update(configured.project+'\n'+relativePath).digest('hex').slice(0,20),
          project:configured.project,revision:revisionFrom(relativePath),
          relativePath,format:receipt?'JSON':ext.slice(1).toUpperCase(),role,status,bytes:stat.size,sha256,
        });
      }
    };
    walk(root,0);
  }
  return result;
}
