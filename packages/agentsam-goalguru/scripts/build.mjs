import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
rmSync(root + '/dist', {recursive:true,force:true});
await build({absWorkingDir:root,
 entryPoints:['src/index.ts','src/contracts.ts','src/GoalGuruPanel.tsx'],
 outdir:'dist',outbase:'src',bundle:true,format:'esm',platform:'neutral',target:'es2022',
 jsx:'automatic',external:['react','react/*','react-dom','react-dom/*','lucide-react']});
mkdirSync(root+'/dist',{recursive:true});
cpSync(root+'/src/theme.css',root+'/dist/theme.css');
execFileSync('tsc',['-p','tsconfig.json','--noEmit','false','--emitDeclarationOnly','--declaration','--outDir','dist'],{cwd:root,stdio:'inherit'});
