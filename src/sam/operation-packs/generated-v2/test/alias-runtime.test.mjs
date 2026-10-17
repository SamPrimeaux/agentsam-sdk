import test from 'node:test';
import assert from 'node:assert/strict';
import { createSamOS } from '../../../os.js';
import { AgentSamClient } from '../../../client.js';

const identity = { accountId:'acct_one', actorId:'actor_one', installationId:'install_one' };

test('legacy media operation alias executes the canonical handler but is not double-advertised', async () => {
  const authorized = [];
  let executions = 0;
  const os = createSamOS({
    core:false, generated:{
      resolveTrustedContext:async()=>identity,
      authorize:async({operation})=>{authorized.push(operation);return true;},
      handlers:{
        'media.image.background.remove':async()=>{
          executions++;
          return {ok:true,derivativeAssetId:'ast_saved',sourceAssetId:'ast_original'};
        },
      },
    },
  });
  const client = new AgentSamClient({os});
  const alias = 'media.asset.background.remove';
  const canonical = 'media.image.background.remove';
  assert.equal(os.get(alias),os.get(canonical));
  const result = await client.invoke(alias,{assetId:'ast_original'});
  assert.equal(result.ok,true,JSON.stringify(result.error));
  assert.equal(result.data.derivativeAssetId,'ast_saved');
  assert.equal(executions,1);
  assert.deepEqual(authorized,[canonical],'canonical policy remains the execution authority');
  assert.equal(os.list().filter(x=>x.id===canonical).length,1);
  assert.equal(os.list().some(x=>x.id===alias),false,'no duplicate model tool');
  assert.equal(os.status().generated_unavailable.some(x=>x.name===alias),false);
  assert.deepEqual(os.status().generated_aliases.find(x=>x.name===alias),
    {name:alias,aliasFor:canonical,bound:true});
  assert.throws(()=>os.install([{id:alias,version:1,module:'media',action:'background.remove',
    summary:'wrong',execution:{},input_schema:{type:'object'},output_schema:{type:'object'},
    risk:'write',handler:async()=>({ok:true})}]),/sam_os_duplicate_operation/);
});

test('aliases never fabricate a handler when the canonical implementation is missing',()=>{
  const os=createSamOS({
    core:false, generated:{resolveTrustedContext:async()=>identity, authorize:async()=>true},
  });
  assert.equal(os.get('media.asset.background.remove'),null);
  assert.deepEqual(os.status().generated_aliases.find(x=>x.name==='media.asset.background.remove'),
    {name:'media.asset.background.remove',aliasFor:'media.image.background.remove',bound:false});
  const gap=os.status().generated_unavailable.find(x=>x.name==='media.image.background.remove');
  assert.equal(gap.reason,'handler_not_bound');
  assert.equal(gap.owner,'media');
  assert.equal(gap.nextAction,'connect_authorized_host_handler_or_implement');
});
