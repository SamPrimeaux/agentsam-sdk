import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {fetchAllPages,getPageManifest,cmsRegistryKeys} from '../source/src/data/cms.ts';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const pages=await fetchAllPages();
if(!pages.length)throw Error('Journal fixture unexpectedly empty');
const route=(page:typeof pages[number])=>{
  if(page.slug==='home')return '';
  if(page.page_type==='post')return 'post/'+page.slug;
  if(page.page_type==='case-study')return 'case-study/'+page.slug;
  return page.slug;
};
const manifest={
  schema:'agentsam.cms-source-manifest.v1',
  theme:'plain-jane',site_slug:'plain-jane-journal',
  preview_only:true,source:'SamPrimeaux/inneranimalmedia-blog-template',
  definitions:cmsRegistryKeys(),
  pages:pages.map(page=>({
    slug:'journal-'+page.slug.replace(/[^a-z0-9-]/g,'-'),
    source_slug:page.slug,title:page.title,page_type:page.page_type,
    path:route(page),template_key:'plain-jane/'+page.page_type,
    status:'draft',
    seo_json:page.seo_json||{},og_image_asset_id:page.og_image_asset_id||null,
    manifest:getPageManifest(page),
    sections:page.sections.map((section,i)=>({
      id:section.id,
      key:section.id,
      definition_key:section.definition_key,
      template_sku:section.template_sku,
      content:section.section_data||{},
      blocks:section.blocks||[],
      sort_order:i,status:'draft'
    }))
  }))
};
writeFileSync(path.join(root,'site','journal-cms-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log('Exported',manifest.pages.length,'journal pages and',manifest.definitions.length,'component definitions');
