import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
const base=new URL('../',import.meta.url);
const json=async p=>JSON.parse(await readFile(new URL(p,base),'utf8'));
test('all design sources are packaged and addressable',async()=>{
 const m=await json('public/sources/manifest.json');
 assert.equal(m.schema,'agentsam.design-source.v1');
 assert.equal(m.boards.length,62);
 assert.ok(m.boards.filter(b=>b.category==='Desktop GPT shell').length>=4);
 for(const b of m.boards){
  assert.match(b.filename,/^[\w-]+(?:\.dc)?\.html$/);
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
});

test('Design Canvas is an independent npm-publishable app, not an SDK root workspace',async()=>{
 const pkg=await json('package.json');
 const app=await json('agentsam.app.json');
 const sdk=await json('../../package.json');
 assert.equal(pkg.name,'@inneranimalmedia/agentsam-design-canvas');
 assert.equal(pkg.version,sdk.version);
 assert.equal(app.version,pkg.version);
 assert.equal(pkg.publishConfig.access,'public');
 assert.equal(pkg.license,'FSL-1.1-MIT');
 assert.equal(sdk.workspaces.includes('apps/design-canvas'),false);
 const lock=await json('package-lock.json');
 assert.equal(lock.packages[''].version,pkg.version);
});
