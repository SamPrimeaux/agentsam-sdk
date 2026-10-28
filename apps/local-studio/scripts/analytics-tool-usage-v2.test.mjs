import test from 'node:test';
import assert from 'node:assert/strict';
import {toolUsageSince,queryAccountToolUsage} from '../backend/worker/analytics-tool-usage-v2.js';
test('account is required; workspace is not required or accepted as an ownership override',async()=>{
 await assert.rejects(queryAccountToolUsage({DB:{}},null),/authenticated_account_required/);
});
test('all source queries bind authenticated account and range, never trust request scope',async()=>{
 const seen=[];
 const env={DB:{prepare(sql){
  assert.match(sql,/FROM agentsam_tool_call_log WHERE account_id=\? AND created_at_unix>=\?/);
  return {bind(account,since){
   assert.equal(account,'account-a');
   assert.equal(typeof since,'number');
   seen.push(sql);
   return {
    async first(){return {calls:7,successes:6,failures:1,recorded_cost_usd:.03,average_duration_ms:87,first_event_unix:20,last_event_unix:30};},
    async all(){return {results:sql.includes('GROUP BY tool_key')?[{tool_key:'terminal.exec',calls:7,successes:6,failures:1,average_duration_ms:87,max_duration_ms:100,cache_hits:0,recorded_cost_usd:.03}]:[{day:'2026-10-28',calls:7,successes:6,failures:1}]};}
   };
  }};
 }}};
 const r=await queryAccountToolUsage(env,'account-a','All');
 assert.equal(seen.length,3);
 assert.equal(r.schema,'agentsam.tool-usage.v2');
 assert.equal(r.totals.calls,7);
 assert.equal(r.totals.success_rate,6/7);
 assert.equal(r.by_tool[0].tool_key,'terminal.exec');
 assert.equal(r.by_day.length,1);
 assert.equal(r.coverage.measured_calls,7);
 assert.equal(r.scope,'authenticated_account');
});
test('date scoping is deterministic',()=>{
 assert.equal(toolUsageSince('24h',200000),113600);
 assert.equal(toolUsageSince('All',200000),0);
});
