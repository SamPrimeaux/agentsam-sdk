/**
 * Dev-only stylesheet extraction, from the actual commerce CMS Theme Studio.
 * Reuse its stage background without forking a CSS copy or mounting a second CMS editor.
 */
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const repo=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const source='apps/ecommerce-cms-agentsam/frontend/static/css/theme-editor.css';
const css=await readFile(resolve(repo,source),'utf8');
function rule(selector){
 const marker=selector+' {',at=css.indexOf(marker);
 if(at<0)throw Error('CMS Theme Studio stage source changed: '+selector);
 const start=at+marker.length;
 let depth=1,i=start;
 for(;i<css.length&&depth;i++) {
  if(css[i]==='{')depth++;
  if(css[i]==='}')depth--;
 }
 if(depth!==0)throw Error('CMS Theme Studio rule not closed: '+selector);
 return css.slice(start,i-1);
}
const light=rule(':root'),dark=rule(':root[data-te-shell-mode="dark"]'),stage=rule('.theme-studio-canvas');
const output=resolve(repo,'packages/agentsam-nav/dev/.generated/cms-theme-stage.css');
const result='/* GENERATED FROM '+source+' — do not edit independently. */\n'
 +'.atlas-root {\n'+light+'\n}\n'
 +'.atlas-root {\n  --te-panel:#161a22;\n  --te-canvas:#20242d;\n  --te-text:#e2e5ed;\n  --te-muted:#a1a8b8;\n  --te-accent:#9586e6;\n'+dark+'\n}\n'
 +'.atlas-root .atlas-stage.cms-theme-canvas-stage {\n'+stage+'\n  display:block;\n  position:relative;\n}\n'
 +'.atlas-root .atlas-stage.cms-theme-canvas-stage .cv-viewport {background:transparent;}\n';
await mkdir(dirname(output),{recursive:true});
await writeFile(output,result);
console.log('Canvas stage sourced from '+source);
