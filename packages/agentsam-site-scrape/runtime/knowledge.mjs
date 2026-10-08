/** Verified site-crawl virtual sources for the *existing* Knowledge engine.
 * No second semantic index, embedded model list, or storage selection.
 */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {verifyLocalArchive} from './node-storage.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');
const within=(file,selected)=>selected==='.'||file===selected||file.startsWith(selected+'/');

export function loadVerifiedSiteIndex(archiveRoot) {
 const root=path.resolve(archiveRoot);
 const manifest=verifyLocalArchive(root);
 const graph=JSON.parse(fs.readFileSync(path.join(root,'index.json'),'utf8'));
 if(graph.schema!=='agentsam.site.index.v1')throw Error('not a canonical site evidence index');
 return {graph,manifest};
}

export function siteKnowledgeSources(graph, scope={include:['.'],exclude:[]}) {
 if(graph?.schema!=='agentsam.site.index.v1'||!Array.isArray(graph.resources)||
    !Array.isArray(graph.assets)||!Array.isArray(graph.edges))throw Error('invalid canonical site index');
 const current='sha256:'+sha(JSON.stringify({resources:graph.resources,assets:graph.assets,edges:graph.edges}));
 if(current!==graph.content_hash)throw Error('site evidence graph hash mismatch');
 const map=new Map();
 for(const page of graph.resources){
   if(typeof page.url!=='string'||!/^https?:\/\//.test(page.url)||!Array.isArray(page.blocks))throw Error('invalid site page evidence');
   const filename=`sites/${sha(page.url).slice(0,32)}.md`;
   const description=page.meta?.description || page.meta?.['og:description'] || '';
   const text=[`# ${page.title||page.url}`,`Source URL: ${page.url}`,
     ...(description?[`Description: ${description}`]:[]),
     ...page.blocks.map(block=>`${block.kind||'text'}: ${String(block.text||'')}`)].join('\n\n');
   const bytes=Buffer.byteLength(text);
   if(bytes>2*1024*1024)throw Error('site page exceeds Knowledge source size limit');
   if(!scope.include.some(s=>within(filename,s))||scope.exclude.some(s=>within(filename,s)))continue;
   map.set(filename,{content:text,hash:'sha256:'+sha(Buffer.from(text)),bytes,url:page.url});
 }
 return map;
}
