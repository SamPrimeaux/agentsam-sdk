import test from 'node:test';
import assert from 'node:assert/strict';
import { createSqliteD1 } from './work-sqlite-d1.js';
import { loadProjectDraws,readProjectDrawingFile,isWorkRequest } from './work-service.js';
test('real project drawing uses canonical ownership plus storage registration, never exposes private key',async()=>{
  const db=createSqliteD1(':memory:');
  try{
    db.exec([
      "CREATE TABLE projects(id TEXT PRIMARY KEY,owner_user_id TEXT)",
      "CREATE TABLE project_storage(id TEXT PRIMARY KEY,project_id TEXT)",
      "CREATE TABLE project_draws(id INTEGER PRIMARY KEY,project_id TEXT,storage_id TEXT,title TEXT,filename TEXT,generation_type TEXT,created_at TEXT,sha256 TEXT,r2_key TEXT)",
      "INSERT INTO projects VALUES ('house','owner'),('other','someone_else')",
      "INSERT INTO project_storage VALUES ('s1','house'),('s2','other')",
      "INSERT INTO project_draws VALUES (1,'house','s1','House BIM','house.pdf','bim_review_sheet','2026-10-28 12:00:00',NULL,'private/secret.key')",
      "INSERT INTO project_draws VALUES (2,'other','s2','Other BIM','other.pdf','bim_drafting_sheet','2026-10-28 12:00:00',NULL,'private/other.key')",
      "INSERT INTO project_draws VALUES (3,'house','s2','Wrong linkage','broken.pdf','bim_review_sheet','2026-10-28 12:00:00',NULL,'private/other.key')"
    ].join(';\n')+';');
    const rows=await loadProjectDraws(db,'owner');
    assert.equal(rows.length,1);
    assert.equal(rows[0].name,'House BIM');
    assert.equal(rows[0].projectId,'house');
    assert.equal(rows[0].preview,'/api/work/projects/house/draws/1/file');
    assert.equal(JSON.stringify(rows).includes('private/'),false);
    assert.equal((await loadProjectDraws(db,'someone_else')).length,1);
    assert.deepEqual(await loadProjectDraws(db,'missing'),[]);
  } finally {db.close();}
});

test('registered CAD file streams through private owner-scoped R2 proxy', async()=>{
 const db=createSqliteD1(':memory:');
 let accessed=0;
 try{
   db.exec([
     "CREATE TABLE projects (id TEXT PRIMARY KEY, owner_user_id TEXT)",
     "CREATE TABLE project_storage (id TEXT PRIMARY KEY, project_id TEXT,storage_type TEXT,storage_name TEXT,status TEXT)",
     "CREATE TABLE project_draws (id INTEGER PRIMARY KEY, project_id TEXT,storage_id TEXT,r2_key TEXT,filename TEXT,title TEXT)",
     "INSERT INTO projects VALUES ('house','owner'),('other','someone-else')",
     "INSERT INTO project_storage VALUES ('cad-storage','house','r2','cad','active')",
     "INSERT INTO project_draws VALUES (12,'house','cad-storage','private/floor.pdf','floor.pdf','Floor')"
   ].join(';\n')+';');
   const env={DB:db,CAD_PROJECT_ASSETS:{async get(key){
     accessed++;assert.equal(key,'private/floor.pdf');
     return {body:new Blob(['%PDF-1.4\n']).stream()};
   }}};
   assert.equal(isWorkRequest('/api/work/projects/house/draws/12/file'),true);
   assert.equal((await readProjectDrawingFile(env,'not-owner','house','12')).status,404);
   assert.equal((await readProjectDrawingFile(env,'owner','house','bogus')).status,404);
   assert.equal(accessed,0);
   const res=await readProjectDrawingFile(env,'owner','house','12');
   assert.equal(res.status,200);
   assert.equal(res.headers.get('content-type'),'application/pdf');
   assert.match(res.headers.get('content-disposition'),/^inline/);
   assert.equal(res.headers.get('cache-control'),'private, no-store');
   assert.match(await res.text(),/%PDF/);
   assert.equal(accessed,1);
 } finally {db.close();}
});
