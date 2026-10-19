import path from 'node:path';
import fs from 'node:fs';
import type {Express, Request} from 'express';
import {localProjectRuntime} from '../../runtime/project-cli.mjs';
// A loopback-only local host. Remote product hosts must supply authenticated ownership.
export function installProjectRoutes(app: Express) {
 const root=path.resolve(process.env.AGENTSAM_CAD_PROJECT_ROOT||process.cwd());
 const listeners=new Set<any>();
 const projects=path.join(root,'.agentsam/cad/projects');
 fs.mkdirSync(projects,{recursive:true});
 // Filesystem notifications are best-effort. The in-process save callback below
 // remains authoritative and must work when macOS watcher limits are exhausted.
 try {
  const watcher=fs.watch(projects,{recursive:true},(_event,filename)=>{
   if(!filename||!String(filename).endsWith('head.json'))return;
   const id=String(filename).split(path.sep)[0];
   runtime.execute('design_project_get',{project_id:id}).then(row=>{for(const res of listeners)res.write('data: '+JSON.stringify(row)+'\n\n');}).catch(()=>{});
  });
  watcher.on('error',()=>watcher.close());
 }catch { /* OS watcher unavailable: explicit app saves still broadcast */ }

 const runtime=localProjectRuntime(root,row=>{for(const res of listeners)res.write('data: '+JSON.stringify(row)+'\n\n');});
 const local=(req: Request)=>{
  try {return ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress||'')&&['localhost','127.0.0.1','[::1]'].includes(new URL('http://'+req.headers.host).hostname);}
  catch{return false;}
 };
 app.get('/api/cad/project/native/doctor',async(req,res)=>{
  if(!local(req))return res.status(403).json({error:'local_design_host_only'});
  try{return res.json(await runtime.nativeDoctor());}
  catch{return res.status(503).json({engine:'occt',available:false,ready:false,reason:'native_probe_failed'});}
 });
 app.post('/api/cad/project/tools/:name',async(req,res)=>{
  if(!local(req))return res.status(403).json({error:'local_design_host_only'});
  if(req.headers.origin&&req.headers.origin!==req.protocol+'://'+req.headers.host)return res.status(403).json({error:'origin_mismatch'});
  try {return res.json({ok:true,result:await runtime.execute(req.params.name,req.body)});}
  catch(e:any){return res.status(e.message==='revision_conflict'?409:400).json({ok:false,error:e.message});}
 });
 app.get('/api/cad/project/events',(req,res)=>{
  if(!local(req))return res.sendStatus(403);
  res.setHeader('Content-Type','text/event-stream');res.setHeader('Cache-Control','no-cache');res.flushHeaders();listeners.add(res);
  req.on('close',()=>listeners.delete(res));
 });
 app.get('/api/cad/project/artifact/:id/:revision/:file',(req,res)=>{
  if(!local(req))return res.sendStatus(403);
  if(!/^[A-Za-z0-9_-]{1,100}$/.test(req.params.id)||!/^\d+$/.test(req.params.revision)||!['courtyard.png','model.glb','model.blend','model.obj','model.stl','model.step'].includes(req.params.file))return res.sendStatus(400);
  const file=path.join(root,'.agentsam/cad/artifacts',req.params.id,req.params.revision,req.params.file);
  if(!fs.existsSync(file))return res.sendStatus(404);
  return res.sendFile(file);
 });
 return runtime;
}
