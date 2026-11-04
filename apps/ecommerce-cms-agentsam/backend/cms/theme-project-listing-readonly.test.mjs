import test from 'node:test';
import assert from 'node:assert/strict';
import {createCmsTestDb} from '../../tests/cms-test-db.mjs';
import {handleAdminCmsApi} from './api.js';

function envFor(db) {
  return {DB:{prepare(sql){
    let args=[];
    const stmt={bind(...values){args=values;return stmt;},
      async first(){return db.prepare(sql).get(...args)||null;},
      async all(){return {results:db.prepare(sql).all(...args)};},
      async run(){const r=db.prepare(sql).run(...args);return {meta:{changes:r.changes}};}};
    return stmt;
  }}};
}
test('GET installed theme projects does not seed another site theme or CMS homepage',async()=>{
  const db=createCmsTestDb();
  const env=envFor(db);
  try {
    db.exec(`INSERT INTO accounts(id) VALUES ('owner'),('outsider');
      INSERT INTO cms_sites(id,account_id,name,slug,status,is_default)
      VALUES ('private_draft','owner','Revise private draft','revise-draft','draft',0),
             ('other_website','owner','Live site','live','active',1);
      INSERT INTO cms_globals
        (id,account_id,site_id,global_key,global_type,status,inline_content_json,
         content_object_key,content_version)
      VALUES ('global_revise','owner','private_draft','theme-project:theme_revise',
        'theme-project','draft','{"id":"theme_revise","name":"Revise","pages":[{"slug":"home","title":"Home"}]}',
        'cms/owned/revise.json',1);`);
    const before=db.prepare('SELECT COUNT(*) AS n FROM cms_pages').get().n;
    const globalsBefore=db.prepare('SELECT COUNT(*) AS n FROM cms_globals').get().n;
    const url=new URL('https://cms.test/api/admin/cms/theme-projects?site_id=private_draft');
    const response=await handleAdminCmsApi(new Request(url),env,url,{accountId:'owner'});
    assert.equal(response.status,200);
    const result=await response.json();
    assert.equal(result.ok,true);
    assert.deepEqual(result.projects.map(p=>p.id),['theme_revise']);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM cms_pages').get().n,before);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM cms_globals').get().n,globalsBefore);
    const cross=await handleAdminCmsApi(new Request(url),env,url,{accountId:'outsider'});
    assert.notEqual(cross.status,200);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM cms_pages').get().n,before);
  }finally{db.close();}
});
