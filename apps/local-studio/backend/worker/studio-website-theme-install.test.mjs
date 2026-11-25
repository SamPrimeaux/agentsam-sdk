import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { handleStudioWebsiteThemeInstall } from './studio-website-theme-install.js';
import { getThemeProject, saveThemeProject } from '../../../ecommerce-cms-agentsam/backend/cms/theme-project-store.mjs';
import { listThemeDraftSites } from '../../../ecommerce-cms-agentsam/backend/cms/theme-draft-sites.mjs';
import { createCmsTestDb } from '../../../ecommerce-cms-agentsam/tests/cms-test-db.mjs';
import { addCmsHostDirectoryTables } from './cms-test-host-directory.mjs';
import { handleCmsWorkerRequest } from './cms-service.js';

const version='0.1.0';
const slug='plain-jane';
const root = fileURLToPath(new URL('../../../ecommerce-cms-agentsam/tests/fixtures/site-theme-projects/',import.meta.url));
const project=JSON.parse(await readFile(root+slug+'-'+version+'.json','utf8'));
const sha=project.sourceReleaseSha256;
const projectBytes=Buffer.from(JSON.stringify(project));
const projectDigest=createHash('sha256').update(projectBytes).digest('hex');
const remoteItem={
  slug,version,sha256:sha,project_sha256:projectDigest,
  project_key:'install-projects/'+slug+'/'+version+'/'+projectDigest+'.json',
  project_url:'/api/themes/'+slug+'/'+version+'/project',
  page_count:project.pages.length,manifest_page_count:project.pages.length,
};
const sample={
  slug,version,name:'Plain Jane Journal',summary:'Journal template',
  category:'Editorial',pages:['Journal','Article','About'],
  previewUrl:project.sourcePreviewUrl,
  release:{status:'published',sha256:sha,storageKey:'releases/'+slug+'/'+version+'/'+sha+'.zip'},
};
function d1(db) {
  return { prepare(sql) {
    let params=[];
    const stmt={
      bind(...values){params=values;return stmt;},
      async first(){return db.prepare(sql).get(...params)||null;},
      async all(){return {results:db.prepare(sql).all(...params)};},
      async run(){const r=db.prepare(sql).run(...params);return {meta:{changes:r.changes}};},
    }; return stmt;
  }};
}
function fixture() {
  const sqlite=createCmsTestDb();
  addCmsHostDirectoryTables(sqlite);
  sqlite.exec(`
    INSERT INTO accounts(id) VALUES('au_testowner0001'),('au_testother0002');
    INSERT INTO cms_sites(id,account_id,name,slug,status,is_default)
      VALUES('a-store','au_testowner0001','Store','store','active',1),
            ('a-blog','au_testowner0001','Blog','blog','active',0),
            ('b-store','au_testother0002','Other','other','active',1);
  `);
  const objects=new Map();
  const env={
    DB:d1(sqlite),
    WEBSITE_ASSETS:{
      async put(key,body){objects.set(key,String(body));},
      async get(key){return objects.has(key)?{text:async()=>objects.get(key)}:null;},
    },
    // No theme package or release fixture is bound to SDK static assets.
  };
  return {sqlite,objects,env};
}
function install(siteId='a-blog',version= '0.1.0') {
  return new Request('https://cms.test/api/admin/website-themes/plain-jane/install',{
    method:'POST',
    headers:{origin:'https://cms.test','content-type':'application/json'},
    body:JSON.stringify({site_id:siteId,version}),
  });
}
async function withCatalog(callback,listed=sample){
  const before=globalThis.fetch;
  globalThis.fetch=async url => {
    if(url==='https://themes.inneranimalmedia.com/api/catalog')
      return Response.json({ok:true,products:[listed]});
    if(url==='https://themes.inneranimalmedia.com/api/install-index')
      return Response.json({ok:true,schema:'agentsam.website-theme-install-index.v1',packages:[remoteItem]});
    if(url==='https://themes.inneranimalmedia.com/api/themes/plain-jane/0.1.0/project')
      return new Response(projectBytes,{headers:{'content-type':'application/json'}});
    throw Error('unexpected_remote_theme_request:'+url);
  };
  try {return await callback();}finally{globalThis.fetch=before;}
}
test('catalog preview alias may differ from the checksum-verified package preview',async()=>{
  const {sqlite,env}=fixture();
  try {await withCatalog(async()=>{
    const response=await handleStudioWebsiteThemeInstall(install(),env,'au_testowner0001',slug);
    assert.equal(response.status,201,JSON.stringify(await response.clone().json()));
    const stored=await getThemeProject(env,'au_testowner0001','theme_plain-jane','a-blog');
    assert.equal(stored.ok,true);
    // The theme remains installable and editable; the persistence layer may
    // intentionally normalize release provenance into separately stored metadata.
    assert.equal(stored.project.pages.length,project.pages.length);
  },{...sample,previewUrl:'https://themes.inneranimalmedia.com/iapj/',previewAlias:'iapj'});} finally {sqlite.close();}
});
test('rejects a catalog preview alias outside the authorized Theme Store routes',async()=>{
  const {sqlite,env}=fixture();
  try {await withCatalog(async()=>{
    const response=await handleStudioWebsiteThemeInstall(install(),env,'au_testowner0001',slug);
    assert.equal(response.status,409);
    assert.equal((await response.json()).error,'theme_preview_url_not_verified');
  },{...sample,previewUrl:'https://attacker.invalid/theme/'});} finally {sqlite.close();}
});
test('published original installs into chosen authorized CMS site with D1 pointer, immutable R2 revision, and usable editor URL',async()=>{
  const {sqlite,env,objects}=fixture();
  try {await withCatalog(async()=>{
    const response=await handleStudioWebsiteThemeInstall(install(),env,'au_testowner0001',slug);
    assert.equal(response.status,201);
    const result=await response.json();
    assert.equal(result.ok,true);
    assert.equal(result.site_id,'a-blog');
    assert.equal(result.page_count,project.pages.length);
    assert.equal(result.editor_url,'/admin/sites/a-blog/themes/theme_plain-jane/editor/home');
    assert.equal(result.source_release_sha256,sha);
    const row=sqlite.prepare("SELECT site_id,content_version,content_object_key FROM cms_globals WHERE global_key='theme-project:theme_plain-jane'").get();
    assert.equal(row.site_id,'a-blog');
    assert.equal(row.content_version,1);
    assert.ok(objects.has(row.content_object_key));
    assert.equal(sqlite.prepare("SELECT COUNT(*) as n FROM cms_revisions WHERE site_id='a-blog' AND revision_kind='draft'").get().n,1);
    assert.equal(sqlite.prepare("SELECT COUNT(*) as n FROM cms_artifacts").get().n,1);
    const stored=await getThemeProject(env,'au_testowner0001','theme_plain-jane','a-blog');
    assert.equal(stored.ok,true);
    assert.equal(stored.project.pages.length,project.pages.length);
    assert.equal(stored.project.pages[0].sections.length>0,true);
    // Installation saves a theme project, not a batch of premature CMS pages.
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM cms_pages WHERE site_id='a-blog'").get().n,0);
    assert.equal((await getThemeProject(env,'au_testowner0001','theme_plain-jane','a-store')).status,404);
    assert.equal((await getThemeProject(env,'au_testother0002','theme_plain-jane','a-blog')).ok,false);
  });}finally{sqlite.close();}
});
test('repeat installation reopens previous edits without replacing customer content, including when another owned site installs separately',async()=>{
  const {sqlite,env}=fixture();
  try {await withCatalog(async()=>{
    assert.equal((await handleStudioWebsiteThemeInstall(install(),env,'au_testowner0001',slug)).status,201);
    const existing=(await getThemeProject(env,'au_testowner0001','theme_plain-jane','a-blog')).project;
    const updated=structuredClone(existing);
    updated.pages[0].title='My owned blog';
    const saved=await saveThemeProject(env,'au_testowner0001',updated.id,updated,1,'a-blog');
    assert.equal(saved.ok,true,JSON.stringify(saved));
    const repeated=await handleStudioWebsiteThemeInstall(install(),env,'au_testowner0001',slug);
    assert.equal(repeated.status,200);
    assert.equal((await repeated.json()).unchanged,true);
    const refreshed=(await getThemeProject(env,'au_testowner0001','theme_plain-jane','a-blog')).project;
    assert.equal(refreshed.pages[0].title,'My owned blog');
    assert.equal(refreshed.revision,2);
    assert.equal((await handleStudioWebsiteThemeInstall(install('a-store'),env,'au_testowner0001',slug)).status,201);
    const other=(await getThemeProject(env,'au_testowner0001','theme_plain-jane','a-store')).project;
    assert.equal(other.pages[0].title,project.pages[0].title);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM cms_globals WHERE global_type='theme-project'").get().n,2);
  });}finally{sqlite.close();}
});
test('cannot install into another account, without origin, or from a mismatched release',async()=>{
  const {sqlite,env}=fixture();
  try {
    await withCatalog(async()=>{
      const unauthorized=await handleStudioWebsiteThemeInstall(install('b-store'),env,'au_testowner0001',slug);
      assert.equal(unauthorized.status,404);
      assert.equal((await handleStudioWebsiteThemeInstall(install(),env,null,slug)).status,401);
      const badOrigin=new Request('https://cms.test/api/admin/website-themes/plain-jane/install',{
        method:'POST',headers:{'content-type':'application/json',origin:'https://elsewhere.invalid'},
        body:JSON.stringify({site_id:'a-blog',version}),
      });
      assert.equal((await handleStudioWebsiteThemeInstall(badOrigin,env,'au_testowner0001',slug)).status,403);
      assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM cms_globals").get().n,0);
    });
    await withCatalog(async()=>{
      const response=await handleStudioWebsiteThemeInstall(install(),env,'au_testowner0001',slug);
      assert.equal(response.status,409);
      assert.equal((await response.json()).error,'theme_release_does_not_match_verified_package');
      assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM cms_globals").get().n,0);
    },{...sample,release:{...sample.release,sha256:'au_testother0002'.repeat(64)}});
  } finally {sqlite.close();}
});

test('remote R2 install index and checksum-pinned project work without an SDK-bundled template',async()=>{
  const {sqlite,env}=fixture();
  const oldFetch=globalThis.fetch;
  const {createHash}=await import('node:crypto');
  const bytes=Buffer.from(JSON.stringify(project));
  const hash=createHash('sha256').update(bytes).digest('hex');
  const item={slug,version,sha256:sha,project_sha256:hash,
    project_key:'install-projects/'+slug+'/'+version+'/'+hash+'.json',
    project_url:'/api/themes/'+slug+'/'+version+'/project',
    page_count:project.pages.length,manifest_page_count:project.pages.length};
  env.ASSETS={fetch:async()=>{throw Error('bundled_assets_must_not_be_used');}};
  let projectBytes=bytes;
  globalThis.fetch=async url=>{
    if(url==='https://themes.inneranimalmedia.com/api/catalog')return Response.json({ok:true,products:[sample]});
    if(url==='https://themes.inneranimalmedia.com/api/install-index')return Response.json({ok:true,schema:'agentsam.website-theme-install-index.v1',packages:[item]});
    if(url==='https://themes.inneranimalmedia.com/api/themes/plain-jane/0.1.0/project')return new Response(projectBytes,{headers:{'content-type':'application/json'}});
    throw Error('unexpected_url:'+url);
  };
  try {
    assert.equal((await handleStudioWebsiteThemeInstall(install(),env,'au_testowner0001',slug)).status,201);
    projectBytes=Buffer.from(JSON.stringify({...project,name:'Tampered project'}));
    const denied=await handleStudioWebsiteThemeInstall(install('a-store'),env,'au_testowner0001',slug);
    assert.equal(denied.status,503);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM cms_globals WHERE site_id='a-store'").get().n,0);
  }finally{globalThis.fetch=oldFetch;sqlite.close();}
});

const tryTheme=()=>new Request('https://cms.test/api/admin/website-themes/plain-jane/install',{
  method:'POST',headers:{origin:'https://cms.test','content-type':'application/json'},
  body:JSON.stringify({version}),
});
function seedCatalogTables(sqlite){
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS agentsam_products(id TEXT PRIMARY KEY, slug TEXT, kind TEXT);
    CREATE TABLE IF NOT EXISTS agentsam_product_releases(id TEXT PRIMARY KEY, product_id TEXT, version TEXT);
    INSERT INTO agentsam_products(id,slug,kind) VALUES('prod_theme_plain_jane','plain-jane','theme');
    INSERT INTO agentsam_product_releases(id,product_id,version) VALUES('release_pj_010','prod_theme_plain_jane','0.1.0');
  `);
}

test('every Try creates its own draft site + cms_site_themes row; unlimited tries, fully editable, owner-isolated',async()=>{
  const {sqlite,env,objects}=fixture();
  seedCatalogTables(sqlite);
  try { await withCatalog(async()=>{
    const sitesBefore=sqlite.prepare("SELECT COUNT(*) n FROM cms_sites WHERE account_id='au_testowner0001'").get().n;
    const one=await handleStudioWebsiteThemeInstall(tryTheme(),env,'au_testowner0001',slug);
    const two=await handleStudioWebsiteThemeInstall(tryTheme(),env,'au_testowner0001',slug);
    assert.equal(one.status,201);
    assert.equal(two.status,201);
    const first=await one.json(),second=await two.json();
    assert.equal(first.scope,'site');
    assert.notEqual(first.site_id,second.site_id);
    assert.equal(first.project_id,'theme_plain-jane');
    assert.equal(first.editor_url,'/admin/sites/'+first.site_id+'/themes/theme_plain-jane/editor/home');
    assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM cms_sites WHERE account_id='au_testowner0001'").get().n,sitesBefore+2);
    const site=sqlite.prepare('SELECT status,settings_json FROM cms_sites WHERE id=?').get(first.site_id);
    assert.equal(site.status,'draft');
    assert.equal(JSON.parse(site.settings_json).kind,'marketplace-theme-draft');
    const row=sqlite.prepare('SELECT * FROM cms_site_themes WHERE site_id=?').get(first.site_id);
    assert.equal(row.status,'ready');
    assert.equal(row.source_kind,'catalog');
    assert.equal(row.source_product_id,'prod_theme_plain_jane');
    assert.equal(row.source_release_id,'release_pj_010');
    assert.equal(row.is_live,0);
    assert.ok(objects.has(row.draft_manifest_key));
    const existing=await getThemeProject(env,'au_testowner0001','theme_plain-jane',first.site_id);
    assert.equal(existing.ok,true);
    const edited=structuredClone(existing.project);
    edited.pages[0].title='Edited in my own sandbox';
    assert.equal((await saveThemeProject(env,'au_testowner0001',edited.id,edited,1,first.site_id)).ok,true);
    // The sibling try is untouched by edits to the first one.
    assert.notEqual((await getThemeProject(env,'au_testowner0001','theme_plain-jane',second.site_id)).project.pages[0].title,'Edited in my own sandbox');
    assert.equal((await listThemeDraftSites(env,'au_testowner0001')).drafts.length,2);
    assert.equal((await listThemeDraftSites(env,'au_testother0002')).drafts.length,0);
    assert.equal((await getThemeProject(env,'au_testother0002','theme_plain-jane',first.site_id)).status,404);
  }); } finally {sqlite.close();}
});

test('Try succeeds for an account that has zero CMS sites, and an existing site slug never blocks or is adopted',async()=>{
  const {sqlite,env}=fixture();
  seedCatalogTables(sqlite);
  sqlite.exec(`INSERT INTO accounts(id) VALUES('au_testnew0003');
    INSERT INTO cms_sites(id,account_id,name,slug,status,is_default)
    VALUES('user-site','au_testnew0003','Different website','theme-draft-plain-jane-0-1-0','active',0)`);
  try { await withCatalog(async()=>{
    const response=await handleStudioWebsiteThemeInstall(tryTheme(),env,'au_testnew0003',slug);
    assert.equal(response.status,201);
    const result=await response.json();
    assert.notEqual(result.site_id,'user-site');
    assert.equal(sqlite.prepare("SELECT status FROM cms_sites WHERE id='user-site'").get().status,'active');
    assert.equal(sqlite.prepare("SELECT slug FROM cms_sites WHERE id=?").get(result.site_id).slug,'theme-draft-plain-jane-0-1-0-2');
  }); } finally {sqlite.close();}
});

test('a failed install leaves no orphan draft site and reports an actionable error',async()=>{
  const {sqlite,env}=fixture();
  const bad=structuredClone(project);bad.pages=[];
  const badBytes=Buffer.from(JSON.stringify(bad));
  const before=globalThis.fetch;
  globalThis.fetch=async url=>{
    if(String(url).endsWith('/api/catalog'))return Response.json({ok:true,products:[sample]});
    if(String(url).endsWith('/api/install-index'))return Response.json({ok:true,schema:'agentsam.website-theme-install-index.v1',packages:[remoteItem]});
    return new Response(badBytes,{headers:{'content-type':'application/json'}});
  };
  try{
    const sitesBefore=sqlite.prepare('SELECT COUNT(*) n FROM cms_sites').get().n;
    const response=await handleStudioWebsiteThemeInstall(tryTheme(),env,'au_testowner0001',slug);
    assert.ok(response.status>=400);
    assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM cms_sites').get().n,sitesBefore);
  }finally{globalThis.fetch=before;sqlite.close();}
});

test('create an empty owned store, add a verified Theme Store release, and reopen its editable project on that exact site', async () => {
  const { sqlite, env, objects } = fixture();
  try {
    const create = await handleCmsWorkerRequest(new Request('https://cms.test/api/cms/sites', {
      method: 'POST',
      headers: { origin: 'https://cms.test', 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Fresh Merchant Store', slug: 'fresh-merchant-store' }),
    }), env, 'au_testowner0001');
    assert.equal(create.status, 201, JSON.stringify(await create.clone().json()));
    const created = await create.json();
    assert.equal(created.ok, true);
    assert.equal(created.theme_required, true);
    assert.equal(created.site.account_id, 'au_testowner0001');
    assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM cms_globals WHERE site_id=?')
      .get(created.site.id).n, 0, 'creating a store must not secretly install the SDK default theme');

    await withCatalog(async () => {
      const added = await handleStudioWebsiteThemeInstall(
        install(created.site.id), env, 'au_testowner0001', slug);
      assert.equal(added.status, 201, JSON.stringify(await added.clone().json()));
      const installed = await added.json();
      assert.equal(installed.site_id, created.site.id);
      assert.equal(installed.source_release_sha256, sha);
      assert.equal(installed.editor_url,
        '/admin/sites/' + created.site.id + '/themes/theme_plain-jane/editor/home');
      const projectRow = sqlite.prepare(
        "SELECT content_object_key FROM cms_globals WHERE site_id=? AND global_type='theme-project'"
      ).get(created.site.id);
      assert.ok(projectRow && objects.has(projectRow.content_object_key));
      const saved = await getThemeProject(env, 'au_testowner0001',
        'theme_plain-jane', created.site.id);
      assert.equal(saved.ok, true);
      assert.ok(saved.project.pages.length >= 1);
      assert.ok(saved.project.pages[0].sections.length >= 1);
      assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM cms_globals WHERE site_id=?')
        .get('a-store').n, 0, 'another store remains unchanged');
    });
  } finally { sqlite.close(); }
});
