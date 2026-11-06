/**
 * Exercise every installed, source-backed CMS project in the local install
 * index. No fixed theme names, no fixture pages, no persistent account writes.
 * Each page must survive a real editor-adapter save, preview and reload.
 *
 * Optional INSTALL_PROJECT_DIR: path to reviewed install projects + index.json.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const dir=process.env.INSTALL_PROJECT_DIR || join(root,'apps/ecommerce-cms-agentsam/frontend/static/data/site-theme-projects');
const index=JSON.parse(await readFile(join(dir,'index.json'),'utf8'));
assert.equal(index.schema,'agentsam.website-theme-install-index.v1');
assert.ok(index.packages?.length>0,'No reviewed CMS install projects found');
const moduleSource=await readFile(join(root,'apps/ecommerce-cms-agentsam/frontend/theme-editor/project.mjs'),'utf8');
const browser=await chromium.launch({
 executablePath:process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
 headless:true,
});
let totalPages=0;
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}});
 await page.route('**/__agentsam_test_renderer.mjs',r=>r.fulfill({status:200,contentType:'text/javascript',body:moduleSource}));
 for(const entry of index.packages){
  const project=JSON.parse(await readFile(join(dir,entry.slug+'-'+entry.version+'.json'),'utf8'));
  assert.equal(project.sourceThemeId,entry.slug);
  assert.equal(project.sourcePackageVersion,entry.version);
  assert.equal(project.sourceReleaseSha256,entry.sha256);
  assert.equal(project.pages.length,entry.page_count);
  assert.ok(project.pages.every(p=>p.sections.length&&p.sections.some(s=>
    s.schema.fields?.length||s.schema.blocks?.some(b=>b.fields?.length))));
  assert.ok(project.pages.every(p=>!p.template.includes('type="module"')));
  const response=await page.goto(project.sourcePreviewUrl,{waitUntil:'domcontentloaded',timeout:20000});
  assert.ok(response?.ok(),'Release preview unavailable: '+entry.slug);
  const result=await page.evaluate(async project=>{
   const {validateThemeProject,createThemeProjectAdapter,renderThemePage}=
     await import('/__agentsam_test_renderer.mjs');
   const initial=validateThemeProject(project);
   const originalIdentity=[initial.id,initial.sourceThemeId,initial.sourcePackageVersion,initial.sourceReleaseSha256];
   let persisted=structuredClone(initial);
   const store={
    async get(){return structuredClone(persisted);},
    async save(candidate,{expectedVersion}){
     if(expectedVersion!==Number(persisted.revision||0))throw Error('revision_conflict');
     persisted=structuredClone(candidate);
     return structuredClone(persisted);
    }
   };
   const adapter=createThemeProjectAdapter(initial,store);
   const marks=[];
   for(const sourcePage of initial.pages){
    const current=await adapter.getPage(sourcePage.slug);
    const candidates=current.sections.flatMap(s=>(s.schema.fields||[])
      .filter(f=>f.type==='text'&&typeof s.content[f.key]==='string')
      .map(f=>({section:s,field:f,rank:(s.zone==='BODY'?0:2)+(f.group==='Content'?0:1)})));
    candidates.sort((a,b)=>a.rank-b.rank);
    const choice=candidates[0];
    if(!choice)throw Error('no_editable_body_field:'+sourcePage.slug);
    const marker='QA '+project.sourceThemeId+' '+sourcePage.slug+' persistence check';
    const content=structuredClone(choice.section.content);
    content[choice.field.key]=marker;
    await adapter.saveDraft(sourcePage.slug,choice.section.key,content,Number(choice.section.version||0));
    const before=(await adapter.resolvePreview(sourcePage.slug)).html;
    if(!before.includes(marker))throw Error('edited_field_not_rendered:'+sourcePage.slug);
    marks.push({slug:sourcePage.slug,marker});
   }
   const reopened=createThemeProjectAdapter(await store.get(initial.id),store);
   for(const {slug,marker} of marks){
    const preview=(await reopened.resolvePreview(slug)).html;
    if(!preview.includes(marker))throw Error('persisted_field_lost:'+slug);
    if(!preview.includes('data-cms-section'))throw Error('source_sections_missing:'+slug);
   }
   const final=await reopened.getProject();
   if(originalIdentity.some((item,i)=>item!==[
     final.id,final.sourceThemeId,final.sourcePackageVersion,final.sourceReleaseSha256][i]))
     throw Error('release_identity_changed');
   if(final.pages.length!==initial.pages.length)throw Error('page_count_changed');
   return {edited:marks.length,revision:final.revision,
     sourceOrigins:[...new Set(initial.pages.map(p=>p.sourceOrigin||'rendered'))]};
  },project);
  assert.equal(result.edited,project.pages.length);
  assert.equal(result.revision,project.pages.length);
  totalPages+=result.edited;
  console.log('PASS',entry.slug,entry.version,'edited/reopened',result.edited,'pages','origins',result.sourceOrigins.join(','));
 }
 console.log('PASS',index.packages.length,'verified release projects;',totalPages,'edited pages and saved/reopened drafts');
}finally{await browser.close();}
