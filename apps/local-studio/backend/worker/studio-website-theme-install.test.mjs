import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { handleStudioWebsiteThemeInstall } from './studio-website-theme-install.js';
import { getThemeProject, saveThemeProject } from '../../../ecommerce-cms-agentsam/backend/cms/theme-project-store.mjs';
import { getStudioThemeProject, saveStudioThemeProject, listStudioThemeProjectHistory } from '../../../ecommerce-cms-agentsam/backend/cms/theme-studio-store.mjs';
import { createCmsTestDb } from '../../../ecommerce-cms-agentsam/tests/cms-test-db.mjs';

const version='0.1.0';
const slug='plain-jane';
const root = fileURLToPath(new URL('../../../ecommerce-cms-agentsam/frontend/static/data/site-theme-projects/',import.meta.url));
const project=JSON.parse(await readFile(root+slug+'-'+version+'.json','utf8'));
const index=JSON.parse(await readFile(root+'index.json','utf8'));
const sha=project.sourceReleaseSha256;
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
  sqlite.exec(`
    INSERT INTO accounts(id) VALUES('a'),('b');
    INSERT INTO cms_sites(id,account_id,name,slug,status,is_default)
      VALUES('a-store','a','Store','store','active',1),
            ('a-blog','a','Blog','blog','active',0),
            ('b-store','b','Other','other','active',1);
  `);
  const objects=new Map();
  const env={
    DB:d1(sqlite),
    WEBSITE_ASSETS:{
      async put(key,body){objects.set(key,String(body));},
      async get(key){return objects.has(key)?{text:async()=>objects.get(key)}:null;},
    },
    ASSETS:{
      async fetch(request) {
        const path=new URL(request.url).pathname;
        if(path.endsWith('/index.json'))return Response.json(index);
        if(path.endsWith('/'+slug+'-'+version+'.json'))return Response.json(project);
        return new Response('not found',{status:404});
      },
    },
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
    assert.equal(url,'https://themes.inneranimalmedia.com/api/catalog');
    return Response.json({ok:true,products:[listed]});
  };
  try {return await callback();}finally{globalThis.fetch=before;}
}
test('published original installs into chosen authorized CMS site with D1 pointer, immutable R2 revision, and usable editor URL',async()=>{
  const {sqlite,env,objects}=fixture();
  try {await withCatalog(async()=>{
    const response=await handleStudioWebsiteThemeInstall(install(),env,'a',slug);
    assert.equal(response.status,201);
    const result=await response.json();
    assert.equal(result.ok,true);
    assert.equal(result.site_id,'a-blog');
    assert.equal(result.page_count,project.pages.length);
    assert.equal(result.editor_url,'/admin/theme-project-editor?project=theme_plain-jane&site_id=a-blog');
    assert.equal(result.source_release_sha256,sha);
    const row=sqlite.prepare("SELECT site_id,content_version,content_object_key FROM cms_globals WHERE global_key='theme-project:theme_plain-jane'").get();
    assert.equal(row.site_id,'a-blog');
    assert.equal(row.content_version,1);
    assert.ok(objects.has(row.content_object_key));
    assert.equal(sqlite.prepare("SELECT COUNT(*) as n FROM cms_revisions WHERE site_id='a-blog' AND revision_kind='draft'").get().n,1);
    assert.equal(sqlite.prepare("SELECT COUNT(*) as n FROM cms_artifacts").get().n,1);
    const stored=await getThemeProject(env,'a','theme_plain-jane','a-blog');
    assert.equal(stored.ok,true);
    assert.equal(stored.project.pages.length,project.pages.length);
    assert.equal(stored.project.pages[0].sections.length>0,true);
    assert.equal((await getThemeProject(env,'a','theme_plain-jane','a-store')).status,404);
    assert.equal((await getThemeProject(env,'b','theme_plain-jane','a-blog')).ok,false);
  });}finally{sqlite.close();}
});
test('repeat installation reopens previous edits without replacing customer content, including when another owned site installs separately',async()=>{
  const {sqlite,env}=fixture();
  try {await withCatalog(async()=>{
    assert.equal((await handleStudioWebsiteThemeInstall(install(),env,'a',slug)).status,201);
    const existing=(await getThemeProject(env,'a','theme_plain-jane','a-blog')).project;
    const updated=structuredClone(existing);
    updated.pages[0].title='My owned blog';
    const saved=await saveThemeProject(env,'a',updated.id,updated,1,'a-blog');
    assert.equal(saved.ok,true,JSON.stringify(saved));
    const repeated=await handleStudioWebsiteThemeInstall(install(),env,'a',slug);
    assert.equal(repeated.status,200);
    assert.equal((await repeated.json()).unchanged,true);
    const refreshed=(await getThemeProject(env,'a','theme_plain-jane','a-blog')).project;
    assert.equal(refreshed.pages[0].title,'My owned blog');
    assert.equal(refreshed.revision,2);
    assert.equal((await handleStudioWebsiteThemeInstall(install('a-store'),env,'a',slug)).status,201);
    const other=(await getThemeProject(env,'a','theme_plain-jane','a-store')).project;
    assert.equal(other.pages[0].title,project.pages[0].title);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM cms_globals WHERE global_type='theme-project'").get().n,2);
  });}finally{sqlite.close();}
});
test('cannot install into another account, without origin, or from a mismatched release',async()=>{
  const {sqlite,env}=fixture();
  try {
    await withCatalog(async()=>{
      const unauthorized=await handleStudioWebsiteThemeInstall(install('b-store'),env,'a',slug);
      assert.equal(unauthorized.status,404);
      assert.equal((await handleStudioWebsiteThemeInstall(install(),env,null,slug)).status,401);
      const badOrigin=new Request('https://cms.test/api/admin/website-themes/plain-jane/install',{
        method:'POST',headers:{'content-type':'application/json',origin:'https://elsewhere.invalid'},
        body:JSON.stringify({site_id:'a-blog',version}),
      });
      assert.equal((await handleStudioWebsiteThemeInstall(badOrigin,env,'a',slug)).status,403);
      assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM cms_globals").get().n,0);
    });
    await withCatalog(async()=>{
      const response=await handleStudioWebsiteThemeInstall(install(),env,'a',slug);
      assert.equal(response.status,409);
      assert.equal((await response.json()).error,'theme_release_does_not_match_verified_package');
      assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM cms_globals").get().n,0);
    },{...sample,release:{...sample.release,sha256:'b'.repeat(64)}});
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
    assert.equal((await handleStudioWebsiteThemeInstall(install(),env,'a',slug)).status,201);
    projectBytes=Buffer.from(JSON.stringify({...project,name:'Tampered project'}));
    const denied=await handleStudioWebsiteThemeInstall(install('a-store'),env,'a',slug);
    assert.equal(denied.status,503);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM cms_globals WHERE site_id='a-store'").get().n,0);
  }finally{globalThis.fetch=oldFetch;sqlite.close();}
});

test('Try without a site creates a complete account-owned Theme Studio workspace and no CMS site',async()=>{
  const {sqlite,env,objects}=fixture();
  const tryTheme=()=>new Request('https://cms.test/api/admin/website-themes/plain-jane/install',{
    method:'POST',headers:{origin:'https://cms.test','content-type':'application/json'},
    body:JSON.stringify({version}),
  });
  try { await withCatalog(async()=>{
    const siteCountBefore=sqlite.prepare('SELECT COUNT(*) n FROM cms_sites').get().n;
    const response=await handleStudioWebsiteThemeInstall(tryTheme(),env,'a',slug);
    assert.equal(response.status,201);
    const data=await response.json();
    assert.equal(data.ok,true);
    assert.equal(data.scope,'studio');
    assert.equal(Object.hasOwn(data,'site_id'),false);
    assert.equal(data.editor_url,'/admin/theme-project-editor?project=theme_plain-jane&scope=studio');
    assert.equal(data.page_count,project.pages.length);
    assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM cms_sites').get().n,siteCountBefore);
    assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM cms_globals').get().n,0);
    const row=sqlite.prepare("SELECT * FROM cms_theme_studio_projects WHERE account_id='a' AND project_id='theme_plain-jane'").get();
    assert.ok(row);
    assert.equal(row.content_version,1);
    assert.ok(row.content_object_key.includes('/studio/theme-projects/theme_plain-jane/'));
    assert.ok(objects.has(row.content_object_key));
    assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM cms_theme_studio_revisions WHERE project_row_id=?").get(row.id).n,1);
    const existing=await getStudioThemeProject(env,'a','theme_plain-jane');
    assert.equal(existing.ok,true);
    assert.equal(existing.project.pages.length,project.pages.length);
    assert.equal(existing.project.pages[0].sections.length>0,true);
    const edited=structuredClone(existing.project);
    edited.pages[0].title='Edited before creating a website';
    assert.equal((await saveStudioThemeProject(env,'a',edited.id,edited,1)).ok,true);
    const history=await listStudioThemeProjectHistory(env,'a','theme_plain-jane');
    assert.deepEqual(history.revisions.map(item=>Number(item.id)),[2,1]);
    const reopened=await handleStudioWebsiteThemeInstall(tryTheme(),env,'a',slug);
    assert.equal(reopened.status,200);
    const resumed=await reopened.json();
    assert.equal(resumed.unchanged,true);
    assert.equal(resumed.scope,'studio');
    assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM cms_sites').get().n,siteCountBefore);
    assert.equal((await getStudioThemeProject(env,'a','theme_plain-jane')).project.pages[0].title,'Edited before creating a website');
    assert.equal((await getStudioThemeProject(env,'b','theme_plain-jane')).status,404);
  }); } finally {sqlite.close();}
});

test('Theme Store Try succeeds for an account that has zero CMS sites',async()=>{
  const {sqlite,env}=fixture();
  sqlite.exec("INSERT INTO accounts(id) VALUES('c')");
  const request=new Request('https://cms.test/api/admin/website-themes/plain-jane/install',{
    method:'POST',headers:{origin:'https://cms.test','content-type':'application/json'},
    body:JSON.stringify({version}),
  });
  try {await withCatalog(async()=>{
    const response=await handleStudioWebsiteThemeInstall(request,env,'c',slug);
    assert.equal(response.status,201);
    const result=await response.json();
    assert.equal(result.scope,'studio');
    assert.equal(result.project_id,'theme_plain-jane');
    assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM cms_sites WHERE account_id='c'").get().n,0);
    assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM cms_theme_studio_projects WHERE account_id='c'").get().n,1);
  });}finally{sqlite.close();}
});

test('site-free Try ignores existing CMS site slugs and never creates or adopts a site',async()=>{
  const {sqlite,env}=fixture();
  sqlite.exec(`INSERT INTO cms_sites(id,account_id,name,slug,status,is_default)
    VALUES('user-site','a','Different website','theme-draft-plain-jane-0-1-0','active',0)`);
  const before=sqlite.prepare('SELECT COUNT(*) n FROM cms_sites').get().n;
  const request=new Request('https://cms.test/api/admin/website-themes/plain-jane/install',{
    method:'POST',headers:{origin:'https://cms.test','content-type':'application/json'},
    body:JSON.stringify({version}),
  });
  try {await withCatalog(async()=>{
    const response=await handleStudioWebsiteThemeInstall(request,env,'a',slug);
    assert.equal(response.status,201);
    const result=await response.json();
    assert.equal(result.scope,'studio');
    assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM cms_sites').get().n,before);
    assert.equal(sqlite.prepare("SELECT status FROM cms_sites WHERE id='user-site'").get().status,'active');
    assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM cms_theme_studio_projects WHERE account_id='a'").get().n,1);
  });}finally{sqlite.close();}
});
