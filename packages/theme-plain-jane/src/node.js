import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const SOURCE=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../site');
const TEXT_EXTENSIONS=new Set(['.js','.css','.html','.json']);
export function resolvePrebuildRoot(){return SOURCE;}
export function materializePrebuild(target,options={}){
  if(!target)throw new TypeError('target is required');
  const destination=path.resolve(target);
  const segments=String(options.basePath||'/').split('/').filter(Boolean);
  const basePath=segments.length?'/'+segments.join('/')+'/':'/';
  if(!/^\/(?:[a-zA-Z0-9._~-]+\/)*$/.test(basePath))throw new Error('Invalid base path');
  if(path.resolve(destination)===SOURCE)throw new Error('Source cannot be overwritten');
  if(fs.existsSync(destination)&&options.overwrite!==true)
    throw new Error('Destination already exists. Installation must not overwrite a site without explicit authorization.');
  // Stage first; only replace target once a complete copy exists.
  const staging=destination+'.staging-'+process.pid;
  fs.rmSync(staging,{recursive:true,force:true});
  fs.mkdirSync(path.dirname(staging),{recursive:true});
  fs.cpSync(SOURCE,staging,{recursive:true});
  const stack=[staging];
  while(stack.length){
    const dir=stack.pop();
    for(const item of fs.readdirSync(dir,{withFileTypes:true})){
      const file=path.join(dir,item.name);
      if(item.isDirectory()){stack.push(file);continue;}
      if(!TEXT_EXTENSIONS.has(path.extname(item.name)))continue;
      let content=fs.readFileSync(file,'utf8');
      content=content.replaceAll('/themes/plain-jane/demo/',basePath);
      fs.writeFileSync(file,content);
    }
  }
  // Physical paths guarantee deep-link refresh works on a static host without SPA rewrites.
  const manifest=JSON.parse(fs.readFileSync(path.join(staging,'journal-cms-manifest.json'),'utf8'));
  const index=fs.readFileSync(path.join(staging,'index.html'));
  for(const page of manifest.pages){
    if(!page.path||!(/^[a-z0-9/-]+$/.test(page.path)))continue;
    const pageDir=path.join(staging,page.path);
    fs.mkdirSync(pageDir,{recursive:true});
    fs.writeFileSync(path.join(pageDir,'index.html'),index);
  }
  fs.rmSync(destination,{recursive:true,force:true});
  fs.renameSync(staging,destination);
  return {theme:'plain-jane',destination,basePath,pages:manifest.pages.length};
}
