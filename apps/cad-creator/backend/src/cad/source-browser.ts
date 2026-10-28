import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import type {Express,Request} from 'express';
import {discoverCadSources,ownerCadRoots} from './source-discovery';

const ID=/^[a-f0-9]{20}$/;
function local(req:Request){
 try{return ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress||'')
   &&['localhost','127.0.0.1','[::1]'].includes(new URL('http://'+req.headers.host).hostname)}
 catch{return false}
}
export function nativeApplicationForFormat(format:string):string|null{
 const choices:Record<string,string>={FCSTD:'FreeCAD',IFC:'FreeCAD',STEP:'FreeCAD',STP:'FreeCAD',
   DXF:'FreeCAD',DWG:'FreeCAD',BLEND:'Blender',GLB:'Blender',GLTF:'Blender',SCAD:'OpenSCAD'};
 return choices[format.toUpperCase()]||null;
}
function resolveSource(id:string){
 if(!ID.test(id))return null;
 const roots=ownerCadRoots();
 const record=discoverCadSources(roots).find(source=>source.id===id);
 if(!record)return null;
 const root=roots.find(entry=>entry.project===record.project);
 if(!root)return null;
 const origin=fs.realpathSync(root.root);
 const absolute=fs.realpathSync(path.resolve(origin,record.relativePath));
 if(!absolute.startsWith(origin+path.sep)||!fs.statSync(absolute).isFile())return null;
 return {record,absolute};
}
export function installCadSourceBrowserRoutes(app:Express){
 const authorize=(req:Request,res:any)=>{
  if(!local(req)){res.status(403).json({ok:false,error:'local_cad_host_only'});return false}
  return true;
 };
 app.get('/api/cad/sources/:id/metadata',(req,res)=>{
  if(!authorize(req,res))return;
  const entry=resolveSource(req.params.id);
  return entry?res.json({ok:true,contract:'agentsam.cad.source-browser.v1',source:entry.record}):res.status(404).json({ok:false,error:'source_not_found'});
 });
 app.get('/api/cad/sources/:id/preview',(req,res)=>{
  if(!authorize(req,res))return;
  const entry=resolveSource(req.params.id);
  if(!entry)return res.sendStatus(404);
  if(!['GLB','PNG','JPG','JPEG','WEBP'].includes(entry.record.format))return res.status(415).json({ok:false,error:'preview_not_available'});
  const mime:Record<string,string>={GLB:'model/gltf-binary',PNG:'image/png',JPG:'image/jpeg',JPEG:'image/jpeg',WEBP:'image/webp'};
  res.setHeader('Content-Type',mime[entry.record.format]);
  res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');
  return res.sendFile(entry.absolute);
 });
 app.get('/api/cad/sources/:id/text',(req,res)=>{
  if(!authorize(req,res))return;
  const entry=resolveSource(req.params.id);
  if(!entry)return res.sendStatus(404);
  if(!['SCAD','JSON'].includes(entry.record.format))return res.status(415).json({ok:false,error:'text_preview_not_available'});
  if(entry.record.bytes>256000)return res.status(413).json({ok:false,error:'source_too_large_for_inline_preview'});
  res.setHeader('Content-Type',entry.record.format==='JSON'?'application/json; charset=utf-8':'text/plain; charset=utf-8');
  res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');
  return res.sendFile(entry.absolute);
 });
 app.get('/api/cad/sources/:id/download',(req,res)=>{
  if(!authorize(req,res))return;
  const entry=resolveSource(req.params.id);
  if(!entry)return res.sendStatus(404);
  res.setHeader('Cache-Control','private, no-store');
  return res.download(entry.absolute,path.basename(entry.absolute));
 });
 app.post('/api/cad/sources/:id/open-native',(req,res)=>{
  if(!authorize(req,res))return;
  if(req.headers.origin&&req.headers.origin!==req.protocol+'://'+req.headers.host)
    return res.status(403).json({ok:false,error:'origin_mismatch'});
  const entry=resolveSource(req.params.id);
  if(!entry)return res.status(404).json({ok:false,error:'source_not_found'});
  const appName=nativeApplicationForFormat(entry.record.format);
  if(!appName)return res.status(415).json({ok:false,error:'native_application_not_defined'});
  if(process.platform!=='darwin')return res.status(501).json({ok:false,error:'native_open_not_supported'});
  const command=spawn('/usr/bin/open',['-a',appName,entry.absolute],{stdio:'ignore'});
  let complete=false;
  command.on('error',()=>{if(!complete){complete=true;res.status(500).json({ok:false,error:'native_open_failed'})}});
  command.on('close',code=>{if(!complete){complete=true;res.status(code===0?200:500).json(code===0?
    {ok:true,application:appName,source:entry.record.id}:{ok:false,error:'native_open_failed'})}});
 });
}
