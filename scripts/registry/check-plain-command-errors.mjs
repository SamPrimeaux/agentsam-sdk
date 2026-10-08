#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const dir=path.join(root,'src/commands');
const file=path.join(root,'scripts/registry/plain-error-baseline.json');
const current={};
for(const name of fs.readdirSync(dir).filter(n=>n.endsWith('.js'))){
 const text=fs.readFileSync(path.join(dir,name),'utf8');
 const count=[...text.matchAll(/\bnew\s+Error\s*\(/g)].length;
 if(count)current[name]=count;
}
if(process.argv.includes('--baseline')){
 fs.writeFileSync(file,JSON.stringify(current,null,2)+'\n');
 console.log('Recorded existing plain command errors');
}else{
 const baseline=JSON.parse(fs.readFileSync(file,'utf8'));
 const failures=Object.entries(current).filter(([name,count])=>count>(baseline[name]||0));
 if(failures.length){
  console.error('New plain command errors: '+failures.map(([n,v])=>n+': '+v+' > '+(baseline[n]||0)).join(', '));
  process.exitCode=1;
 }else{
  console.log('Command error regression PASS · '+Object.values(current).reduce((a,b)=>a+b,0)+' legacy plain Error sites remain to migrate');
 }
}
