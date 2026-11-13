import assert from 'node:assert/strict';
import test from 'node:test';
import { createCmsTestDb } from '../../tests/cms-test-db.mjs';
import { heuristicStarterPreset } from '@inneranimalmedia/theme-heuristic/commerce/starter';
import { materializeStarterProject, blankThemeProject } from '../../frontend/theme-editor/starter-project.mjs';
import { ensureCmsSiteStarter } from './site-starter.mjs';
import { getThemeProject, saveThemeProject, installThemeDraft, createThemeProject } from './theme-project-store.mjs';
import { handleStudioSitesOverview } from '../../../local-studio/backend/worker/studio-sites-overview.js';

function environment(db) {
  const objects = new Map();
  const env = {
    DB: { prepare(sql) {
      let params=[];
      const statement={
        bind(...values){params=values;return statement;},
        async first(){return db.prepare(sql).get(...params)||null;},
        async all(){return {results:db.prepare(sql).all(...params)};},
        async run(){const result=db.prepare(sql).run(...params);return {meta:{changes:result.changes}};},
      };
      return statement;
    }},
    WEBSITE_ASSETS: {
      async put(key,body){objects.set(key,String(body));},
      async get(key){return objects.has(key)?{text:async()=>objects.get(key)}:null;},
    },
  };
  return {env,objects};
}
const storeRequest=(siteId=null)=>new Request('https://cms.test/api/admin/store/online'+
  (siteId?'?site_id='+encodeURIComponent(siteId):''));

test('first visit resolves a site without silently installing a theme; explicit installation remains editable',async()=>{
  const db=createCmsTestDb();
  const {env,objects}=environment(db);
  try {
    db.prepare("INSERT INTO accounts(id) VALUES ('fresh')").run();
    const first=await handleStudioSitesOverview(storeRequest(),env,'fresh');
    assert.equal(first.status,200);
    let overview=await first.json();
    assert.equal(overview.setup_required,false);
    assert.equal(overview.site_selection_required,false);
    assert.ok(overview.selected_site_id);
    assert.equal(overview.preview_theme,null);
    assert.equal(objects.size,0,'viewing the library must not install a theme');
    assert.equal((await ensureCmsSiteStarter(env,'fresh',overview.selected_site_id)).ok,true);
    overview=await (await handleStudioSitesOverview(storeRequest(overview.selected_site_id),env,'fresh')).json();
    assert.equal(overview.preview_theme.installed,true);
    assert.match(overview.preview_theme.edit_href,/theme-project-editor\?project=theme_heuristic&site_id=/);
    const saved=await getThemeProject(env,'fresh','theme_heuristic',overview.selected_site_id);
    assert.equal(saved.ok,true);
    assert.deepEqual(saved.project.pages.map(p=>p.slug),['home','shop','about']);
    assert.match(saved.project.pages[0].sections.find(s=>s.key==='section_1').content.heading,/Default site/);
    assert.deepEqual(saved.project.pages[0].sections.filter(s=>s.globalKey).map(s=>s.key),
      ['announcement_bar','site_header','site_footer','promotion_popup']);
    assert.equal(saved.project.pages[0].sections[0].content.announcement_1.text,'Welcome to our store');
    assert.equal(saved.project.sourcePackage,'@inneranimalmedia/theme-heuristic');
    assert.ok(objects.size>=2,'D1 points at real R2-stored manifest and revision');
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM cms_revisions WHERE account_id='fresh'").get().n,1);
    const repeated=await (await handleStudioSitesOverview(storeRequest(),env,'fresh')).json();
    assert.equal(repeated.preview_theme.edit_href,overview.preview_theme.edit_href);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM cms_globals WHERE account_id='fresh'").get().n,1);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM cms_revisions WHERE account_id='fresh'").get().n,1);
  } finally {db.close();}
});

test('site recovery is idempotent and never overwrites merchant edits or another site',async()=>{
  const db=createCmsTestDb();
  const {env}=environment(db);
  try {
    db.exec(`INSERT INTO accounts(id) VALUES ('merchant'),('other');
      INSERT INTO cms_sites(id,account_id,name,slug,status,is_default)
      VALUES ('shop','merchant','My Shop','shop','active',0),
             ('blog','merchant','My Blog','blog','active',0),
             ('foreign','other','Another Company','foreign','active',1)`);
    const automaticallySelected=await (await handleStudioSitesOverview(storeRequest(),env,'merchant')).json();
    assert.equal(automaticallySelected.site_selection_required,false);
    assert.equal(automaticallySelected.selected_site_id,'blog');
    assert.equal(automaticallySelected.preview_theme,null);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM cms_globals WHERE account_id='merchant'").get().n,0);
    assert.equal((await ensureCmsSiteStarter(env,'merchant','blog')).ok,true);
    const first=await (await handleStudioSitesOverview(storeRequest('blog'),env,'merchant')).json();
    assert.equal(first.preview_theme.installed,true);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM cms_globals WHERE account_id='merchant'").get().n,1);
    const original=(await getThemeProject(env,'merchant','theme_heuristic','blog')).project;
    original.pages[0].sections.find(s=>s.key==='section_1').content.heading='My real customer copy';
    const saved=await saveThemeProject(env,'merchant',original.id,original,original.revision,'blog');
    assert.equal(saved.ok,true,JSON.stringify(saved));
    const recovered=await ensureCmsSiteStarter(env,'merchant','blog');
    assert.equal(recovered.ok,true);
    assert.equal(recovered.unchanged,true);
    assert.equal((await getThemeProject(env,'merchant','theme_heuristic','blog')).project.pages[0].sections.find(s=>s.key==='section_1').content.heading,'My real customer copy');
    const shop=await ensureCmsSiteStarter(env,'merchant','shop');
    assert.equal(shop.ok,true);
    assert.equal((await getThemeProject(env,'merchant','theme_heuristic','shop')).project.pages[0].sections.find(s=>s.key==='section_1').content.heading,'My Shop');
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM cms_globals WHERE account_id='merchant'").get().n,2);
    const forbidden=await ensureCmsSiteStarter(env,'merchant','foreign');
    assert.equal(forbidden.status,404);
  } finally {db.close();}
});

test('another installed preset is respected; generic preset materializer accepts another package',async()=>{
  const db=createCmsTestDb();
  const {env}=environment(db);
  try {
    db.exec(`INSERT INTO accounts(id) VALUES ('merchant');
      INSERT INTO cms_sites(id,account_id,name,slug,status,is_default)
      VALUES ('s','merchant','Customer Brand','customer','active',1)`);
    const custom=structuredClone(heuristicStarterPreset);
    custom.theme={...custom.theme,slug:'custom',name:'Custom Starter',
      packageName:'@inneranimalmedia/theme-custom',packageVersion:'1.0.0'};
    custom.pages=[custom.pages[0]];
    const generic=materializeStarterProject(custom,{name:'Customer Brand'});
    assert.equal(generic.id,'theme_custom');
    assert.match(generic.pages[0].template,/Customer Brand/);
    const installed=await ensureCmsSiteStarter(env,'merchant','s',{preset:custom});
    assert.equal(installed.ok,true);
    const fallback=await ensureCmsSiteStarter(env,'merchant','s');
    assert.equal(fallback.unchanged,true);
    assert.equal(fallback.projects[0].sourceThemeId,'custom');
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM cms_globals WHERE account_id='merchant'").get().n,1);
  } finally {db.close();}
});

test('package install fills missing neutral chrome once without replacing authored content',async()=>{
  const db=createCmsTestDb();
  const {env}=environment(db);
  try {
    db.exec(`INSERT INTO accounts(id) VALUES ('buyer');
      INSERT INTO cms_sites(id,account_id,name,slug,status,is_default)
      VALUES ('buyer_site','buyer','Buyer Studio','buyer','active',1)`);
    const preset=structuredClone(heuristicStarterPreset);
    preset.theme={...preset.theme,slug:'purchased',name:'Purchased Theme',
      packageName:'@inneranimalmedia/theme-purchased',packageVersion:'1.0.0'};
    preset.pages=[preset.pages[0]];
    const project=materializeStarterProject(preset,{name:'Donor Brand'});
    project.pages[0].sections=project.pages[0].sections.filter(s=>s.zone==='BODY');
    project.pages[0].template=project.pages[0].template.replace(/<!--theme-section:(announcement_bar|site_header|site_footer|promotion_popup)-->/g,'');
    const installed=await installThemeDraft(env,'buyer','purchased',{
      project,package_name:preset.theme.packageName,package_version:'1.0.0',
    },'buyer_site');
    assert.equal(installed.ok,true,JSON.stringify(installed));
    const page=installed.project.pages[0];
    assert.equal(page.sections.find(s=>s.key==='site_header').content.logo.text,'Buyer Studio');
    assert.equal(page.sections.find(s=>s.key==='announcement_bar').content.announcement_1.text,'Welcome to our store');
    assert.equal(page.sections.find(s=>s.key==='promotion_popup').content.__editor.visibility.enabled,false);
    assert.equal(page.sections.find(s=>s.key==='section_1').content.heading.includes('Donor Brand'),true);
    const again=await installThemeDraft(env,'buyer','purchased',{
      project,package_name:preset.theme.packageName,package_version:'1.0.0',
    },'buyer_site');
    assert.equal(again.unchanged,true);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM cms_revisions WHERE account_id='buyer'").get().n,1);
  } finally {db.close();}
});

test('primary website opens existing authored homepage, not generic starter content',async()=>{
  const db=createCmsTestDb();
  const {env}=environment(db);
  try {
    db.exec(`
      INSERT INTO accounts(id) VALUES ('studio');
      INSERT INTO cms_sites(id,account_id,name,slug,status,is_default,primary_domain)
      VALUES ('inneranimalmedia','studio','Inner Animal Media','inneranimalmedia','active',1,'inneranimalmedia.com'),
             ('agentsam','studio','AgentSam Studio','agentsam','active',0,'agentsam.inneranimalmedia.com');
      INSERT INTO cms_pages(id,account_id,site_id,slug,route_path,title,status,is_homepage)
      VALUES ('page_home','studio','inneranimalmedia','home','/','Inner Animal Media','published',1),
             ('page_studio','studio','agentsam','home','/','AgentSam Studio','published',1);
    `);
    const automatic=await (await handleStudioSitesOverview(storeRequest(),env,'studio')).json();
    assert.equal(automatic.selected_site_id,'inneranimalmedia');
    assert.equal(automatic.site_selection_required,false);
    assert.equal(automatic.site_preview.url,'https://inneranimalmedia.com/');
    assert.match(automatic.site_preview.edit_href,/site_id=inneranimalmedia/);
    assert.match(automatic.site_preview.edit_href,/page_id=page_home/);
    assert.equal(automatic.preview_theme,null,'authored sites never gain an unsolicited starter');
    assert.equal(automatic.draft_themes.length,0);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM cms_pages WHERE account_id='studio'").get().n,2,
      'existing pages are never overwritten by starter provisioning');
    const switched=await (await handleStudioSitesOverview(storeRequest('agentsam'),env,'studio')).json();
    assert.equal(switched.selected_site_id,'agentsam');
    assert.equal(switched.site_preview.url,'https://agentsam.inneranimalmedia.com/');
    assert.match(switched.site_preview.edit_href,/page_id=page_studio/);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM cms_globals WHERE account_id='studio' AND global_type='theme-project'").get().n,0);
    const again=await (await handleStudioSitesOverview(storeRequest(),env,'studio')).json();
    assert.equal(again.selected_site_id,'inneranimalmedia','switching does not change the primary site');
  } finally {db.close();}
});

test('new canvas saves its brief as a private blank theme and stays scoped to its chosen site',async()=>{
  const db=createCmsTestDb();
  const {env,objects}=environment(db);
  try {
    db.exec(`INSERT INTO accounts(id) VALUES ('maker'),('someone');
      INSERT INTO cms_sites(id,account_id,name,slug,status,is_default)
      VALUES ('new-shop','maker','New Shop','new-shop','active',1),
             ('other-shop','maker','Other Shop','other-shop','active',0)`);
    const draft=blankThemeProject({name:'  New journal  ',purpose:'Stories',audience:'Readers',siteName:'New Shop'});
    const created=await createThemeProject(env,'maker',draft,'new-shop');
    assert.equal(created.ok,true);
    const reopened=await getThemeProject(env,'maker',draft.id,'new-shop');
    assert.equal(reopened.ok,true);
    assert.equal(reopened.project.name,'New journal');
    assert.deepEqual(reopened.project.brief,{purpose:'Stories',audience:'Readers',siteName:'New Shop'});
    assert.equal(reopened.project.pages[0].sections.length,0);
    assert.equal(db.prepare("SELECT status FROM cms_globals WHERE site_id='new-shop'").get().status,'draft');
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM cms_revisions WHERE site_id='new-shop'").get().n,1);
    assert.ok(objects.size>0);
    assert.equal((await getThemeProject(env,'maker',draft.id,'other-shop')).ok,false);
    assert.equal((await getThemeProject(env,'someone',draft.id,'new-shop')).ok,false);
  } finally {db.close();}
});
