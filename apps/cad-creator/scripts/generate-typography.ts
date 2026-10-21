/** Compiles the canonical AgentSam app manifest theme into portable CSS. */
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
type Face={role:string;family:string;file:string;weight:string;subset:string};
type Typography={families:Record<string,string>;weights:Record<string,number>;sizes:Record<string,string>;leading:Record<string,number>;tracking:Record<string,string>;faces:Face[]};
const app=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const manifestPath=resolve(app,'agentsam.app.json');
const manifest=JSON.parse(readFileSync(manifestPath,'utf8')) as {theme?:{typography?:Typography}};
const typography=manifest.theme?.typography;
if(!typography)throw Error('Manifest lacks theme.typography');
const allowedSize=/^\d+(?:\.\d+)?(?:px|rem|em)$/;
const css=['/* GENERATED: apps/cad-creator/agentsam.app.json#theme.typography; do not edit. */'];
for(const f of typography.faces){
  if(!/^[A-Za-z0-9_-]+\.woff2$/.test(f.file)||!existsSync(join(app,'frontend/public/fonts',f.file)))throw Error('Missing self-hosted WOFF2: '+f.file);
  if(!/^\d{3} \d{3}$/.test(f.weight))throw Error('Invalid variable font weight range');
  css.push(`@font-face{font-family:"${f.family}";src:url("/fonts/${f.file}") format("woff2");font-style:normal;font-display:swap;font-weight:${f.weight};unicode-range:${f.subset};}`);
}
css.push(':root{');
for(const [name,family] of Object.entries(typography.families)){
 if(!['sans','display','mono'].includes(name))throw Error('Unknown role '+name);
 css.push(`  --font-${name}:"${family}",${name==='mono'?'monospace':'sans-serif'};`);
}
for(const [k,v] of Object.entries(typography.weights))css.push(`  --fw-${k}:${Number(v)};`);
for(const [k,v] of Object.entries(typography.sizes)){
 if(!allowedSize.test(v))throw Error('Invalid size '+k);css.push(`  --text-${k}:${v};`);
}
for(const [k,v] of Object.entries(typography.leading))css.push(`  --leading-${k}:${Number(v)};`);
for(const [k,v] of Object.entries(typography.tracking))css.push(`  --tracking-${k}:${v};`);
css.push('}');
css.push('html,body{font-family:var(--font-sans);font-size:var(--text-base);font-weight:var(--fw-body);line-height:var(--leading-normal);letter-spacing:var(--tracking-normal)}');
css.push('h1,h2,h3,h4,h5,h6{font-family:var(--font-display);font-weight:var(--fw-heading);line-height:var(--leading-tight)}');
css.push('h1{font-size:var(--text-h1)}h2{font-size:var(--text-h2)}');
css.push('button,input,select,textarea,summary{font:inherit}code,pre,kbd,samp{font-family:var(--font-mono)}');
const target=join(app,'frontend/src/generated/typography.css');mkdirSync(dirname(target),{recursive:true});
const output=css.join('\n')+'\n';
if(process.argv.includes('--check')){
  if(!existsSync(target)||readFileSync(target,'utf8')!==output)throw Error('Typography generated CSS is stale: run npm run typography:generate');
}else{writeFileSync(target,output);console.log('Typography: generated '+target+' from '+manifestPath);}
