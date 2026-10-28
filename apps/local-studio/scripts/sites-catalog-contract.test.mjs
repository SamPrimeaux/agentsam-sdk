import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
const studio=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=(p)=>readFileSync(path.join(studio,p),'utf8');
test('hosted Sites uses packaged Ecommerce UI and truthful missing-theme states',()=>{
 const worker=read('backend/worker/packaged-console.js');
 const html=read('../ecommerce-cms-agentsam/frontend/static/store.html');
 const js=read('../ecommerce-cms-agentsam/frontend/static/js/store.js');
 assert.match(worker,/pathname === "\/sites"/);
 for(const content of [html,js]){
  assert.match(content,/id="browse-themes-shortcut"/);
  assert.match(content,/showThemeUnavailable/);
  assert.match(content,/showActiveTheme/);
  assert.match(content,/theme\?\.preview_href && theme\?\.name/);
  assert.match(content,/id="active-theme-status">Checking…/);
  assert.doesNotMatch(content,/id="active-theme-status">Active/);
 }
});
test('hosted theme catalog is authenticated and read-only',()=>{
 const worker=read('backend/worker/index.js');
 const builder=read('scripts/stage-console-host.mjs');
 assert.match(worker,/\/api\/admin\/theme-products/);
 assert.match(worker,/await resolveSessionUser\(request, env\)/);
 assert.match(worker,/error:'unauthorized'/);
 assert.match(worker,/admin\/data\/theme-products.json/);
 assert.match(builder,/listLocalThemeProducts/);
 assert.match(builder,/materializeViolet/);
 assert.match(builder,/materializeJournal/);
 assert.match(builder,/installed:false,purchasable:false/);
});
test('staged product catalog and all three original preview entrypoints exist',()=>{
 const base='frontend/public/';
 for(const slug of ['violet','resolve','plain-jane'])
  assert.ok(existsSync(path.join(studio,base,'themes',slug,'demo/index.html')),slug);
 for(const slug of ['violet','resolve','plain-jane'])
  assert.ok(existsSync(path.join(studio,'.output/public/themes',slug,'demo/index.html')),slug+' compiled demo');
 assert.ok(existsSync(path.join(studio,'.output/public/themes/violet/demo/global/cpas-shell.css')));
 const json=JSON.parse(read(base+'ecommerce-cms-agentsam/admin/data/theme-products.json'));
 assert.equal(json.ok,true);
 assert.equal(json.products.length,3);
 for(const entry of json.products){
  assert.equal(entry.installed,false);
  assert.equal(entry.purchasable,false);
  assert.equal(entry.state,'preview_only');
  assert.match(entry.preview_url,/^\/themes\/[^/]+\/demo\/$/);
 }
});
