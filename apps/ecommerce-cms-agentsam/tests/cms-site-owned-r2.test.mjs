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

test('one unsupported section source does not blank the site-owned page or overwrite its R2 reference', async () => {
  const {db,env,objects} = fixture();
  try {
    db.prepare("INSERT INTO cms_page_sections (id,page_id,section_key,section_type,section_name,section_data,sort_order,is_visible,r2_bucket,draft_r2_key) VALUES (?,?,?,?,?,?,?,?,?,?)")
      .run('legacy-source','home','legacy-source','html_source','Legacy source','{}',1,1,
        'inneranimalmedia','cms/ws_inneranimalmedia/sections/legacy/published.html');
    const opened = await getSiteOwnedPage(env,'merchant','home','main','home');
    assert.equal(opened.ok,true);
    assert.equal(opened.page.sections[0].content.headline,'Existing R2 headline');
    assert.deepEqual(opened.page.missing_source_sections,['legacy-source']);
    const legacy = opened.page.sections.find(section => section.key==='legacy-source');
    assert.equal(legacy.read_only,true);
    assert.equal(legacy.source_error,'cms_section_bucket_unavailable');
    const row=db.prepare("SELECT r2_bucket,draft_r2_key FROM cms_page_sections WHERE id='legacy-source'").get();
    assert.equal(row.r2_bucket,'inneranimalmedia');
    assert.equal(row.draft_r2_key,'cms/ws_inneranimalmedia/sections/legacy/published.html');
    assert.equal(objects.get('cms/sections/drafts/home/hero.json'), JSON.stringify({headline:'Existing R2 headline'}));
  } finally { db.close(); }
});

test("site-owned catalog resources install a private draft and refuse foreign page IDs", async () => {
  const {db,env} = fixture();
  const url = new URL("https://cms.test/api/admin/cms/pages/home/catalog-resources?site_id=main&page_id=home");
  const request = (method, target = url, body) => handleAdminCmsApi(
    new Request(target, {method, ...(body ? {body: JSON.stringify(body)} : {})}), env, target, {accountId:"merchant"},
  );
  try {
    const empty = await request("GET");
    assert.equal(empty.status, 200);
    assert.deepEqual((await empty.json()).installed, []);

    const result = await request("POST", url, {catalogKey:"announcement_bar", toIndex:0});
    assert.equal(result.status, 201);
    const added = await result.json();
    const read = await (await request("GET")).json();
    assert.deepEqual(read.installed.map(section => section.section_key), [added.section_key]);
    assert.equal(read.installed[0].version, 1);
    assert.equal(db.prepare("SELECT status FROM cms_pages WHERE id='home'").get().status, "published");
    assert.equal(db.prepare("SELECT block_key FROM cms_section_blocks").get().block_key, "embed-root");
    assert.equal(db.prepare("SELECT section_key FROM cms_page_sections ORDER BY sort_order").get().section_key, added.section_key);
    const foreign = new URL(url);
    foreign.searchParams.set("page_id", "otherhome");
    assert.equal((await request("GET", foreign)).status, 404);
    assert.equal((await request("POST", foreign, {catalogKey:"announcement_bar"})).status, 404);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM cms_section_blocks").get().count, 1);
  } finally { db.close(); }
});

test("the global CMS document is initialized once for its authorized site", async () => {
  const {db,env} = fixture();
  const url = new URL("https://cms.test/api/admin/cms/pages/site?site_id=main");
  const read = target => handleAdminCmsApi(new Request(target), env, target, {accountId:"merchant"});
  try {
    const first = await read(url);
    assert.equal(first.status, 200);
    const document = (await first.json()).page;
    assert.equal(document.page_type, "global");
    assert.equal(document.nav_visible, false);
    assert.equal((await (await read(url)).json()).page.id, document.id);
    const foreign = new URL(url);
    foreign.searchParams.set("site_id", "foreign");
    assert.equal((await read(foreign)).status, 404);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM cms_pages WHERE slug='site'").get().count, 1);
  } finally { db.close(); }
});
