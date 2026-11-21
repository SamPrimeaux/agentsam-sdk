/** Build the existing portable widget as an immutable, self-contained browser artifact.
 * No CMS or merchant configuration is embedded in the executable. */
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const [out,version]=process.argv.slice(2);
if(!out||!/^1\.0\.0-preview\.[0-9]+$/.test(version||''))throw Error('usage: build-store-chat-release.mjs <output> <draft-version>');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const result=await build({entryPoints:[resolve(root,'src/chat-widget.js')],bundle:true,format:'iife',platform:'browser',target:'es2022',minify:true,write:false,legalComments:'none'});
const bytes=result.outputFiles[0].contents, digest=hash(bytes);
const objectKey='blobs/sha256/'+digest.slice(0,2)+'/'+digest;
const manifest={schema:'inneranimalmedia.cms-component-package.v2',id:'platform/store-chat',kind:'cms-component-source',
 version,renderer_key:'agentsam-embeds:store-chat',embed_key:'store_chat',element:'agentsam-store-chat',
 entrypoint:'chat-widget.js',preview_only:true,files:[{path:'chat-widget.js',sha256:digest,bytes:bytes.length,content_type:'text/javascript; charset=utf-8',object_key:objectKey}]};
const manifestKey='packages/platform/store-chat/'+version+'/manifest.json';
const raw=Buffer.from(JSON.stringify(manifest,null,2)+'\n');
for(const [key,data] of [[objectKey,bytes],[manifestKey,raw]]){
 const file=resolve(out,key); await mkdir(dirname(file),{recursive:true}); await writeFile(file,data);
}
console.log(JSON.stringify({manifestKey,manifestSha256:hash(raw),objectKey,sha256:digest,bytes:bytes.length}));
