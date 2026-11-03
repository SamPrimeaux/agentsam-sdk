/**
 * Browser-level proof that the real source-rendered project is editable,
 * keeps the original storefront markup and survives adapter rehydration.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const product=JSON.parse(await readFile(
  root+'/apps/ecommerce-cms-agentsam/frontend/static/data/site-theme-projects/plain-jane-0.1.0.json','utf8'));
const index=JSON.parse(await readFile(
  root+'/apps/ecommerce-cms-agentsam/frontend/static/data/site-theme-projects/index.json','utf8'));
const entry=index.packages.find(p=>p.slug==='plain-jane'&&p.version==='0.1.0');
assert.equal(entry.sha256,product.sourceReleaseSha256);
assert.equal(entry.page_count,product.pages.length);
assert.ok(product.pages.length>=5);
assert.ok(product.pages.every(page=>page.sections.length>0 &&
  page.sections.some(section=>(section.schema.fields||[]).length>0 ||
    (section.schema.blocks||[]).some(block=>block.fields.length>0))));
assert.ok(product.pages.every(page=>!page.template.includes('type="module"')));

const source=await readFile(root+'/apps/ecommerce-cms-agentsam/frontend/theme-editor/project.mjs','utf8');
const browser=await chromium.launch({
  executablePath:process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless:true,
});
try {
  const page=await browser.newPage();
  await page.route('**/__agentsam_test_renderer.mjs',r=>r.fulfill({
    status:200,contentType:'text/javascript',body:source,
  }));
  await page.goto(product.sourcePreviewUrl,{waitUntil:'domcontentloaded'});
  const result=await page.evaluate(async project=>{
    const {validateThemeProject,createThemeProjectAdapter,renderThemePage}=
      await import('/__agentsam_test_renderer.mjs');
    const initial=validateThemeProject(project);
    const original=renderThemePage(initial.pages[0],{});
    if(!original.includes('The Art of Slow Travel'))throw Error('original_content_missing');
    let persisted=structuredClone(initial);
    const store={
      async get(){return structuredClone(persisted);},
      async save(candidate,{expectedVersion}){
        if(expectedVersion!==Number(persisted.revision||0))throw Error('revision_conflict');
        persisted=structuredClone(candidate);
        return structuredClone(persisted);
      },
    };
    const adapter=createThemeProjectAdapter(initial,store);
    const home=await adapter.getPage('home');
    const hero=home.sections[0];
    const content=structuredClone(hero.content);
    const field=hero.schema.blocks[0].fields.find(f=>f.key==='field_2');
    if(!field)throw Error('original_card_headline_not_editable');
    content.block_1[field.key]='My own published-source blog headline';
    await adapter.saveDraft('home',hero.key,content,0);
    const first=(await adapter.resolvePreview('home')).html;
    if(!first.includes('My own published-source blog headline'))throw Error('editor_preview_not_updated');
    const reopened=createThemeProjectAdapter(await store.get(initial.id),store);
    const after=(await reopened.resolvePreview('home')).html;
    if(!after.includes('My own published-source blog headline'))throw Error('draft_lost_after_reload');
    const doc=new DOMParser().parseFromString(after,'text/html');
    return {
      revision:persisted.revision,
      sections:doc.querySelectorAll('[data-theme-section]').length,
      originalStyleSheets:doc.querySelectorAll('link[rel=stylesheet]').length,
      changedText:doc.body.innerText.includes('My own published-source blog headline'),
      savedValue:(await reopened.getPage('home')).sections[0].content.block_1.field_2,
    };
  },product);
  assert.equal(result.revision,1);
  assert.equal(result.savedValue,'My own published-source blog headline');
  assert.ok(result.sections>0);
  assert.ok(result.originalStyleSheets>0);
  assert.ok(result.changedText);
  console.log('PASS released Plain Jane project: source HTML + CSS, editable field, persisted draft and reload',result);
}finally {
  await browser.close();
}
