/** Fail closed if CAD studio authored styles bypass theme.typography tokens. */
import {readFileSync,readdirSync} from 'node:fs';
import {resolve,join,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
const app=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const repo=resolve(app,'../..');
const candidates=[join(app,'frontend/src'),join(repo,'packages/agentsam-nav/src')];
const violations:string[]=[];
const checks=[
 /font-family\s*:\s*(?!var\()/gi,
 /font-size\s*:\s*(?:[0-9]|\.)/gi,
 /font-weight\s*:\s*[0-9]/gi,
 /fontSize\s*:\s*[0-9]/g,
 /fontFamily\s*:\s*['"]/g,
 /(?:fonts\.googleapis|fonts\.gstatic)/gi,
 /text-\[[0-9.]+(?:px|rem)\]/g,
 /font-size=[\"'][0-9]/g,
 /@font-face/g,
];
const visit=(dir:string)=>{
 for(const entry of readdirSync(dir,{withFileTypes:true})){
  if(entry.name==='generated'||entry.name==='dist'||entry.name==='node_modules'||entry.name==='public')continue;
  const file=join(dir,entry.name);
  if(entry.isDirectory()){visit(file);continue;}
  if(!/\.(?:tsx?|css|jsx?)$/.test(entry.name))continue;
  const lines=readFileSync(file,'utf8').split(/\r?\n/);
  lines.forEach((line,index)=>{
   for(const pattern of checks){pattern.lastIndex=0;if(pattern.test(line))violations.push(`${relative(repo,file)}:${index+1}: ${pattern.source}`)}
  });
 }
};
for(const dir of candidates)visit(dir);
if(violations.length){console.error('CAD typography is not token governed:\n'+violations.join('\n'));process.exitCode=1;}
else console.log('CAD typography: PASS, no literal family, weight, size, remote fonts, or authored font-face outside generated CSS.');
