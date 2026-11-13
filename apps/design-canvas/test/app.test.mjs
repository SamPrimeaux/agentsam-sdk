import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
const base=new URL('../',import.meta.url);
const json=async p=>JSON.parse(await readFile(new URL(p,base),'utf8'));
test('all design sources are packaged and addressable',async()=>{
 const m=await json('public/sources/manifest.json');
 assert.equal(m.schema,'agentsam.design-source.v1');
 assert.equal(m.boards.length,75);
 assert.equal(m.boards.filter(b=>b.family==='stock').length,13);
 assert.ok(m.boards.filter(b=>b.category==='Desktop GPT shell').length>=4);
 for(const b of m.boards){
  assert.match(b.filename,b.family==='stock'?/^[a-z0-9-]+\/[\w-]+(?:\.dc)?\.html$/:/^[\w-]+(?:\.dc)?\.html$/);
  const file=new URL('public/sources/'+b.family+'/'+b.filename,base);
  const content=await readFile(file,'utf8');
  assert.match(content,/<body/);
  assert.ok(b.width>=320&&b.height>=320);
 }
});
test('standalone package declares a real build contract',async()=>{
 const app=await json('agentsam.app.json');
 assert.equal(app.schema,'agentsam.app.v1');
 assert.equal(app.embed.stage,'design-canvas');
 assert.equal(app.runtime.hosted_install,'requires-deployment-and-account-install');
});
test('built app includes preview and all sources',async()=>{
 const entry=await readFile(new URL('dist/index.html',base),'utf8');
 assert.match(entry,/app.js/);
 await stat(new URL('dist/sources/agentsam/Shell.dc.html',base));
 await stat(new URL('dist/sources/onboarding/AppInstalled.dc.html',base));
 await stat(new URL('dist/sources/stock/design-theme-settings/DesignCanvasSettings.dc.html',base));
});

test('published APP stays independently versioned and outside the SDK root workspaces',async()=>{
 const pkg=await json('package.json');
 const app=await json('agentsam.app.json');
 const sdk=await json('../../package.json');
 const lock=await json('package-lock.json');
 assert.equal(pkg.name,'@inneranimalmedia/agentsam-design-canvas');
 assert.equal(pkg.releaseTrain,'independent');
 assert.equal(pkg.publishConfig.access,'public');
 assert.equal(pkg.license,'FSL-1.1-MIT');
 assert.equal(app.version,pkg.version);
 assert.equal(lock.packages[''].version,pkg.version);
 assert.equal(sdk.workspaces.some(name=>name.startsWith('apps/')),false);
});

test('all 13 stock source packages are intact, correctly hashed and safe',async()=>{
 const catalog=await json('public/sources/stock/catalog.json');
 const m=await json('public/sources/manifest.json');
 assert.equal(catalog.schema,'agentsam.platform-stock.v1');
 assert.equal(catalog.storage,'theme-store');
 assert.equal(catalog.items.length,13);
 const {createHash}=await import('node:crypto');
 const seen=new Set();
 for(const item of catalog.items){
  assert.match(item.slug,/^[a-z0-9-]+$/);
  assert.ok(!seen.has(item.slug));seen.add(item.slug);
  const board=m.boards.find(b=>b.stock_asset_id===item.id);
  assert.ok(board,'missing board for '+item.slug);
  assert.equal(board.source_sha256,item.main_sha256);
  for(const file of item.files){
   assert.match(file.path,/^(?:vendor\/)?[A-Za-z0-9_.-]+$/);
   assert.match(file.r2_key,/^cms\/design-stock\/v1\//);
   const buffer=await readFile(new URL('public/sources/stock/'+item.slug+'/'+file.path,base));
   assert.equal(buffer.byteLength,file.bytes);
   assert.equal(createHash('sha256').update(buffer).digest('hex'),file.sha256);
  }
 }
});
