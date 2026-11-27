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
// Build the shared Workbench frame first so the standalone app never bundles stale JS or CSS.
execFileSync(process.execPath,[resolve(root,'packages/agentsam-workbench/scripts/build.mjs')],{cwd:root,stdio:'inherit'});
await build({
 entryPoints:[resolve(here,'src/main.tsx')],
 bundle:true,platform:'browser',format:'iife',target:'es2022',jsx:'automatic',
 loader:{'.svg':'dataurl'},
 outdir:out,entryNames:'app',minify:true,logLevel:'info',
 alias:{
  '@':resolve(root,'apps/local-studio/frontend/src'),
  // The standalone bundle imports shared Workbench components from the Local Studio tree.
  // Resolve every React import to the host's single runtime to avoid invalid-hook-call failures.
  'react':resolve(root,'apps/local-studio/node_modules/react'),
  'react-dom':resolve(root,'apps/local-studio/node_modules/react-dom')
 }
});
cpSync(resolve(here,'index.html'),resolve(out,'index.html'));
cpSync(resolve(here,'public/sources'),resolve(out,'sources'),{recursive:true});
cpSync(resolve(here,'public/workspace-covers'),resolve(out,'workspace-covers'),{recursive:true});
console.log('AgentSam Design Canvas app built:',out);
