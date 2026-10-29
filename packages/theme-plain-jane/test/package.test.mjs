import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createTheme} from '../src/index.js';
import {materializePrebuild,resolvePrebuildRoot} from '../src/node.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'site/journal-cms-manifest.json'),'utf8'));
test('The compiled original journal is a portable, read-only CMS starter',()=>{
 assert.equal(createTheme().slug,'plain-jane');
 assert.equal(createTheme().installable,false);
 assert.equal(manifest.pages.length,9);
 assert.equal(manifest.definitions.length,18);
 assert.ok(manifest.pages.every(p=>p.sections.length && p.sections.every(s=>s.id===s.key)));
 assert.ok(manifest.pages.some(p=>p.path==='post/the-art-of-slow-travel'));
 assert.ok(fs.existsSync(path.join(resolvePrebuildRoot(),'images/cover-slow-travel.svg')));
 assert.match(fs.readFileSync(path.join(root,'site/index.html'),'utf8'),/index-.*\.js/);
});
test('Materialization preserves original source and deep links and respects subdirectory base path',()=>{
 const target=fs.mkdtempSync(path.join(os.tmpdir(),'agentsam-journal-test-'));
 try{
  const install=materializePrebuild(path.join(target,'site'),{basePath:'/customer/blog'});
  assert.equal(install.basePath,'/customer/blog/');
  assert.equal(install.pages,9);
  assert.throws(()=>materializePrebuild(path.join(target,'site')),/already exists/);
  const html=fs.readFileSync(path.join(target,'site/index.html'),'utf8');
  assert.match(html,/\/customer\/blog\/assets\//);
  for(const route of ['about','photography','post/the-art-of-slow-travel','post/analog-photography-digital-age'])
   assert.ok(fs.existsSync(path.join(target,'site',route,'index.html')),route);
  assert.ok(fs.existsSync(path.join(resolvePrebuildRoot(),'journal-cms-manifest.json')));
  assert.throws(()=>materializePrebuild(null),/target/);
 }finally{fs.rmSync(target,{recursive:true,force:true});}
});
test('Product cannot be misrepresented as published or distributed',()=>{
 const product=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
 const provenance=JSON.parse(fs.readFileSync(path.join(root,'provenance.json'),'utf8'));
 assert.equal(product.private,true);
 assert.equal(product.license,'UNLICENSED');
 assert.equal(provenance.publishApproved,false);
 assert.match(provenance.commit,/^[a-f0-9]{40}$/);
});
