import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {listThemeStoreProducts} from '../../../packages/catalog/src/theme-products.mjs';

const root=new URL('../frontend/static/',import.meta.url);
const hash='a'.repeat(64);
const published=(slug,name,cardImage)=>({
 slug,sku:'iam.theme.'+slug,name,category:'Editorial',summary:name+' from Theme Store',
 publisher:'InnerAnimalMedia',version:'0.3.0',cardImage,
 previewUrl:'https://themes.example.test/'+slug+'/',
 release:{status:'published',sha256:hash,storageKey:'releases/'+slug+'/0.3.0/'+hash+'.zip'}
});

test('SDK theme catalog is discovered from Theme Store, including new slugs without SDK edits',async t=>{
 const previewRoot=await mkdtemp(path.join(os.tmpdir(),'theme-store-preview-'));
 t.after(()=>rm(previewRoot,{recursive:true,force:true}));
 await mkdir(path.join(previewRoot,'iapj','demo'),{recursive:true});
 await writeFile(path.join(previewRoot,'iapj','demo','index.html'),'<!doctype html>');
 const catalog={
  ok:true,schema:'iam.theme-catalog.v1',
  products:[
   published('iapj','InnerAnimal Plain Jane','/previews/iapj.webp'),
   published('future-theme','Future Theme','/previews/future-theme.webp'),
   {...published('preview-only','Preview Only','/previews/preview.webp'),release:{status:'preview',sha256:hash,storageKey:'releases/preview-only/0.3.0/'+hash+'.zip'}}
  ]
 };
 let requestedUrl='';
 const entries=await listThemeStoreProducts({
  storeUrl:'https://themes.example.test',
  previewRoot,
  fetcher:async input=>{
   requestedUrl=String(input);
   return new Response(JSON.stringify(catalog),{status:200,headers:{'content-type':'application/json'}});
  }
 });
 assert.equal(requestedUrl,'https://themes.example.test/api/catalog');
 assert.deepEqual(entries.map(entry=>entry.slug),['iapj','future-theme']);
 const iapj=entries.find(entry=>entry.slug==='iapj');
 const future=entries.find(entry=>entry.slug==='future-theme');
 assert.equal(iapj.source,'Theme Store');
 assert.equal(iapj.preview_ready,true);
 assert.equal(iapj.preview_url,'/themes/iapj/demo/');
 assert.equal(iapj.thumbnail_url,'https://themes.example.test/previews/iapj.webp');
 assert.equal(iapj.download_url,null);
 assert.equal(iapj.purchasable,false);
 assert.equal(future.preview_ready,false);
 assert.equal(future.preview_url,null);
});

test('Local site dashboard uses the Theme Store-backed browser and no SDK theme names',()=>{
 const html=fs.readFileSync(new URL('store.html',root),'utf8');
 const code=fs.readFileSync(new URL('js/theme-product-browser.js',root),'utf8');
 assert.match(html,/Browse Templates/);
 assert.match(html,/theme-product-browser\.js/);
 assert.match(code,/\/api\/admin\/theme-products/);
 assert.match(code,/Explore preview/);
 assert.match(code,/noopener noreferrer/);
 assert.match(code,/themes\.inneranimalmedia\.com/);
 assert.match(code,/Browse published themes from Theme Store/);
 assert.doesNotMatch(code,/Heuristic|Resolve|plain-jane|Plain Jane|Violet/);
 assert.doesNotMatch(code,/theme-marketplace-dialog/);
 assert.doesNotMatch(code,/fetch\([^)]*\/publish/);
});

test('Local preview staging discovers releases and routes from Theme Store rather than a slug allowlist',()=>{
 const server=fs.readFileSync(new URL('../../scripts/preview-sdk-showcase.mjs',import.meta.url),'utf8');
 const stage=fs.readFileSync(new URL('../../../local-studio/scripts/stage-console-host.mjs',import.meta.url),'utf8');
 const sync=fs.readFileSync(new URL('../../../local-studio/scripts/sync-theme-store-previews.mjs',import.meta.url),'utf8');
 assert.match(server,/themePreviewRoot/);
 assert.match(server,/listThemeStoreProducts/);
 assert.match(server,/\/themes\/([a-z][a-z0-9-]{0,62})\/demo/);
 assert.doesNotMatch(server,/journalManifest|journalRoot|plain-jane\/demo|listLocalThemeProducts/);
 assert.match(stage,/listThemeStoreProducts/);
 assert.match(stage,/readdirSync\(previewSource/);
 assert.doesNotMatch(stage,/\['resolve',\s*'violet',\s*'plain-jane'\]/);
 assert.match(sync,/agentsam\.website-theme-install-index\.v1/);
 assert.match(sync,/api\/install-index/);
 assert.match(sync,/Theme Store catalog\/index release mismatch/);
 assert.match(sync,/SHA-256 mismatch/);
 assert.doesNotMatch(sync,/theme-store-previews\.json|const pins|plain-jane|resolve.*2\.6\.13/);
});
