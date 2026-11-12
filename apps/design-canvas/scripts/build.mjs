import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
const here=fileURLToPath(new URL('../',import.meta.url));
const root=resolve(here,'../..');
const out=resolve(here,'dist');
rmSync(out,{recursive:true,force:true});mkdirSync(out,{recursive:true});
execFileSync(process.execPath,[resolve(here,'scripts/generate-documents.mjs')],{stdio:'inherit'});
await build({
 entryPoints:[resolve(here,'src/main.tsx')],
 bundle:true,platform:'browser',format:'iife',target:'es2022',jsx:'automatic',
 outdir:out,entryNames:'app',minify:true,logLevel:'info',
 alias:{'@':resolve(root,'apps/local-studio/frontend/src')}
});
cpSync(resolve(here,'index.html'),resolve(out,'index.html'));
cpSync(resolve(here,'public/sources'),resolve(out,'sources'),{recursive:true});
console.log('AgentSam Design Canvas app built:',out);
