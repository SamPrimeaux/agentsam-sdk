import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloudflareAnalyticsSqlClient,normalizeAnalyticsSqlCount } from '../src/families/analytics-sql.js';
test('query adapter never invents data without binding',async()=>{
 const client=createCloudflareAnalyticsSqlClient();
 assert.deepEqual(await client.query('SELECT COUNT(*) FROM events.httpRequests'),{available:false,rows:[],statistics:null,reason:'analytics_sql_not_bound'});
 assert.equal(normalizeAnalyticsSqlCount([], 'requests'),null);
});
test('reads binding-supplied account scope without SQL auth predicates',async()=>{
 let seen;
 const client=createCloudflareAnalyticsSqlClient({binding:{query:async q=>{seen=q;return {data:[{requests:5}],rows:1}}}});
 const value=await client.query('SELECT COUNT(*) AS requests FROM events.httpRequests WHERE timestamp >= $start',{start:'2026-10-08'});
 assert.equal(value.rows[0].requests,5);
 assert.deepEqual(seen.params,{start:'2026-10-08'});
 for(const sql of ['DELETE FROM events.httpRequests','SELECT * FROM events.httpRequests WHERE accountTag = 123','SELECT 1; DROP TABLE x']) {
  await assert.rejects(()=>client.query(sql),TypeError);
 }
});
test('only retryable Cloudflare errors are retried, and only bounded attempts',async()=>{
 let attempts=0;
 const client=createCloudflareAnalyticsSqlClient({retries:2,sleep:async()=>{},binding:{query:async()=>{
  attempts++;if(attempts<3)throw Object.assign(new Error('busy'),{retryable:true});
  return {data:[{requests:1}]};
 }}});
 assert.equal((await client.query('SELECT 1 AS requests')).rows[0].requests,1);
 assert.equal(attempts,3);
});
