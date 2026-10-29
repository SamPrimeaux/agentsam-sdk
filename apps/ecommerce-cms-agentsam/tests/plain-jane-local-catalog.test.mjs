import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {listLocalThemeProducts} from '../../../packages/catalog/src/theme-products.mjs';
const root=new URL('../frontend/static/',import.meta.url);
test('SDK catalog lists original themes without claiming live install or checkout',async()=>{
 const entries=await listLocalThemeProducts();
 assert.ok(entries.length>=3);
 const journal=entries.find(entry=>entry.slug==='plain-jane');
 assert.ok(journal);
 assert.equal(journal.preview_ready,true);
 assert.equal(journal.installed,false);
 assert.equal(journal.purchasable,false);
 assert.equal(journal.install_status,'not_connected');
 assert.match(journal.editor_url,/showcase=plain-jane/);
 assert.match(journal.download_url,/plain-jane\/download$/);
 assert.equal(journal.download_kind,'preview_zip');
 for(const entry of entries)assert.ok(entry.preview_url&&entry.editor_url);
});
test('Local site dashboard has a functional template browser and never a pretend publish CTA',()=>{
 const html=fs.readFileSync(new URL('store.html',root),'utf8');
 const code=fs.readFileSync(new URL('js/theme-product-browser.js',root),'utf8');
 assert.match(html,/Browse Templates/);
 assert.match(html,/theme-product-browser\.js/);
 assert.match(code,/\/api\/admin\/theme-products/);
 assert.match(code,/Explore preview/);
 assert.match(code,/noopener noreferrer/);
 assert.doesNotMatch(code,/theme-marketplace-dialog/);
 assert.doesNotMatch(code,/fetch\([^)]*\/publish/);
});
test('Local studio recognizes Journal preview without altering tenant authoring routes',()=>{
 const editor=fs.readFileSync(new URL('js/theme-editor.js',root),'utf8');
 const server=fs.readFileSync(new URL('../../scripts/preview-sdk-showcase.mjs',root),'utf8');
 assert.match(editor,/journalShowcase/);
 assert.match(editor,/Plain Jane Journal/);
 assert.match(editor,/journal-the-art-of-slow-travel/);
 assert.match(server,/journal-cms-manifest\.json/);
 assert.match(server,/preview_only:true/);
});
