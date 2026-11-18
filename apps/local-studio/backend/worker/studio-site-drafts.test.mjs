import assert from 'node:assert/strict';
import test from 'node:test';
import {createCmsTestDb} from '../../../ecommerce-cms-agentsam/tests/cms-test-db.mjs';
import {listStudioThemeDrafts} from './studio-theme-drafts.js';
import {handleStudioSitesOverview} from './studio-sites-overview.js';
import { addCmsHostDirectoryTables } from './cms-test-host-directory.mjs';

const d1 = sqlite => ({prepare(sql) {
  let values=[];
  const stmt={
    bind(...args) { values=args; return stmt; },
    async all() { return {results:sqlite.prepare(sql).all(...values)}; },
    async first() { return sqlite.prepare(sql).get(...values) || null; },
    async run() { return sqlite.prepare(sql).run(...values); },
  };
  return stmt;
}});
function fixture() {
  const sqlite=createCmsTestDb();
  addCmsHostDirectoryTables(sqlite);
  sqlite.exec(`
    INSERT INTO accounts(id) VALUES ('au_testowner0001'),('au_testother0002');
    INSERT INTO cms_sites(id,account_id,name,slug,status,is_default)
      VALUES ('a-main','au_testowner0001','Storefront','store','active',1),
             ('a-blog','au_testowner0001','Personal Blog','blog','active',0),
             ('b-blog','au_testother0002','Other Blog','other','active',1);
  `);
  const insert=sqlite.prepare(
    "INSERT INTO cms_globals(id,account_id,site_id,global_key,global_type,status,inline_content_json) VALUES(?,?,?,'theme-project:theme_plain-jane','theme-project','draft',?)"
  );
  const summary={id:'theme_plain-jane',name:'Plain Jane Journal',
    sourceThemeId:'plain-jane',packageName:'@inneranimalmedia/theme-plain-jane',
    sourcePackageVersion:'0.1.0',sourcePreviewUrl:'https://themes.inneranimalmedia.com/theme-packages/plain-jane/0.1.0/preview/'};
  insert.run('g1','au_testowner0001','a-main',JSON.stringify(summary));
  insert.run('g2','au_testowner0001','a-blog',JSON.stringify(summary));
  insert.run('g3','au_testother0002','b-blog',JSON.stringify({...summary,name:'Secret Other Site'}));
  return {sqlite,env:{DB:d1(sqlite),WEBSITE_ASSETS:{
    async put(){throw Error('Existing site drafts must not be replaced');},
    async get(){return null;},
  }}};
}
test('draft directory lists every owned site exactly once with site-bound editor URLs',async()=>{
  const {sqlite,env}=fixture();
  try {
    const result=await listStudioThemeDrafts(env,'au_testowner0001');
    assert.equal(result.length,2,JSON.stringify(result));
    assert.deepEqual(result.map(row=>row.site_id).sort(),['a-blog','a-main']);
    assert.equal(new Set(result.map(row=>row.id)).size,2);
    assert.ok(result.every(row=>row.installed&&row.site_linked));
    assert.ok(result.every(row=>row.edit_href.includes('/admin/sites/'+row.site_id+'/themes/')));
    assert.ok(result.every(row=>!row.name.includes('Secret')));
    assert.deepEqual(result.map(row=>row.site_name).sort(),['Personal Blog','Storefront']);
  }finally{sqlite.close();}
});
test('Store overview cannot promote another site draft into current preview and rejects unauthorized site',async()=>{
  const {sqlite,env}=fixture();
  try {
    const base='https://agentsam.example/api/admin/store/online';
    const overview=await handleStudioSitesOverview(new Request(base),env,'au_testowner0001');
    assert.equal(overview.status,200);
    const automatic=await overview.json();
    assert.equal(automatic.selected_site_id,'a-main');
    assert.equal(automatic.site_selection_required,false);
    assert.equal(automatic.preview_theme.installed,true);
    assert.equal(automatic.draft_themes.length,1);
    assert.deepEqual(automatic.available_sites.map(s=>s.id).sort(),['a-blog','a-main']);
    // A multi-site account with no default must explicitly select the website.
    sqlite.prepare("UPDATE cms_sites SET is_default=0 WHERE account_id='au_testowner0001'").run();
    const recovered=await (await handleStudioSitesOverview(new Request(base),env,'au_testowner0001')).json();
    assert.equal(recovered.site_selection_required,true);
    assert.equal(recovered.selected_site_id,null);
    assert.equal(recovered.preview_theme,null);
    assert.equal(recovered.draft_themes.length,0);
    const selected=await handleStudioSitesOverview(new Request(base+'?site_id=a-blog'),env,'au_testowner0001');
    assert.equal(selected.status,200);
    const payload=await selected.json();
    assert.equal(payload.selected_site_id,'a-blog');
    assert.equal(payload.preview_theme.installed,true);
    assert.equal(payload.preview_theme.preview_href,null);
    assert.equal(payload.preview_theme.edit_href,
      '/admin/sites/a-blog/themes/theme_plain-jane/editor/home');
    const forbidden=await handleStudioSitesOverview(new Request(base+'?site_id=b-blog'),env,'au_testowner0001');
    assert.equal(forbidden.status,404);
    // A merchant with exactly one site does not need to choose it every time.
    const single=await (await handleStudioSitesOverview(new Request(base),env,'au_testother0002')).json();
    assert.equal(single.selected_site_id,'b-blog');
    assert.equal(single.site_selection_required,false);
    assert.deepEqual(single.available_sites.map(site=>site.id),['b-blog']);
    assert.equal(single.preview_theme.name,'Secret Other Site');
  }finally{sqlite.close();}
});
