#!/usr/bin/env node
/**
 * Build an editable, site-owned CMS project from any reviewed website release.
 *
 * No theme-specific source manifests or hard-coded page lists. All content is
 * extracted from the *real rendered release*. Static HTML routes are read from
 * the immutable ZIP; dynamic routes are discovered from links in the preview.
 *
 * Usage:
 *   node scripts/build-installable-website-theme.mjs revise
 *   node scripts/build-installable-website-theme.mjs revise --staged /path/to/staged-releases.json
 *
 * --staged is for release QA before catalog activation; ordinary rebuilds
 * consume the published manifest/download through the Theme Store API.
 */
import { createHash } from 'node:crypto';
import { readFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { auditPortableThemeProject } from '../../ecommerce-cms-agentsam/packages/theme-contract/editor/portability.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const slug=process.argv[2];
if(!/^[a-z][a-z0-9-]{0,63}$/.test(slug||''))throw Error('Usage: build-installable-website-theme.mjs <slug> [--staged /path/to/staged-releases.json]');
const origin='https://themes.inneranimalmedia.com';
const stageAt=process.argv.indexOf('--staged');
const stageFile=stageAt>=0?process.argv[stageAt+1]:null;
if(stageAt>=0&&!stageFile)throw Error('stage_file_required');
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
function unzip(path,entry) {
 const res=spawnSync('unzip',['-p',path,entry],{encoding:'buffer',maxBuffer:8*1024*1024});
 if(res.status!==0)throw Error('release_entry_not_found:'+entry);
 return res.stdout;
}
function zipEntries(path){
 const res=spawnSync('unzip',['-Z1',path],{encoding:'utf8',maxBuffer:8*1024*1024});
 if(res.status!==0)throw Error('release_zip_entries_invalid');
 return res.stdout.split('\n').filter(Boolean);
}
const temp=await mkdtemp(join(tmpdir(),'iam-theme-install-'));
let browser;
try {
 let release, bytes, manifest;
 if(stageFile) {
   const staged=JSON.parse(await readFile(stageFile,'utf8'));
   if(staged.schema!=='iam.theme-stage.v1')throw Error('release_stage_invalid');
   release=staged.products?.find(p=>p.slug===slug);
   if(!release?.uploaded)throw Error('release_not_staged_in_r2:'+slug);
   bytes=await readFile(join(dirname(stageFile),release.file));
 } else {
   const response=await fetch(origin+'/api/catalog');
   if(!response.ok)throw Error('theme_store_catalog_unavailable');
   const catalog=await response.json();
   const item=catalog.products?.find(p=>p.slug===slug);
   if(item?.release?.status!=='published')throw Error('theme_release_not_published:'+slug);
   release={slug,version:item.version,sha256:item.release.sha256,storageKey:item.release.storageKey};
   const archive=await fetch(origin+'/api/themes/'+slug+'/'+item.version+'/download');
   if(!archive.ok)throw Error('released_zip_unavailable:'+slug);
   bytes=Buffer.from(await archive.arrayBuffer());
 }
 if(bytes.length>32*1024*1024||sha256(bytes)!==release.sha256)throw Error('release_checksum_invalid:'+slug);
 if(release.storageKey!=='releases/'+slug+'/'+release.version+'/'+release.sha256+'.zip')throw Error('release_identity_invalid');
 const zip=join(temp,'release.zip'); await writeFile(zip,bytes);
 const files=zipEntries(zip);
 if(files.some(f=>f.startsWith('/')||f.split('/').includes('..'))||!files.includes('site/index.html'))throw Error('unsafe_or_missing_site_package:'+slug);
 manifest=JSON.parse(unzip(zip,'theme-package.json').toString('utf8'));
 if(manifest.schema!=='iam.theme-package.v1'||manifest.slug!==slug||manifest.version!==release.version||manifest.sku!=='iam.theme.'+slug||manifest.sourcePackage!=='@inneranimalmedia/theme-'+slug)
   throw Error('source_package_manifest_mismatch:'+slug);
 const base=origin+'/theme-packages/'+slug+'/'+release.version+'/preview/';
 const staticRoutes=files.filter(f=>f.startsWith('site/')&&f.endsWith('.html'))
   // Fragment partials belong inside their parent page; presenting nav/footer/
   // section HTML files as independent website pages is a broken installer.
   .filter(f=>/<!doctype\s+html|<html(?:\s|>)/i.test(unzip(zip,f).toString('utf8').slice(0,1800)))
   .map(f=>{
     const name=f.slice(5);
     return name==='index.html'?'':name.endsWith('/index.html')?name.slice(0,-10):name;
   });
 const declaredRoutePaths=[];
 // Preserve any author-supplied CMS route manifest when present, but never
 // require one. It is guidance, not substitute content.
 for(const f of files.filter(f=>/site\/[^/]+-cms-manifest\.json$/.test(f))){
   const declared=JSON.parse(unzip(zip,f).toString('utf8'));
   if(declared.schema==='agentsam.cms-source-manifest.v1'&&declared.theme===slug)
     for(const p of declared.pages||[])if(typeof p.path==='string')declaredRoutePaths.push(p.path.replace(/^\/+/,'')); 
 }
 const routes=['',...declaredRoutePaths,...staticRoutes.filter(p=>p!=='')];
 const seen=new Set(),signatures=new Set(),pages=[],missing=[],usedSlugs=new Set(),failedAssets=new Set();
 const MAX_ROUTES=65,MAX_PAGES=70;
 const browserPath=process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
 browser=await chromium.launch({executablePath:browserPath,headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:960},deviceScaleFactor:1});
 const extractor=await readFile(join(root,'apps/ecommerce-cms-agentsam/frontend/theme-editor/project.mjs'),'utf8');
 await page.route('**/__agentsam_install_extract.mjs',route=>route.fulfill({status:200,contentType:'text/javascript',body:extractor}));
 page.on('response',response=>{
   if(response.status()>=400&&response.url().startsWith(base))failedAssets.add(response.status()+':'+response.url().slice(base.length));
 });
 const normalizeRoute=(route)=>{
   let cleaned=decodeURIComponent(route).split(/[?#]/,1)[0].replace(/^\/+/, '');
   if(cleaned==='index.html')return '';
   if(cleaned.endsWith('index.html')&&cleaned!=='index.html')cleaned=cleaned.slice(0,-10);
   if(cleaned.split('/').includes('..')||!/^[-a-zA-Z0-9_./]*$/.test(cleaned))return null;
   if(/\.(css|js|json|svg|png|jpe?g|webp|avif|woff2?|ico|pdf|xml)$/i.test(cleaned))return null;
   return cleaned;
 };
 const queue=[];
 const queueRoute=route=>{
   const cleaned=normalizeRoute(route);
   if(cleaned!==null&&!seen.has(cleaned)&&!queue.includes(cleaned)&&queue.length<MAX_ROUTES)queue.push(cleaned);
 };
 routes.forEach(queueRoute);
 while(queue.length&&seen.size<MAX_ROUTES&&pages.length<MAX_PAGES){
   const route=queue.shift();if(seen.has(route))continue;seen.add(route);
   const relative=route||'';
   let res;
   try {res=await page.goto(base+relative,{waitUntil:'domcontentloaded',timeout:24000});}
   catch(e){missing.push(route+':navigation_failed');continue;}
   if(!res||res.status()>=400){missing.push(route+':http_'+res?.status());continue;}
   // Hydrated sites need one render turn before snapshot. The serialized
   // editor payload retains the actual rendered document, not source scripts.
   await page.waitForTimeout(500);
   let state;
   try{
    state=await page.evaluate(async ({base,route})=>{
      const main=document.querySelector('main');
      const text=(main?.innerText||document.body?.innerText||'').trim();
      const candidates=[...document.querySelectorAll('a[href]')].map(a=>a.href)
        .filter(u=>u.startsWith(base)).map(u=>u.slice(base.length));
      const hasBody=!!document.querySelector('body');
      return {title:document.title,text,hasBody,candidates,
        imageCount:document.querySelectorAll('img').length,
        headingCount:document.querySelectorAll('h1,h2,h3,h4').length};
    },{base,route});
   }catch(e){missing.push(route+':dom_unavailable');continue;}
   for(const next of state.candidates)queueRoute(next);
   if(!state.hasBody||state.text.length<75||state.headingCount===0){missing.push(route+':no_rendered_content');continue;}
   const signature=sha256(state.text.replace(/\s+/g,' ').slice(0,4000));
   if(signatures.has(signature))continue;
   signatures.add(signature);
   let pageSlug=route.replace(/\/index\.html$/,'').replace(/\.html$/,'').replace(/[^a-z0-9-]/gi,'-').replace(/-+/g,'-').replace(/^-|-$/g,'').toLowerCase()||'home';
   pageSlug=pageSlug.slice(0,55).replace(/-+$/,'');
   const originSlug=pageSlug;
   for(let idx=2;usedSlugs.has(pageSlug);idx++)pageSlug=originSlug.slice(0,50)+'-'+idx;
   usedSlugs.add(pageSlug);
   const title=state.title||pageSlug;
   let data;
   try{
     data=await page.evaluate(async ({slug,title,base})=>{
       const copy=document.documentElement.cloneNode(true);
       copy.querySelectorAll('script').forEach(node=>node.remove());
       const html='<!DOCTYPE html>'+copy.outerHTML;
       const {extractThemePage}=await import('/__agentsam_install_extract.mjs');
       return extractThemePage(html,{slug,title,baseUrl:base});
     },{slug:pageSlug,title,base});
   }catch(e){throw Error('theme_extraction_failed:'+slug+':'+route+':'+e.message);}
   if(!data?.sections?.length||!data.sections.some(s=>s.schema.fields?.length||s.schema.blocks?.some(b=>b.fields?.length)))
     throw Error('no_editable_fields:'+slug+':'+route);
   data.sourceRoute='/'+route;
   pages.push(data);
   console.log('[project]',slug,route||'/',pageSlug,'sections',data.sections.length,'media',state.imageCount,'fields',data.sections.reduce((n,s)=>n+(s.schema.fields?.length||0),0));
 }
 if(!pages.length||!pages.some(p=>p.slug==='home'))throw Error('no_valid_home_page:'+slug);
 if(pages.length>80)throw Error('project_too_many_pages');
 const project={
   schema:'agentsam.theme-project.v1',id:'theme_'+slug,name:manifest.slug==='plain-jane'?'Plain Jane Journal':slug.replace(/(^|-)(\w)/g,(_,a,b)=>(a?' ':'')+b.toUpperCase()),
   pages,tokens:{},sourceThemeId:slug,sourcePackage:manifest.sourcePackage,sourcePackageVersion:release.version,
   sourcePreviewUrl:base,sourceReleaseSha256:release.sha256,sourceCmsManifestSchema:manifest.schema,
   sourceManifestPageCount:declaredRoutePaths.length||staticRoutes.length,
   sourceRoutesNotRendered:missing,sourcePagesDetected:seen.size,sourceAssetErrors:[...failedAssets].slice(0,100),
   revision:0,version:'0.1.0',
 };
 const portability=auditPortableThemeProject(project,{declaredPages:manifest.pages||[]});
 console.log('[cms-portability]',slug,JSON.stringify(portability));
 if(!portability.ok)throw Error('cms_portability_invalid:'+slug+':'+
   portability.errors.map(x=>x.code+'='+x.detail).join('|'));
 const output=Buffer.from(JSON.stringify(project,null,2)+'\n');
 if(output.length>8*1024*1024)throw Error('theme_project_too_large:'+slug+':'+output.length);
 const destination=join(root,'apps/ecommerce-cms-agentsam/frontend/static/data/site-theme-projects');
 await mkdir(destination,{recursive:true});
 const filename=slug+'-'+release.version+'.json';
 await writeFile(join(destination,filename),output);
 const indexPath=join(destination,'index.json');
 let prior=[];
 try {const old=JSON.parse(await readFile(indexPath,'utf8'));if(old.schema==='agentsam.website-theme-install-index.v1')prior=old.packages;} catch{}
 const ready={slug,version:release.version,sha256:release.sha256,page_count:pages.length,
   manifest_page_count:project.sourceManifestPageCount,
   project_asset:'/ecommerce-cms-agentsam/admin/data/site-theme-projects/'+filename};
 await writeFile(indexPath,JSON.stringify({schema:'agentsam.website-theme-install-index.v1',
   packages:[...prior.filter(p=>p.slug!==slug),ready].sort((a,b)=>a.slug.localeCompare(b.slug))},null,2)+'\n');
 console.log('[project-ready]',JSON.stringify({slug,version:release.version,sha256:release.sha256,page_count:pages.length,
   section_count:pages.reduce((n,p)=>n+p.sections.length,0),bytes:output.length,missing,failedAssets:[...failedAssets]}));
} finally {await browser?.close();await rm(temp,{recursive:true,force:true});}
