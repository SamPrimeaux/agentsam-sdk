import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const cli = fileURLToPath(new URL('../../bin/agentsam', import.meta.url));
function run(repo, args) {
  const p = spawnSync(process.execPath, [cli, ...args], {
    cwd:repo, timeout:15000, encoding:'utf8',
    env:{...process.env, NO_COLOR:'1'},
  });
  assert.equal(p.status,0,'Failed '+args.join(' ')+': '+p.stderr+' '+p.stdout);
  return JSON.parse(p.stdout);
}
test('real local GOAP world projects evidence-gated Plan selection and reports missing AutoRAG without indexing',()=>{
  const root = mkdtempSync(path.join(tmpdir(),'sam-goap-world-'));
  try {
    assert.equal(spawnSync('git',['init','-q'],{cwd:root}).status,0);
    // Repository snapshot requires a resolvable HEAD. This fixture is still
    // completely unconfigured: there is no .agentsam/config.json.
    assert.equal(spawnSync('git',['-c','user.name=AgentSam Test','-c','user.email=test@example.com',
      'commit','--allow-empty','-q','-m','fixture'],{cwd:root}).status,0);
    const plan=run(root,['plan','new','Canonical CMS activation','--json']);
    const inspect=run(root,['plan','add','Inspect existing CMS theme records','--plan',plan.id,
      '--acceptance','D1 authority verified','--json']);
    const activate=run(root,['plan','add','Certify public renderer before activation','--plan',plan.id,
      '--acceptance','Public renderer accepted','--json']);
    run(root,['plan','depends',activate.id,inspect.id,'--json']);
    const first=run(root,['goap','status','--json']);
    assert.equal(first.source,'local_world');
    assert.equal(first.localPlan.id,plan.id);
    assert.equal(first.localStep.id,inspect.id);
    assert.equal(first.activeTicket.id,inspect.id);
    assert.equal(first.canonicalWorld.goal.id,inspect.id);
    assert.equal(first.canonicalWorld.goal.spec.metadata.plan_id,plan.id);
    const autorag=run(root,['autorag','inspect','--cwd',root,'--json']);
    assert.equal(autorag.status,'not_indexed', 'empty repo must not claim fresh evidence');
    assert.equal(autorag.selected,null);
    run(root,['plan','evidence',inspect.id,'--type','test','--ref','cms-schema.test.mjs','--json']);
    run(root,['plan','accept',inspect.id,'D1 authority verified','--evidence','cms-schema.test.mjs','--json']);
    run(root,['plan','done',inspect.id,'--json']);
    const second=run(root,['goap','status','--json']);
    assert.equal(second.localStep.id,activate.id);
    assert.equal(second.canonicalWorld.goal.id,activate.id);
    assert.equal(second.canonicalWorld.goal.spec.constraints[0].todo_id,inspect.id);
    assert.equal(run(root,['plan','next','--json']).step.id,activate.id);
    assert.equal(existsSync(path.join(root,'.agentsam','config.json')),false);
  } finally { rmSync(root,{recursive:true,force:true}); }
});
