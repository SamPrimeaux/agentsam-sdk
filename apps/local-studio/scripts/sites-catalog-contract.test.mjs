import assert from 'node:assert/strict';
import {readFileSync,existsSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import { resolveConsoleFile } from '../backend/worker/packaged-console.js';
const studio=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=(p)=>readFileSync(path.join(studio,p),'utf8');
test('hosted Sites uses packaged Ecommerce UI and truthful missing-theme states',()=>{
 const worker=read('backend/worker/packaged-console.js');
 const html=read('../ecommerce-cms-agentsam/frontend/static/store.html');
 const js=read('../ecommerce-cms-agentsam/frontend/static/js/store.js');
 const sitesRoute=read('frontend/src/routes/(apps)/sites.tsx');
 assert.match(sitesRoute, /<Navigate to="\/apps\/ecommerce-cms-agentsam" search=\{\{ page: '\/admin\/store', \.\.\.selected \}\} replace \/>/);
 assert.match(sitesRoute, /theme_sku/);
 assert.match(sitesRoute, /theme_version/);
 assert.equal(resolveConsoleFile('/admin/store'),'store.html');
 assert.equal(resolveConsoleFile('/sites'),null);
 assert.match(html,/src="\/admin\/js\/store.js"/);
 for(const content of [js]){
  assert.match(content,/id="browse-themes-shortcut"/);
  assert.match(content,/showThemeUnavailable/);
  assert.match(content,/showActiveTheme/);
  assert.match(content,/theme\.preview_href/);
  assert.match(content,/Unverified/);
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
 assert.match(builder,/sync-theme-store-previews/);
 assert.doesNotMatch(builder,/materializeViolet|materializeJournal|theme-gallery-preview/);
 assert.match(builder,/rmSync\(compiledThemes/);
 const sync=read('scripts/sync-theme-store-previews.mjs');
 assert.match(sync,/iam\.theme-preview-files\.v1/);
 assert.match(sync,/SHA-256 mismatch/);
 assert.deepEqual(JSON.parse(read('theme-store-previews.json')),{resolve:'2.6.13',violet:'2.6.13','plain-jane':'0.1.0'});
 assert.match(builder,/installed:false,purchasable:false/);
});
test('staged product catalog and all three original preview entrypoints exist',()=>{
 const base='frontend/public/';
 for(const slug of ['violet','resolve','plain-jane'])
  assert.ok(existsSync(path.join(studio,base,'themes',slug,'demo/index.html')),slug);
 const compiledRoot=existsSync(path.join(studio,'desktop-dist/themes'))
  ? 'desktop-dist' : '.output/public';
 assert.ok(existsSync(path.join(studio,compiledRoot,'themes')),'No compiled theme preview output is available');
 assert.deepEqual(readdirSync(path.join(studio,compiledRoot,'themes')).sort(),['plain-jane','resolve','violet']);
 for(const slug of ['violet','resolve','plain-jane'])
  assert.ok(existsSync(path.join(studio,compiledRoot,'themes',slug,'demo/index.html')),slug+' compiled demo in '+compiledRoot);
 assert.ok(existsSync(path.join(studio,compiledRoot,'themes/violet/demo/global/cpas-shell.css')));
 const json=JSON.parse(read('frontend/public/ecommerce-cms-agentsam/admin/data/theme-products.json'));
 assert.equal(json.ok,true);
 assert.equal(json.products.length,3);
 for(const entry of json.products){
  assert.equal(entry.installed,false);
  assert.equal(entry.purchasable,false);
  assert.equal(entry.state,'preview_only');
  assert.match(entry.preview_url,/^\/themes\/[^/]+\/demo\/$/);
  assert.match(entry.thumbnail_url,/^\/themes\/[^/]+\/demo\//);
  const relative=entry.thumbnail_url.slice(1);
  assert.ok(existsSync(path.join(studio,'frontend/public',relative)),
    'Missing staged source-derived image for '+entry.slug);
  assert.ok(existsSync(path.join(studio,compiledRoot,relative)),
   'Missing compiled source-derived image for '+entry.slug+' in '+compiledRoot);
 }
});
