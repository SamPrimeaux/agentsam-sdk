import assert from 'node:assert/strict';
import test from 'node:test';
import { createCmsTestDb } from '../../tests/cms-test-db.mjs';
import { heuristicStarterPreset } from '../../../../packages/heuristic-theme/src/starter.js';
import { materializeStarterProject } from '../../frontend/theme-editor/starter-project.mjs';
import { ensureCmsSiteStarter } from './site-starter.mjs';
import { getThemeProject, saveThemeProject } from './theme-project-store.mjs';
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

test('first visit provisions a real default site and editable starter without an empty editor',async()=>{
  const db=createCmsTestDb();
  const {env,objects}=environment(db);
  try {
    db.prepare("INSERT INTO accounts(id) VALUES ('fresh')").run();
    const first=await handleStudioSitesOverview(storeRequest(),env,'fresh');
    assert.equal(first.status,200);
    const overview=await first.json();
    assert.equal(overview.setup_required,false);
    assert.equal(overview.site_selection_required,false);
    assert.ok(overview.selected_site_id);
    assert.equal(overview.preview_theme.installed,true);
    assert.match(overview.preview_theme.edit_href,/theme-project-editor\?project=theme_heuristic&site_id=/);
    const saved=await getThemeProject(env,'fresh','theme_heuristic',overview.selected_site_id);
    assert.equal(saved.ok,true);
    assert.deepEqual(saved.project.pages.map(p=>p.slug),['home','shop','about']);
    assert.match(saved.project.pages[0].sections[0].content.heading,/Default site/);
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
    const unselected=await (await handleStudioSitesOverview(storeRequest(),env,'merchant')).json();
    assert.equal(unselected.site_selection_required,true);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM cms_globals WHERE account_id='merchant'").get().n,0);
    const first=await (await handleStudioSitesOverview(storeRequest('blog'),env,'merchant')).json();
    assert.equal(first.preview_theme.installed,true);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM cms_globals WHERE account_id='merchant'").get().n,1);
    const original=(await getThemeProject(env,'merchant','theme_heuristic','blog')).project;
    original.pages[0].sections[0].content.heading='My real customer copy';
    const saved=await saveThemeProject(env,'merchant',original.id,original,original.revision,'blog');
    assert.equal(saved.ok,true,JSON.stringify(saved));
    const recovered=await ensureCmsSiteStarter(env,'merchant','blog');
    assert.equal(recovered.ok,true);
    assert.equal(recovered.unchanged,true);
    assert.equal((await getThemeProject(env,'merchant','theme_heuristic','blog')).project.pages[0].sections[0].content.heading,'My real customer copy');
    const shop=await ensureCmsSiteStarter(env,'merchant','shop');
    assert.equal(shop.ok,true);
    assert.equal((await getThemeProject(env,'merchant','theme_heuristic','shop')).project.pages[0].sections[0].content.heading,'My Shop');
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
