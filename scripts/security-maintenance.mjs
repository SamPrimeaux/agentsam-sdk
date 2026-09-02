import fs from 'node:fs';
import path from 'node:path';
import { repairProject } from '../src/security/repair.js';
import { runProcess } from '../src/security/process.js';

const output = path.join(process.env.RUNNER_TEMP || process.cwd(), 'dependency-repair.json');
const token = process.env.GH_TOKEN;
delete process.env.GH_TOKEN;
delete process.env.GITHUB_TOKEN;
const run = async (command, args, cwd = process.cwd()) => {
  const result = await runProcess(command, args, { cwd, env: command === 'gh' ? { ...process.env, GH_TOKEN: token } : process.env });
  if (result.code) throw new Error(command + ' operation failed');
  return result.stdout.trim();
};
let receipt;
try {
  const prs = JSON.parse(await run('gh',['pr','list','--state','open','--json','headRefName,url']));
  const pending = prs.find(pr => pr.headRefName.startsWith('agentsam/security-'));
  if (pending) {
    receipt = { ok: false, status: 'existing-repair-awaiting-review', pull_request: pending.url };
  } else {
    receipt = await repairProject({ projectRoot: process.cwd(), apply: true });
    if (receipt.verified && receipt.changed_files?.length) {
      await run('git',['add','--',receipt.before.lockfile],receipt.worktree);
      await run('git',['-c','user.name=AgentSam dependency maintenance','-c','user.email=41898282+github-actions[bot]@users.noreply.github.com','commit','-m','fix(deps): apply verified dependency repairs'],receipt.worktree);
      await run('git',['push','origin','HEAD:refs/heads/'+receipt.branch],receipt.worktree);
      const body = path.join(process.env.RUNNER_TEMP || path.dirname(receipt.worktree), 'dependency-repair-pr.md');
      fs.writeFileSync(body, [
        'Dependency findings were resolved within the existing manifest ranges in an isolated Git worktree.',
        '',
        'Validation: npm ci with lifecycle scripts disabled, the project verification script, and a complete OSV rescan with install/test-log triage all passed.',
        '',
        'No package declarations or major versions were changed. This PR does not publish or deploy.',
      ].join('\n'), { mode: 0o600 });
      receipt.pull_request = await run('gh',['pr','create','--base','main','--head',receipt.branch,'--title','fix(deps): verified dependency maintenance','--body-file',body],receipt.worktree);
    }
  }
} catch {
  receipt = { ...(receipt || {}), ok: false, status: 'maintenance-incomplete', reason: 'Check GitHub permissions, network access, project verification, or the retained repair candidate.' };
}
fs.writeFileSync(output,JSON.stringify(receipt,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify({status:receipt.status,pull_request:receipt.pull_request || null,receipt:output}));
process.exitCode = receipt.ok ? 0 : 1;
