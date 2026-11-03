import assert from 'node:assert/strict';
import test from 'node:test';
import {createCmsTestDb} from '../../../ecommerce-cms-agentsam/tests/cms-test-db.mjs';
import {listStudioThemeDrafts} from './studio-theme-drafts.js';
import {handleStudioSitesOverview} from './studio-sites-overview.js';

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
  sqlite.exec(`
    INSERT INTO accounts(id) VALUES ('owner-a'),('owner-b');
    INSERT INTO cms_sites(id,account_id,name,slug,status,is_default)
      VALUES ('a-main','owner-a','Storefront','store','active',1),
             ('a-blog','owner-a','Personal Blog','blog','active',0),
             ('b-blog','owner-b','Other Blog','other','active',1);
  `);
  const insert=sqlite.prepare(
    "INSERT INTO cms_globals(id,account_id,site_id,global_key,global_type,status,inline_content_json) VALUES(?,?,?,'theme-project:theme_plain-jane','theme-project','draft',?)"
  );
  const summary={id:'theme_plain-jane',name:'Plain Jane Journal',
    sourceThemeId:'plain-jane',packageName:'@inneranimalmedia/theme-plain-jane',
    sourcePackageVersion:'0.1.0',sourcePreviewUrl:'https://themes.inneranimalmedia.com/theme-packages/plain-jane/0.1.0/preview/'};
  insert.run('g1','owner-a','a-main',JSON.stringify(summary));
  insert.run('g2','owner-a','a-blog',JSON.stringify(summary));
  insert.run('g3','owner-b','b-blog',JSON.stringify({...summary,name:'Secret Other Site'}));
  return {sqlite,env:{DB:d1(sqlite)}};
}
test('draft directory lists every owned site exactly once with site-bound editor URLs',async()=>{
  const {sqlite,env}=fixture();
  try {
    const result=await listStudioThemeDrafts(env,'owner-a');
    assert.equal(result.length,2,JSON.stringify(result));
    assert.deepEqual(result.map(row=>row.site_id).sort(),['a-blog','a-main']);
    assert.equal(new Set(result.map(row=>row.id)).size,2);
    assert.ok(result.every(row=>row.installed&&row.site_linked));
    assert.ok(result.every(row=>row.edit_href.endsWith('&site_id='+row.site_id)));
    assert.ok(result.every(row=>!row.name.includes('Secret')));
    assert.deepEqual(result.map(row=>row.site_name).sort(),['Personal Blog','Storefront']);
  }finally{sqlite.close();}
});
test('Store overview cannot promote another site draft into current preview and rejects unauthorized site',async()=>{
  const {sqlite,env}=fixture();
  try {
    const base='https://agentsam.example/api/admin/store/online';
    const overview=await handleStudioSitesOverview(new Request(base),env,'owner-a');
    assert.equal(overview.status,200);
    const anonymous=await overview.json();
    assert.equal(anonymous.preview_theme,null);
    assert.equal(anonymous.draft_themes.length,2);
    const selected=await handleStudioSitesOverview(new Request(base+'?site_id=a-blog'),env,'owner-a');
    assert.equal(selected.status,200);
    const payload=await selected.json();
    assert.equal(payload.selected_site_id,'a-blog');
    assert.equal(payload.preview_theme.installed,true);
    assert.equal(payload.preview_theme.preview_href,null);
    assert.equal(payload.preview_theme.edit_href,
      '/admin/theme-project-editor?project=theme_plain-jane&site_id=a-blog');
    const forbidden=await handleStudioSitesOverview(new Request(base+'?site_id=b-blog'),env,'owner-a');
    assert.equal(forbidden.status,404);
  }finally{sqlite.close();}
});
