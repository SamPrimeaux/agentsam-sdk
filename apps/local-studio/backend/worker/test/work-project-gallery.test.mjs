import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadProjectMedia } from '../work-service.js';

test('project gallery queries through owner-scoped project association', async () => {
 let executed = '';
 let bound = '';
 const db = { prepare(sql) {
   executed = sql;
   return { bind(owner) {
     bound = owner;
     return { async all() { return { results: [
       { id: 'public-1', project_id: 'proj_house', filename: 'roof.webp',
         object_key: 'sites/agentsam-sdk/public/media/roof.webp', content_type:'image/webp',
         source_kind:'r2', size_bytes:1024, updated_at:'2026-10-27 15:00:00' },
       { id: 'private-2', project_id:'proj_house', filename:'floor.fcstd',
         object_key:'private/project/floor.fcstd', source_kind:'r2', size_bytes:18000,
         updated_at:'2026-10-27 15:00:00' },
     ] }; } };
   } };
 } };
 const result = await loadProjectMedia(db, 'owner-one', 'https://agentsam.inneranimalmedia.com');
 assert.match(executed, /INNER JOIN projects p ON p.id = m.project_id/);
 assert.match(executed, /p.owner_user_id = \?/);
 assert.equal(bound,'owner-one');
 assert.equal(result.length,2);
 assert.equal(result[0].projectId,'proj_house');
 assert.equal(result[0].preview,'https://agentsam.inneranimalmedia.com/site/media/roof.webp');
 assert.equal(result[1].preview,null,'Private object key must never become public preview URL');
});
test('project gallery has no unscoped fallback',async()=>{
 assert.deepEqual(await loadProjectMedia(null,'owner','https://example.com'),[]);
 assert.deepEqual(await loadProjectMedia({prepare(){throw Error('DB unavailable')}},'owner','https://example.com'),[]);
 assert.deepEqual(await loadProjectMedia({prepare(){throw Error('DB unavailable')}},'','https://example.com'),[]);
});
