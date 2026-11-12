#!/usr/bin/env node
/**
 * Non-destructive cms_themes -> versioned R2 ui-theme packages.
 * D1 remains canonical; original inneranimalmedia/cms/themes objects stay untouched.
 *
 * dry-run:  node apps/local-studio/scripts/publish-studio-themes.mjs
 * publish:  node apps/local-studio/scripts/publish-studio-themes.mjs --execute --update-db
 * migrate:  node apps/local-studio/scripts/publish-studio-themes.mjs --all --execute --update-db
 */
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
const DB='inneranimalmedia-business',BUCKET='theme-store',ROOT='cms/ui-themes/v1';
const argv=new Set(process.argv.slice(2));
const all=argv.has('--all'),execute=argv.has('--execute'),patch=argv.has('--update-db'),verify=argv.has('--verify');
const limitArg=[...argv].find(x=>x.startsWith('--limit='));
const limit=limitArg?Number(limitArg.split('=')[1]):200;
if(patch&&!execute)throw Error('--update-db requires --execute');
if(!Number.isInteger(limit)||limit<1)throw Error('invalid --limit');
const tmp=await mkdtemp(path.join(tmpdir(),'iam-studio-theme-publish-'));
const sha=s=>createHash('sha256').update(s).digest('hex');
const json=o=>JSON.stringify(o,null,2)+'\n';
const sqlString=s=>"'"+String(s??'').replaceAll("'","''")+"'";
function parseObject(v){if(v&&typeof v==='object'&&!Array.isArray(v))return v;try{const o=JSON.parse(v||'{}');return o&&typeof o==='object'&&!Array.isArray(o)?o:{}}catch{return{}}}
function safeToken(name,value){return /^--[a-zA-Z][\w-]*$/.test(name)&&typeof value==='string'&&value.length<512&&!/[;{}<>\\\0\r\n]/.test(value)}
function color(v,fallback){return typeof v==='string'&&/^#[\da-fA-F]{3,8}$/.test(v)?v:fallback}
function xml(v){return String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&apos;")}
function exec(bin,args,timeoutMs=90000){return new Promise((resolve,reject)=>{const child=spawn(bin,args,{stdio:['ignore','pipe','pipe']});let out='',err='';const timer=setTimeout(()=>child.kill('SIGTERM'),timeoutMs);child.stdout.on('data',d=>{out+=d});child.stderr.on('data',d=>{err+=d});child.on('error',reject);child.on('close',code=>{clearTimeout(timer);code===0?resolve(out):reject(Error(bin+' '+args.slice(0,3).join(' ')+' failed('+code+'): '+err.slice(-850)+' '+out.slice(-500)))})})}
const rows=JSON.parse(await exec('wrangler',['d1','execute',DB,'--remote','--json','--command',"SELECT * FROM cms_themes WHERE status != 'archived' ORDER BY name"]));
const records=Array.isArray(rows)?(rows[0]?.results||[]):[];
const chosen=records.filter(r=>all||['IAM Studio Dark','IAM Studio Light'].includes(r.name)).slice(0,limit);
if(!chosen.length)throw Error('No eligible themes');
function pack(r){
 const stored=parseObject(r.css_vars_json),config=parseObject(r.config);
 const initial=Object.keys(stored).length?stored:parseObject(config.cssVars);
 const vars=Object.fromEntries(Object.entries(initial).filter(([k,v])=>safeToken(k,v)).sort((a,b)=>a[0].localeCompare(b[0])));
 const ignored=Object.keys(initial).length-Object.keys(vars).length;
 if(!Object.keys(vars).length)throw Error('no valid theme variables for '+r.slug);
 const bg=color(vars['--bg-canvas']||vars['--color-bg']||config.bg,r.theme_family==='dark'?'#17191d':'#f4f4f2');
 const pane=color(vars['--bg-surface']||vars['--color-surface']||config.surface,r.theme_family==='dark'?'#26252c':'#fff');
 const accent=color(vars['--accent']||vars['--color-accent']||vars['--color-primary']||config.primary,'#7656ee');
 const ink=color(vars['--text-primary']||vars['--color-text']||config.text,r.theme_family==='dark'?'#e6e8ec':'#20201f');
 const muted=color(vars['--text-muted']||vars['--color-text-muted']||config.textSecondary,r.theme_family==='dark'?'#9da2ae':'#74746f');
 const border=color(vars['--color-border']||vars['--border'],'#34373f');
 const css='/* InnerAnimalMedia UI Theme: '+r.name+' | source cms_themes '+r.id+' */\n'+
 ':root[data-studio-theme-id="'+r.id+'"],\n:root[data-cms-theme="'+r.slug+'"] {\n'+
 Object.entries(vars).map(([k,v])=>'  '+k+': '+v+';').join('\n')+'\n}\n';
 const hash=sha(css),prefix=ROOT+'/'+r.slug+'/'+hash.slice(0,16);
 const monacoSource=parseObject(r.monaco_theme_data);
 const monaco={id:r.slug+'-monaco',base:r.monaco_theme|| (r.theme_family==='dark'?'vs-dark':'vs'),inherit:true,rules:Array.isArray(monacoSource.rules)?monacoSource.rules:[],colors:{'editor.background':r.monaco_bg||bg,'editor.foreground':ink,'editorCursor.foreground':accent,'editor.selectionBackground':color(vars['--cv-selection'],'#596c8b'),'editor.lineHighlightBackground':pane,'editorLineNumber.foreground':muted,'editorGutter.background':r.monaco_bg||bg,...parseObject(monacoSource.colors)}};
 const svg='<svg xmlns="http://www.w3.org/2000/svg" width="1120" height="700" viewBox="0 0 1120 700"><rect width="1120" height="700" fill="'+bg+'"/><rect x="30" y="30" width="1060" height="640" rx="14" fill="'+pane+'" stroke="'+border+'"/><rect x="30" y="30" width="1060" height="50" rx="12" fill="'+bg+'"/><rect x="52" y="47" width="10" height="10" rx="5" fill="'+accent+'"/><text x="78" y="59" fill="'+ink+'" font-family="system-ui,sans-serif" font-size="16" font-weight="600">'+xml(r.name)+'</text><rect x="30" y="81" width="234" height="589" fill="'+pane+'"/><rect x="264" y="81" width="1" height="589" fill="'+border+'"/><rect x="51" y="112" width="190" height="36" rx="7" fill="'+bg+'"/><rect x="53" y="124" width="7" height="11" rx="3" fill="'+accent+'"/><text x="75" y="136" fill="'+ink+'" font-size="13" font-family="system-ui">Workspace</text><text x="53" y="198" fill="'+muted+'" font-size="12" font-family="system-ui">Projects</text><text x="53" y="232" fill="'+muted+'" font-size="12" font-family="system-ui">Library</text><text x="53" y="266" fill="'+muted+'" font-size="12" font-family="system-ui">Themes</text><rect x="295" y="108" width="765" height="200" rx="10" fill="'+bg+'"/><text x="331" y="164" fill="'+ink+'" font-size="28" font-weight="600" font-family="system-ui">'+xml(r.name)+'</text><text x="331" y="198" fill="'+muted+'" font-size="15" font-family="system-ui">A curated InnerAnimalMedia workspace appearance</text><rect x="331" y="229" width="160" height="42" rx="8" fill="'+accent+'"/><text x="354" y="256" fill="'+bg+'" font-weight="600" font-size="15" font-family="system-ui">Open Studio</text><rect x="295" y="339" width="365" height="281" rx="10" fill="'+bg+'" stroke="'+border+'"/><rect x="687" y="339" width="373" height="281" rx="10" fill="'+bg+'" stroke="'+border+'"/><text x="322" y="386" fill="'+ink+'" font-size="18" font-family="system-ui">Canvas</text><text x="714" y="386" fill="'+ink+'" font-size="18" font-family="system-ui">Components</text><rect x="322" y="414" width="300" height="14" rx="7" fill="'+border+'"/><rect x="714" y="414" width="306" height="14" rx="7" fill="'+border+'"/><circle cx="353" cy="507" r="20" fill="'+accent+'"/><rect x="395" y="496" width="180" height="18" rx="9" fill="'+pane+'"/><circle cx="747" cy="507" r="20" fill="'+accent+'"/><rect x="789" y="496" width="174" height="18" rx="9" fill="'+pane+'"/></svg>\n';
 const theme={schema:'iam.cms-theme.v1',id:r.id,slug:r.slug,name:r.name,theme_family:r.theme_family,visibility:r.visibility,account_scoped:Boolean(r.account_id),config,tokens:parseObject(r.tokens_json),css_vars:vars,brand:parseObject(r.brand_json),typography:parseObject(r.typography_json),layout:parseObject(r.layout_json),components:parseObject(r.components_json),motion:parseObject(r.motion_json),monaco:{theme:r.monaco_theme,background:r.monaco_bg},compiled_css_hash:hash};
 const payloads={'theme.css':css,'theme.json':json(theme),'monaco.json':json(monaco),'preview.svg':svg};
 const manifest={schema:'iam.cms-theme-package.v1',id:r.id,name:r.name,slug:r.slug,theme_family:r.theme_family,visibility:r.visibility,source:'cms_themes',bucket:BUCKET,prefix,compiled_css_hash:hash,files:Object.fromEntries(Object.entries(payloads).map(([key,value])=>[key,{key:prefix+'/'+key,sha256:sha(value),bytes:Buffer.byteLength(value)}]))};
 payloads['manifest.json']=json(manifest);
 return {r,vars,css,hash,prefix,manifest,payloads,ignored};
}
const output=[];for(const r of chosen){try{output.push(pack(r))}catch(e){console.error('[skip]',r.name,e.message)}}
console.log('[plan]',JSON.stringify({selected:chosen.length,packable:output.length,bucket:BUCKET,prefix:ROOT,execute,patch,verify,tmp}));
const successful=[],failed=[];
async function publish(p){
 try{
  const dir=path.join(tmp,p.r.slug);await mkdir(dir,{recursive:true});
  for(const [name,content] of Object.entries(p.payloads))await writeFile(path.join(dir,name),content);
  if(execute){
   await Promise.all(Object.keys(p.payloads).map(async name=>{
    const ct=name.endsWith('.css')?'text/css; charset=utf-8':name.endsWith('.svg')?'image/svg+xml':'application/json';
    await exec('wrangler',['r2','object','put',BUCKET+'/'+p.prefix+'/'+name,'--remote','--file',path.join(dir,name),'--content-type',ct,'--cache-control','public, max-age=31536000, immutable'],90000);
   }));
   if(verify){
    const dest=path.join(dir,'verified.css');
    await exec('wrangler',['r2','object','get',BUCKET+'/'+p.prefix+'/theme.css','--remote','--file',dest],90000);
    if(sha(await readFile(dest))!==p.hash)throw Error('R2 roundtrip checksum mismatch');
   }
  }
  successful.push(p);
  console.log('[ok]',p.r.name, 'tokens='+Object.keys(p.vars).length, 'css='+p.hash.slice(0,16),'key='+p.prefix+'/theme.css',p.ignored?'ignored='+p.ignored:'');
 }catch(e){failed.push({id:p.r.id,name:p.r.name,error:e.message});console.error('[failed]',p.r.name,e.message)}
}
for(let i=0;i<output.length;i+=2){await Promise.all(output.slice(i,i+2).map(publish))}
if(patch&&successful.length){
 const sql=successful.map(p=>"UPDATE cms_themes SET css_r2_bucket="+sqlString(BUCKET)+",css_r2_key="+sqlString(p.prefix+'/theme.css')+",compiled_css_hash="+sqlString(p.hash)+",updated_at=datetime('now') WHERE id="+sqlString(p.r.id)+" AND (compiled_css_hash IS NULL OR compiled_css_hash <> "+sqlString(p.hash)+" OR css_r2_bucket IS NULL OR css_r2_bucket <> "+sqlString(BUCKET)+");").join('\n');
 const f=path.join(tmp,'update-d1.sql');await writeFile(f,sql);
 await exec('wrangler',['d1','execute',DB,'--remote','--file',f],120000);
}
await writeFile(path.join(tmp,'report.json'),json({generated_at:new Date().toISOString(),selected:chosen.length,packable:output.length,published:execute?successful.length:0,db_updated:patch?successful.length:0,failed,tmp,bucket:BUCKET,records:successful.map(p=>({id:p.r.id,name:p.r.name,slug:p.r.slug,hash:p.hash,key:p.prefix+'/theme.css',token_count:Object.keys(p.vars).length}))}));
console.log('[summary]',JSON.stringify({selected:chosen.length,packable:output.length,published:execute?successful.length:0,db_updated:patch?successful.length:0,failed_count:failed.length,failed:failed.slice(0,10),report:path.join(tmp,'report.json')}));
if(failed.length)process.exitCode=1;

