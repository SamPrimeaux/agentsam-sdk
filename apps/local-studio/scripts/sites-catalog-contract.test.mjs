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
 assert.match(sitesRoute, /<Navigate to="\/admin\/store" search=\{selected\} replace \/>/);
 assert.match(sitesRoute, /theme_sku/);
 assert.match(sitesRoute, /theme_version/);
 // /admin/store now owns the authenticated installed shell; the iframe
 // consumes the same product's packaged store.html asset, never this route.
 assert.equal(resolveConsoleFile('/admin/store'),null);
 assert.doesNotMatch(read('frontend/src/routes/(apps)/admin/store.tsx'), /forcePackagedAsset/);
 assert.match(read('frontend/src/routes/(apps)/apps/ecommerce-cms-agentsam.tsx'), /resolveEcommerceAssetPath\(page\)/);
 assert.match(read('scripts/stage-settings-shell.mjs'), /studioApps=\['store'/);
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
 assert.match(builder,/listThemeStoreProducts/);
 assert.match(builder,/readdirSync\(previewSource/);
 assert.match(builder,/sync-theme-store-previews/);
 assert.doesNotMatch(builder,/materializeViolet|materializeJournal|theme-gallery-preview/);
 assert.match(builder,/rmSync\(compiledThemes/);
 const sync=read('scripts/sync-theme-store-previews.mjs');
 assert.match(sync,/agentsam\.website-theme-install-index\.v1/);
 assert.match(sync,/api\/install-index/);
 assert.match(sync,/Theme Store catalog\/index release mismatch/);
 assert.match(sync,/iam\.theme-preview-files\.v1/);
 assert.match(sync,/SHA-256 mismatch/);
 assert.doesNotMatch(sync,/const pins|theme-store-previews\.json|plain-jane|resolve.*2\.6\.13/);
 assert.deepEqual(JSON.parse(read('theme-store-previews.json')),{});
 assert.match(builder,/installed:false,purchasable:false/);
});
test('staged product catalog and every published Theme Store preview entrypoint exist',()=>{
 const base='frontend/public/';
 const json=JSON.parse(read('frontend/public/ecommerce-cms-agentsam/admin/data/theme-products.json'));
 assert.equal(json.ok,true);
 assert.ok(json.products.length>0);
 const slugs=json.products.map(entry=>entry.slug);
 for(const slug of slugs)
  assert.ok(existsSync(path.join(studio,base,'themes',slug,'demo/index.html')),slug);
 const compiledRoot=existsSync(path.join(studio,'desktop-dist/themes'))
  ? 'desktop-dist' : '.output/public';
 assert.ok(existsSync(path.join(studio,compiledRoot,'themes')),'No compiled theme preview output is available');
 const compiledSlugs=readdirSync(path.join(studio,compiledRoot,'themes'));
 for(const slug of slugs) assert.ok(compiledSlugs.includes(slug),slug+' compiled demo directory in '+compiledRoot);
 for(const slug of slugs)
  assert.ok(existsSync(path.join(studio,compiledRoot,'themes',slug,'demo/index.html')),slug+' compiled demo in '+compiledRoot);
 for(const entry of json.products){
  assert.equal(entry.installed,false);
  assert.equal(entry.purchasable,false);
  assert.equal(entry.state,'preview_only');
  assert.match(entry.preview_url,/^\/themes\/[^/]+\/demo\/$/);
  assert.equal(entry.source,'Theme Store');
  assert.ok(entry.thumbnail_url===null || entry.thumbnail_url.startsWith('https://themes.inneranimalmedia.com/'));
 }
});
