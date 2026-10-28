import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {Express,Request} from 'express';

const IMPORT=/^(include|use) <([A-Za-z0-9_./-]+\.scad)>$/;
export function openScadSearchRoots():string[]{
 const home=os.homedir();
 return [
   path.join(home,'Documents/OpenSCAD/libraries'),
   path.join(home,'Library/Application Support/OpenSCAD/libraries'),
   '/Applications/OpenSCAD.app/Contents/Resources/libraries',
   '/opt/homebrew/share/openscad/libraries','/usr/local/share/openscad/libraries',
   ...(process.env.OPENSCADPATH||'').split(path.delimiter).filter(Boolean),
   ...(process.env.AGENTSAM_CAD_OPENSCAD_LIBRARY_ROOTS||'').split(path.delimiter).filter(Boolean),
 ].filter((s,i,a)=>a.indexOf(s)===i);
}
/** Presence check only. Does not claim an OpenSCAD native compilation passed. */
export function probeOpenScadImport(importLine:string,roots:string[]=openScadSearchRoots()):boolean{
 const match=IMPORT.exec(importLine);
 if(!match||match[2].includes('..')||match[2].startsWith('/'))return false;
 for(const root of roots){
  try{
   const realRoot=fs.realpathSync(root);
   const target=path.join(realRoot,match[2]);
   if(!fs.statSync(target).isFile())continue;
   const actual=fs.realpathSync(target);
   if(actual.startsWith(realRoot+path.sep))return true;
  }catch{/* not installed in this search root */}
 }
 return false;
}
function local(req:Request){
 try{return ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress||'')
    &&['localhost','127.0.0.1','[::1]'].includes(new URL('http://'+req.headers.host).hostname)}
 catch{return false}
}
export function installOpenScadLibraryProbeRoutes(app:Express){
 app.post('/api/cad/openscad/libraries/probe',(req,res)=>{
  if(!local(req))return res.status(403).json({ok:false,error:'local_design_host_only'});
  if(req.headers.origin&&req.headers.origin!==req.protocol+'://'+req.headers.host)
    return res.status(403).json({ok:false,error:'origin_mismatch'});
  const imports=req.body?.imports;
  if(!Array.isArray(imports)||imports.length>80||imports.some(x=>typeof x!=='string'||x.length>240))
    return res.status(400).json({ok:false,error:'invalid_imports'});
  return res.json({ok:true,contract:'agentsam.openscad-library-probe.v1',source:'local-filesystem',
    results:imports.map(import_line=>({import_line,sourcePresent:probeOpenScadImport(import_line)}))});
 });
}
