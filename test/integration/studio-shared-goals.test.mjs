import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handleStudioLivingPlan } from '../../apps/local-studio/backend/worker/studio-living-plan.js';
import { resolveStudioGoalsCliAccount } from '../../apps/local-studio/backend/worker/studio-goals-auth.js';
import { createLivingPlanFixture } from '../../apps/local-studio/backend/worker/studio-living-plan.fixture.mjs';
import { runGoals } from '../../src/commands/goals.js';
import { runGoap } from '../../src/commands/goap.js';
import { saveAccountSession } from '../../src/lib/account-session.js';

test('CLI account goals use the same persistence as Studio and ignore caller-supplied account identity', async () => {
  const { DB,call } = createLivingPlanFixture();
  const home = mkdtempSync(join(tmpdir(),'agentsam-shared-goals-'));
  try {
    saveAccountSession({ access_token:'fixture-cli-session', account_id:'au_other' },{home});
    const env = { DB, IAM_OAUTH_ISSUER:'https://issuer.test' };
    const authority = async (url,init) => {
      assert.equal(url.href,'https://issuer.test/api/sdk/context');
      assert.equal(init.headers.authorization,'Bearer fixture-cli-session');
      return Response.json({auth_type:'agentsam_browser_oauth',owner_account_id:'au_owner'});
    };
    const transport = async (url,init) => {
      const request = new Request(url,init);
      const account = await resolveStudioGoalsCliAccount(request,env,authority);
      return handleStudioLivingPlan(request,env,account);
    };
    await runGoals(['set','Ship the mobile dock','--description','Verify on iPhone'],{home,fetchImpl:transport});
    const snapshot = await call('/api/studio/living-plan');
    const goal = snapshot.data.goals[0];
    assert.equal(goal.title,'Ship the mobile dock');
    assert.equal(goal.description,'Verify on iPhone');
    assert.equal((await call('/api/studio/living-plan','GET',null,'au_other')).data.goals.length,0);
    await runGoals(['status',goal.id,'paused'],{home,fetchImpl:transport});
    assert.equal((await call('/api/studio/living-plan')).data.goals[0].status,'paused');
    execFileSync('git',['init','-q',home]);
    execFileSync('git',['-C',home,'remote','add','origin','https://github.com/owner/repo.git']);
    await runGoap('new',{cwd:home,home,args:['Verify the dock'],fetchImpl:transport});
    const work = (await call('/api/studio/living-plan')).data.goapGoals[0];
    assert.equal(work.title,'Verify the dock');
    assert.equal(work.focused,true);
    await runGoals(['link',goal.id,work.id],{home,fetchImpl:transport});
    assert.equal((await call('/api/studio/living-plan')).data.ticketLinks[0].ticket_id,work.id);
    await runGoap('close',{cwd:home,home,args:['--status','blocked'],fetchImpl:transport});
    assert.equal((await call('/api/studio/living-plan')).data.goapGoals[0].goal_status,'blocked');
    assert.equal((await call('/api/studio/living-plan')).data.goapGoals[0].focused,false);
    const request = new Request('https://studio.test',{headers:{authorization:'Bearer delegated-key'}});
    assert.equal(await resolveStudioGoalsCliAccount(request,env,async()=>Response.json({
      auth_type:'agentsam_api_key',owner_account_id:'au_owner',
    })),null);
  } finally {
    rmSync(home,{recursive:true,force:true});
  }
});
