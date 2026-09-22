import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),sdk=path.resolve(app,'../..');
const runtime=path.join(app,'backend/runtime');
fs.mkdirSync(runtime,{recursive:true});
if(fs.existsSync(path.join(sdk,'src/lib/cad/project-cli.js'))){
 await build({entryPoints:[path.join(sdk,'src/lib/cad/project-cli.js')],outfile:path.join(runtime,'project-cli.mjs'),bundle:true,platform:'node',format:'esm',target:'node20'});
 fs.copyFileSync(path.join(sdk,'src/lib/cad/project-cli.d.ts'),path.join(runtime,'project-cli.d.mts'));
 fs.mkdirSync(path.join(runtime,'cad/blender'),{recursive:true});
 fs.copyFileSync(path.join(sdk,'services/cad/blender/adapter.py'),path.join(runtime,'cad/blender/adapter.py'));
}else if(!fs.existsSync(path.join(runtime,'project-cli.mjs')))throw new Error('Packaged CAD runtime missing');
fs.mkdirSync(path.join(app,'backend/dist'),{recursive:true});
fs.cpSync(path.join(runtime,'cad'),path.join(app,'backend/dist/cad'),{recursive:true});
