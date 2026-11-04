import test from 'node:test';
import assert from 'node:assert/strict';
import {createCmsTestDb} from '../../tests/cms-test-db.mjs';
import {listCmsSites} from './site-context.mjs';

function connection(db) {
  return {prepare(sql){
    let args=[];
    const stmt={bind(...values){args=values;return stmt;},
      async all(){return {results:db.prepare(sql).all(...args)};},
      async first(){return db.prepare(sql).get(...args)||null;},
      async run(){const r=db.prepare(sql).run(...args);return {meta:{changes:r.changes}};}};
    return stmt;
  }};
}
test('GET site inventory does not create a website or turn private draft into default',async()=>{
  const db=createCmsTestDb();
  try{
    db.exec(`INSERT INTO accounts(id) VALUES('owner'),('other');
      INSERT INTO cms_sites(id,account_id,name,slug,status,is_default)
      VALUES('draft_site','owner','Revise draft','revise-draft','draft',0),
            ('foreign','other','Foreign','foreign','active',1)`);
    const api=connection(db);
    const results=await listCmsSites(api,'owner');
    assert.deepEqual(results.map(s=>s.id),['draft_site']);
    assert.equal(results[0].is_default,0);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM cms_sites WHERE account_id='owner'").get().n,1);
    assert.equal((await listCmsSites(api,'missing')).length,0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM cms_sites').get().n,2);
  }finally{db.close();}
});
