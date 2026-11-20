import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {listThemeStoreProducts} from '../../../packages/catalog/src/theme-products.mjs';

const root=new URL('../frontend/static/',import.meta.url);
const hash='a'.repeat(64);
const published=(slug,name,cardImage,previewUrl='https://themes.example.test/themes/'+slug+'/presets/'+slug+'/demo/')=>({
 slug,sku:'iam.theme.'+slug,name,category:'Editorial',summary:name+' from Theme Store',
 publisher:'InnerAnimalMedia',version:'0.3.0',cardImage,previewUrl,
 release:{status:'published',sha256:hash,storageKey:'releases/'+slug+'/0.3.0/'+hash+'.zip'}
});

test('SDK reads Theme Store catalog metadata and links directly to owner-hosted previews without local files',async()=>{
 const catalog={
  ok:true,schema:'iam.theme-catalog.v1',
  products:[
   published('iapj','InnerAnimal Plain Jane','/previews/iapj.webp'),
   published('future-theme','Future Theme','/previews/future-theme.webp'),
   published('untrusted-preview','Untrusted Preview','/previews/untrusted.webp','https://attacker.example/preview/'),
   {...published('preview-only','Preview Only','/previews/preview.webp'),release:{status:'preview',sha256:hash,storageKey:'releases/preview-only/0.3.0/'+hash+'.zip'}}
  ]
 };
 let requestedUrl='';
 const entries=await listThemeStoreProducts({
  storeUrl:'https://themes.example.test',
  fetcher:async input=>{
   requestedUrl=String(input);
   return new Response(JSON.stringify(catalog),{status:200,headers:{'content-type':'application/json'}});
  }
 });
 assert.equal(requestedUrl,'https://themes.example.test/api/catalog');
 assert.deepEqual(entries.map(entry=>entry.slug),['iapj','future-theme','untrusted-preview']);
 const iapj=entries.find(entry=>entry.slug==='iapj');
 const future=entries.find(entry=>entry.slug==='future-theme');
 const untrusted=entries.find(entry=>entry.slug==='untrusted-preview');
 assert.equal(iapj.source,'Theme Store');
 assert.equal(iapj.preview_ready,true);
 assert.equal(iapj.preview_url,'https://themes.example.test/themes/iapj/presets/iapj/demo/');
 assert.equal(iapj.thumbnail_url,'https://themes.example.test/previews/iapj.webp');
 assert.equal(iapj.download_url,null);
 assert.equal(iapj.purchasable,false);
 assert.equal(future.preview_ready,true);
 assert.equal(future.preview_url,'https://themes.example.test/themes/future-theme/presets/future-theme/demo/');
 assert.equal(untrusted.preview_ready,false);
 assert.equal(untrusted.preview_url,null);
});

test('Local site dashboard links preview and installation actions to Theme Store',()=>{
 const html=fs.readFileSync(new URL('store.html',root),'utf8');
 const code=fs.readFileSync(new URL('js/theme-product-browser.js',root),'utf8');
 assert.match(html,/website-theme-browser\.js/);
 assert.match(html,/theme-product-browser\.js/);
 assert.match(code,/\/api\/admin\/theme-products/);
 assert.match(code,/Explore preview/);
 assert.match(code,/noopener noreferrer/);
 assert.match(code,/themeStorePreviewUrl/);
 assert.match(code,/themes\.inneranimalmedia\.com/);
 assert.match(code,/Browse published themes from Theme Store/);
 assert.doesNotMatch(code,/Heuristic|Resolve|plain-jane|Plain Jane|Violet/);
 assert.doesNotMatch(code,/theme-marketplace-dialog/);
 assert.doesNotMatch(code,/fetch\([^)]*\/publish/);
});

test('SDK preview showcase redirects previews to Theme Store and never reads a local theme mirror',()=>{
 const server=fs.readFileSync(new URL('../scripts/preview-sdk-showcase.mjs',import.meta.url),'utf8');
 const stage=fs.readFileSync(new URL('../../local-studio/scripts/stage-console-host.mjs',import.meta.url),'utf8');
 assert.match(server,/listThemeStoreProducts/);
 assert.match(server,/res\.writeHead\(302,\{Location:target\.href/);
 assert.doesNotMatch(server,/themePreviewRoot|localStudioRoot/);
 assert.match(stage,/removeThemeStorePreviewMirrors/);
 assert.match(stage,/Theme Store previews remain externally served/);
 assert.doesNotMatch(stage,/sync-theme-store-previews|listThemeStoreProducts/);
 assert.match(stage,/admin\/data\/theme-products\.json/);
});
