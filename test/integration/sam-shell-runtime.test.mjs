import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import { saveAccountSession } from '../../src/lib/account-session.js';
import { createShellSamAdapter } from '../../src/sam/shell-host.js';
import { createCapabilityAdapter } from '../../src/agent/capability-adapter.js';
import { buildAgentToolSurface } from '../../src/agent/responses-runner.js';

test('CLI model catalog uses authenticated local SAM handlers, imports source, creates derivative', async () => {
  const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'sam-shell-test-'));
  try {
    const home=path.join(tmp,'home');
    const project=path.join(tmp,'project');
    await fs.mkdir(home);
    await fs.mkdir(project);
    saveAccountSession({
      access_token:'fixture-oauth-access',user_id:'au_fixture',account_id:'acc_fixture',
      expires_at:'2032-01-01T00:00:00.000Z',
    },{home});
    const sourceFile=path.join(project,'source.png');
    const png=await sharp({
      create:{width:8,height:8,channels:4,background:'#ffffff'},
    }).png().toBuffer();
    await fs.writeFile(sourceFile,png);
    const permissions=[];
    const state={home,cwd:project,projectRoot:project};
    const samAdapter=createShellSamAdapter({
      state,
      authorize:async request=>{permissions.push(request.capability_id);return true;},
    });
    assert.ok(samAdapter);
    assert.equal(samAdapter.canInvoke('media.local.import'),true);
    assert.equal(samAdapter.canInvoke('sam.superbash'),false);
    const agentAdapter=createCapabilityAdapter({
      projectRoot:project,samAdapter,authorizeCapability:async()=>true,
    });
    const selected=buildAgentToolSurface(agentAdapter,'import and remove the background from my image file source.png',{maxTools:8});
    assert.ok(selected.descriptors.some(x=>x.name==='media.local.import'));
    assert.ok(selected.descriptors.some(x=>x.name==='media.image.background.remove'));
    const imported=await agentAdapter.invoke('media.local.import',{relativePath:'source.png'});
    assert.equal(imported.ok,true,JSON.stringify(imported.error));
    const removed=await agentAdapter.invoke('media.image.background.remove',{assetId:imported.data.assetId});
    assert.equal(removed.ok,true,JSON.stringify(removed.error));
    assert.ok(removed.data.derivativeAssetId);
    assert.deepEqual(permissions,['media.local.import','media.image.background.remove']);
    const denied=await agentAdapter.invoke('media.local.import',{relativePath:'../outside.png'});
    assert.equal(denied.ok,false);
    assert.match(denied.error.message,/media_path_outside_project/);

    const otherState={cwd:project,projectRoot:project,home:path.join(tmp,'not-signed-in')};
    assert.equal(createShellSamAdapter({state:otherState,authorize:async()=>true}),null);
  } finally {await fs.rm(tmp,{recursive:true,force:true});}
});

test('API-key identity must be verified by IAM; local session need not be fresh', async () => {
  const { resolveShellSamIdentity } = await import('../../src/sam/shell-host.js');
  const home=path.join(os.tmpdir(),'sam-api-key-test-home');
  const state={home,cwd:os.tmpdir(),projectRoot:os.tmpdir()};
  let contextCalls=0;
  const verified=await resolveShellSamIdentity({
    state,
    authorityLoader:async()=>({value:'fixture-api-key'}),
    contextLoader:async (route, opts)=>{
      contextCalls++;
      assert.equal(route,'/api/sdk/context');
      assert.equal(opts.bearer,'fixture-api-key');
      return {user_id:'au_verified',account_id:'acc_verified'};
    },
  });
  assert.equal(verified.actorId,'au_verified');
  assert.equal(verified.accountId,'acc_verified');
  assert.equal(contextCalls,1);
  assert.ok(createShellSamAdapter({state,trustedIdentity:verified,authorize:async()=>true}));
  const missing=await resolveShellSamIdentity({
    state,authorityLoader:async()=>({value:'fixture-api-key'}),
    contextLoader:async()=>({message:'no verified identity'}),
  });
  assert.equal(missing,null);
  assert.equal(createShellSamAdapter({state,trustedIdentity:missing,authorize:async()=>true}),null);
});
