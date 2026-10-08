import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COMPOSER_GROUPS, projectComposerCatalog, filterComposerCatalog,
} from '../dist/agent/capability-catalog.js';

test('portable capability entrypoint is React/CSS-free and keeps real source authority',()=>{
  const result=projectComposerCatalog({
    connections:[{provider:'cloudflare',kind:'oauth',status:'connected'}],
    plugins:[{id:'mcp-1',plugin_key:'cloudflare-mcp',display_name:'Cloudflare MCP',plugin_kind:'mcp',
      is_enabled:true,composer_visible:true,setup_status:'connected',auth_type:'oauth',health_status:'healthy'}],
    widgets:[{id:'browser',label:'Browser',ready:true,action:{type:'open-side-stage',tab:'browser'}}],
  });
  assert.deepEqual(result.map(entry=>entry.mention),['@cloudflare','@cloudflare-mcp','@browser']);
  assert.equal(result.find(x=>x.kind==='mcp')?.ready,true);
  assert.equal(result.find(x=>x.kind==='widget')?.action.tab,'browser');
  assert.equal(filterComposerCatalog(result,'cl').length,2);
  assert.ok(COMPOSER_GROUPS.some(x=>x.kind==='skill'));
  assert.ok(!result.some(x=>x.kind==='skill'),'No discovered skills means no fake skill list');
});
