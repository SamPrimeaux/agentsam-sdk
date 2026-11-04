import assert from 'node:assert/strict';
import test from 'node:test';
import {createSiteOwnedFixture as fixture} from './fixtures/site-owned-cms.mjs';
import {handleAdminCmsApi} from '../backend/cms/api.js';
import {getSiteOwnedPage} from '../backend/cms/site-owned-page-adapter.mjs';


test('existing published homepage reads authored R2 draft, saves a new private revision and preserves publication',async()=>{
  const {db,env,objects}=fixture();
  try{
    const original=await getSiteOwnedPage(env,'merchant','home','main','home');
    assert.equal(original.page.sections[0].content.headline,'Existing R2 headline');
    assert.equal(original.page.sections[0].version,0);
    const path='https://cms.test/api/admin/cms/pages/home/sections/main-hero?site_id=main&page_id=home';
    const saved=await handleAdminCmsApi(new Request(path,{
      method:'PUT',headers:{'content-type':'application/json'},
      body:JSON.stringify({content:{headline:'Edited private draft'},expected_version:0}),
    }),env,new URL(path),{accountId:'merchant'});
    const result=await saved.json();
    assert.equal(saved.status,200,JSON.stringify(result));
    assert.equal(result.ok,true);
    assert.equal(result.published,false);
    assert.equal(result.version,1);
    const row=db.prepare("SELECT draft_r2_key,published_r2_key FROM cms_page_sections WHERE id='hero'").get();
    assert.notEqual(row.draft_r2_key,'cms/sections/drafts/home/hero.json');
    assert.equal(row.published_r2_key,'cms/sections/publications/home/hero.json');
    assert.equal(JSON.parse(objects.get(row.draft_r2_key)).headline,'Edited private draft');
    assert.equal(JSON.parse(objects.get(row.published_r2_key)).headline,'Published headline');
    assert.equal(db.prepare("SELECT status FROM cms_pages WHERE id='home'").get().status,'published');
    const reopened=await getSiteOwnedPage(env,'merchant','home','main','home');
    assert.equal(reopened.page.sections[0].content.headline,'Edited private draft');
    assert.equal(reopened.page.sections[0].version,1);
    const stale=await handleAdminCmsApi(new Request(path,{
      method:'PUT',headers:{'content-type':'application/json'},
      body:JSON.stringify({content:{headline:'Old tab edit'},expected_version:0}),
    }),env,new URL(path),{accountId:'merchant'});
    assert.equal(stale.status,409);
    assert.equal((await getSiteOwnedPage(env,'merchant','home','main','home')).page.sections[0].content.headline,'Edited private draft');
    assert.equal(await getSiteOwnedPage(env,'other','home','main','home').catch(()=>null),null);
  }finally{db.close();}
});
