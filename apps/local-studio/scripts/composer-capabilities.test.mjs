import test from 'node:test';
import assert from 'node:assert/strict';
import { projectComposerCatalog, filterComposerCatalog, COMPOSER_GROUPS } from '../../../packages/agentsam-workbench/src/agent/capability-catalog.ts';
import { SIDE_STAGE_ACTIONS, sideStageComposerWidgets } from '../frontend/agentsam/side-stage-actions.ts';

const connected = {provider:'cloudflare',kind:'oauth',display_name:'Cloudflare',status:'connected'};
const mcp = {id:'pmcp',plugin_key:'agentsam-mcp',display_name:'AgentSam MCP',plugin_kind:'mcp',
  composer_visible:true,is_enabled:true,setup_status:'connected',auth_type:'oauth',health_status:'healthy',tool_count:14};
test('Settings/OAuth status projects into composer without inventing tool permissions', () => {
  const catalog=projectComposerCatalog({connections:[connected],plugins:[mcp]});
  assert.equal(catalog.find(x=>x.mention==='@cloudflare')?.ready,true);
  assert.equal(catalog.find(x=>x.mention==='@agentsam-mcp')?.kind,'mcp');
  assert.equal(catalog.find(x=>x.mention==='@agentsam-mcp')?.action.type,'mention');
  assert.equal(catalog.some(x=>x.mention==='@gmail'),false);
  assert.ok(COMPOSER_GROUPS.some(group=>group.kind==='agent'));
});
test('Disconnected or unhealthy providers never appear as ready', () => {
  const catalog=projectComposerCatalog({
    connections:[{...connected,status:'not_configured'}],
    plugins:[{...mcp,health_status:'auth_error'}, {...mcp,id:'hidden',composer_visible:0}],
  });
  assert.equal(catalog.length,2);
  assert.ok(catalog.every(entry=>!entry.ready && entry.action.type==='setup'));
  assert.equal(catalog.find(entry=>entry.kind==='mcp')?.status,'reconnect');
});
test('Visible plugins use real boolean settings fields; no stale numeric-only filtering', () => {
  const valid={...mcp,plugin_key:'github',id:'github',plugin_kind:'plugin',
    mention_aliases:['@github'],tool_count:3};
  const catalog=projectComposerCatalog({plugins:[valid,{...valid,id:'disabled',is_enabled:false},
    {...valid,id:'invisible',composer_visible:false}]});
  assert.deepEqual(catalog.map(x=>x.mention),['@github']);
});
test('SideStage + and composer @ expose exactly the same mounted widget actions', () => {
  const widgets=sideStageComposerWidgets();
  const projected=projectComposerCatalog({widgets});
  assert.deepEqual(projected.map(x=>x.action.type),SIDE_STAGE_ACTIONS.map(()=> 'open-side-stage'));
  assert.deepEqual(new Set(projected.map(x=>x.action.type==='open-side-stage'?x.action.tab:'')),
    new Set(SIDE_STAGE_ACTIONS.map(x=>x.tab)));
  assert.equal(filterComposerCatalog(projected,'@cl')[0]?.mention,'@cli');
  assert.equal(filterComposerCatalog(projected,'browser')[0]?.action.type,'open-side-stage');
});
