#!/usr/bin/env node
/** Build the canonical native source and relocate its complete macOS dylib closure.
 * No runtime lookup in Homebrew or the developer's home directory is permitted.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const shell=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const repo=path.resolve(shell,'../..');
const out=path.join(shell,'src-tauri/generated/runtime/cad');
function run(cmd,args,opts={}) { const r=spawnSync(cmd,args,{encoding:'utf8',...opts});if(r.status!==0)throw new Error(`${cmd} failed: ${r.stderr||r.stdout}`);return r.stdout.trim(); }
function hash(file){return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');}
if(process.platform!=='darwin')throw new Error('CAD desktop packaging currently requires macOS; supply a tested platform runtime before enabling another target');
const target=process.env.TAURI_ENV_TARGET_TRIPLE||process.env.CARGO_BUILD_TARGET;
if(target&&target!==`${process.arch==='arm64'?'aarch64':'x86_64'}-apple-darwin`)throw new Error('CAD runtime cross-compilation is not configured');
const prefix=process.env.AGENTSAM_OCCT_PREFIX||run('brew',['--prefix','opencascade']);
const boost=process.env.AGENTSAM_BOOST_INCLUDE_DIR||path.join(run('brew',['--prefix','boost']),'include');
const build=path.join(repo,'packages/agentsam-occt/.native-build');
run('cmake',['-S',path.join(repo,'packages/agentsam-occt/native'),'-B',build,`-DAGENTSAM_OCCT_PREFIX=${prefix}`,`-DAGENTSAM_BOOST_INCLUDE_DIR=${boost}`,'-DCMAKE_BUILD_TYPE=Release']);
run('cmake',['--build',build,'--parallel','4']);
// Only generated output is replaced. Source and the user's installed kernels are untouched.
fs.rmSync(out,{recursive:true,force:true});fs.mkdirSync(path.join(out,'lib'),{recursive:true});
const staged=new Map(),queue=[];
function stage(source,dest){source=fs.realpathSync(source);const key=path.basename(dest);const prior=staged.get(key);if(prior){if(hash(prior.source)!==hash(source))throw new Error('Conflicting native dependency '+key);return prior.dest;}fs.copyFileSync(source,dest);fs.chmodSync(dest,0o755);const item={source,dest};staged.set(key,item);queue.push(item);return dest;}
const binary=stage(path.join(build,'agentsam-occt'),path.join(out,'agentsam-occt'));
function rpaths(file){const lines=run('otool',['-l',file]).split('\n');return lines.flatMap((s,i)=>s.trim()==='cmd LC_RPATH'?[lines[i+2]?.trim().match(/^path (.+) \(offset /)?.[1]].filter(Boolean):[]);}
function resolve(dep,owner){const replace=s=>s.replace('@loader_path',path.dirname(owner)).replace('@executable_path',build);let paths=dep.startsWith('@rpath/')?rpaths(owner).map(p=>path.join(replace(p),dep.slice(7))):[replace(dep)];paths.push(path.join(prefix,'lib',path.basename(dep)));const found=paths.find(p=>fs.existsSync(p));if(!found)throw new Error(`Unresolved native dependency ${dep} from ${owner}`);return found;}
for(let i=0;i<queue.length;++i){const {source,dest}=queue[i];const deps=run('otool',['-L',source]).split('\n').slice(1).map(l=>l.trim().split(' (')[0]).filter(Boolean);for(const dep of deps){if(dep.startsWith('/usr/lib/')||dep.startsWith('/System/Library/'))continue;if(fs.existsSync(dep)&&fs.realpathSync(dep)===source)continue;const sourceDep=resolve(dep,source);const name=path.basename(dep);stage(sourceDep,path.join(out,'lib',name));const relative=dest===binary?`@loader_path/lib/${name}`:`@loader_path/${name}`;run('install_name_tool',['-change',dep,relative,dest]);}if(dest!==binary)run('install_name_tool',['-id',`@loader_path/${path.basename(dest)}`,dest]);for(const rp of rpaths(dest))run('install_name_tool',['-delete_rpath',rp,dest]);}
// Preserve applicable license notices alongside the dynamically linked, replaceable libraries.
const licenses=path.join(out,'licenses');fs.mkdirSync(licenses,{recursive:true});
for(const f of ['LICENSE_LGPL_21.txt','OCCT_LGPL_EXCEPTION.txt'])fs.copyFileSync(path.join(prefix,'share/doc/opencascade',f),path.join(licenses,f));
const formulae=new Set([...staged.values()].map(v=>v.source.match(/\/Cellar\/([^/]+)\//)?.[1]).filter(Boolean));
for(const formula of formulae){const cell=run('brew',['--prefix',formula]);for(const file of fs.readdirSync(cell).filter(f=>/license|copying|copyright|notice/i.test(f)))if(fs.statSync(path.join(cell,file)).isFile())fs.copyFileSync(path.join(cell,file),path.join(licenses,formula+'-'+file));}
fs.writeFileSync(path.join(licenses,'SOURCE.txt'),'Open CASCADE Technology 7.9.3, LGPL-2.1 with OCCT exception.\nSource: https://github.com/Open-Cascade-SAS/OCCT/tree/V7_9_3\nLibraries remain separate dylibs and can be replaced by compatible builds.\nDependency formulas: '+[...formulae].sort().join(', ')+'\n');
for(const {dest}of [...staged.values()].reverse())run('codesign',['--force','--sign','-',dest]);
for(const {dest}of staged.values()){const links=run('otool',['-L',dest]).split('\n').slice(1).join('\n');if(/\/opt\/homebrew|\/usr\/local|\/Users\//.test(links))throw new Error('Nonportable dependency remains: '+dest);}
const relocated=fs.mkdtempSync(path.join(os.tmpdir(),'agentsam-cad-relocated-'));
try {fs.cpSync(out,relocated,{recursive:true});const receipt=run(path.join(relocated,'agentsam-occt'),['--doctor'],{cwd:'/',env:{PATH:'/usr/bin:/bin',HOME:relocated}});if(!receipt.includes('"engine":"occt"'))throw new Error('Relocated kernel probe failed');}finally{fs.rmSync(relocated,{recursive:true,force:true});}
const files=[...staged.values()].map(({dest})=>({path:path.relative(out,dest),sha256:hash(dest),sizeBytes:fs.statSync(dest).size}));
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({schema:'agentsam.cad.runtime.v1',platform:process.platform,arch:process.arch,files},null,2)+'\n');
console.log(`[prepare-cad-runtime] verified relocated OCCT runtime: ${files.length} files, ${files.reduce((n,f)=>n+f.sizeBytes,0)} bytes`);
