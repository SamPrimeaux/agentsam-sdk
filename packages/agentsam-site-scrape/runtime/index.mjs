/** Deterministic derived web resource graph from existing crawl evidence.
 * Never crawls a website or rescans a repository; Machine/Repository still own
 * filesystem perception, and Knowledge owns embeddings/retrieval.
 */
import {createHash} from 'node:crypto';
const sha=v=>createHash('sha256').update(v).digest('hex');
export const SITE_INDEX_SCHEMA='agentsam.site.index.v1';

export function createSiteIndex(pages=[]) {
 const sorted=[...pages].sort((a,b)=>a.url.localeCompare(b.url));
 const pageIds=new Map(sorted.map(p=>[p.url,`page:${sha(p.url).slice(0,24)}`]));
 const resources=[],edges=[],media=new Map();
 for(const page of sorted) {
  const id=pageIds.get(page.url);
  const content=page.content||[];
  resources.push({id,url:page.url,title:page.title||'',meta:page.meta||{},
    content_hash:'sha256:'+sha(JSON.stringify(content)),blocks:content,
    image_count:(page.images||[]).length});
  for(const link of page.links||[])if(pageIds.has(link.url))
    edges.push({from:id,to:pageIds.get(link.url),kind:'internal_link',text:link.text||''});
  for(const image of page.images||[]) {
    const assetId=`asset:${sha(image.url).slice(0,24)}`;
    if(!media.has(image.url))media.set(image.url,{id:assetId,url:image.url,alt:image.alt||''});
    edges.push({from:id,to:assetId,kind:'image_reference'});
  }
 }
 const assets=[...media.values()].sort((a,b)=>a.url.localeCompare(b.url));
 edges.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 return {schema:SITE_INDEX_SCHEMA,resources,assets,edges,counts:{pages:resources.length,assets:assets.length,edges:edges.length},
   content_hash:'sha256:'+sha(JSON.stringify({resources,assets,edges}))};
}
