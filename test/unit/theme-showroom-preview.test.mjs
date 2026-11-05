import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=(path)=>readFileSync(path,'utf8');
test('hosted gallery and local gallery support interactive desktop tablet mobile previews',()=>{
 const hosted=source('scripts/stage-themes-to-site.mjs');
 const local=source('apps/theme-gallery-preview/app.py');
 const js=source('apps/theme-gallery-preview/gallery/static/app.js');
 const css=source('apps/theme-gallery-preview/gallery/static/styles.css');
 for(const file of [hosted,local]){
   for(const device of ['desktop','tablet','mobile']) assert.ok(file.includes(`data-device="${device}"`));
   assert.match(file,/preview-frame/);
 }
 assert.match(js,/wrap\.classList\.toggle\('tablet'/);
 assert.match(js,/wrap\.classList\.toggle\('mobile'/);
 assert.match(js,/aria-pressed/);
 assert.match(css,/\.preview-frame-wrap\.tablet\{/);
 assert.match(css,/\.preview-frame-wrap\.mobile\{/);
});
test('preview cards reveal affordance on hover or keyboard focus without disabling full demo interactions',()=>{
 const css=source('apps/theme-gallery-preview/gallery/static/styles.css');
 const hosted=source('scripts/stage-themes-to-site.mjs');
 assert.match(css,/\.theme-card:focus-visible/);
 assert.match(css,/Explore live preview/);
 assert.match(css,/filter:blur\(4px\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(hosted,/Open full site/);
 assert.match(hosted,/\/demo\//);
 assert.match(css,/\.preview-frame\{/);
});
