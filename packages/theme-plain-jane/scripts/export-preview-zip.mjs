import {mkdirSync,cpSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {materializePrebuild} from '../src/node.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const name='plain-jane-journal-0.1.0-preview';
const dir=path.join(tmpdir(),'agentsam-template-releases');
const stage=path.join(dir,name);
mkdirSync(dir,{recursive:true});
rmSync(stage,{recursive:true,force:true});
materializePrebuild(path.join(stage,'site'),{basePath:'/'});
mkdirSync(path.join(stage,'cms-seed'),{recursive:true});
cpSync(path.join(root,'source/seed/plain-jane-journal.sql'),path.join(stage,'cms-seed/plain-jane-journal.sql'));
cpSync(path.join(root,'provenance.json'),path.join(stage,'provenance.json'));
cpSync(path.join(root,'prebuild.json'),path.join(stage,'prebuild.json'));
writeFileSync(path.join(stage,'README.txt'),[
 'Plain Jane Journal — AgentSam preview package','',
 'Contains the original compiled journal UI, public CMS manifest, and an example SQL seed.',
 'Preview distribution only. No production CMS installation, database migration, entitlement, or publishing.',
 'Open site/index.html in a static host rooted at / (or materialize using the Node package with basePath).',
 'DO NOT execute the seed SQL on customer D1 databases without verifying the exact schema, migration and tenant IDs.',
 'Provenance and upstream commit are recorded in provenance.json.',
 'A future verified installer must validate an immutable manifest, tenant scope and migration compatibility.'
].join('\n')+'\n');
const manifestPath=path.join(stage,'site','journal-cms-manifest.json');
const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
writeFileSync(path.join(stage,'artifact-manifest.json'),JSON.stringify({
 schema:'agentsam.template-preview.v1',sku:'theme-plain-jane-starter',
 version:'0.1.0',status:'preview_only',installable:false,
 pageCount:manifest.pages.length,componentDefinitionCount:manifest.definitions.length,
 sourceRepository:'SamPrimeaux/inneranimalmedia-blog-template'
},null,2)+'\n');
const zipPath=path.join(dir,name+'.zip');
rmSync(zipPath,{force:true});
const result=spawnSync('zip',['-qr',zipPath,name],{cwd:dir,encoding:'utf8'});
if(result.status!==0)throw Error(result.stderr||'ZIP build failed');
const checksum=createHash('sha256').update(readFileSync(zipPath)).digest('hex');
writeFileSync(zipPath+'.sha256',checksum+'  '+path.basename(zipPath)+'\n');
console.log(JSON.stringify({zipPath,sha256:checksum,pages:manifest.pages.length},null,2));
