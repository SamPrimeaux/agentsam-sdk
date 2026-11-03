#!/usr/bin/env node
/**
 * Read-only inventory of the real Git checkout. Designed to prevent a worktree,
 * branch, or stash disappearing from release planning. Never mutates Git state.
 * Usage: npm run wip:audit ; npm run wip:audit -- --json
 */
import { execFileSync } from 'node:child_process';
import { cwd } from 'node:process';

const git = (args, { at = cwd(), tolerate = false } = {}) => {
  try {
    return execFileSync('git', ['-C', at, ...args], {
      encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
    }).trimEnd();
  } catch (error) {
    if (tolerate) return '';
    throw new Error('Git inventory failed (' + args.join(' ') + '): ' + (error.stderr?.toString() || error.message));
  }
};
const root = git(['rev-parse', '--show-toplevel']);
const mainRef = git(['rev-parse', '--verify', 'origin/main'], { tolerate: true })
  ? 'origin/main' : (git(['rev-parse', '--verify', 'main'], { tolerate: true }) ? 'main' : 'HEAD');
const mainSha = git(['rev-parse', '--short', mainRef]);
const branchLines = git(['for-each-ref', '--sort=-committerdate',
  '--format=%(refname:short)%09%(objectname:short)%09%(committerdate:short)%09%(subject)', 'refs/heads']);
const branches = branchLines.split('\n').filter(Boolean).filter(line => !line.startsWith('main\t')).map(line => {
  const [name, sha, updated, subject] = line.split('\t');
  const ahead = Number(git(['rev-list', '--count', mainRef + '..' + name]));
  const behind = Number(git(['rev-list', '--count', name + '..' + mainRef]));
  return {
    name, sha, updated, subject, ahead, behind,
    state: ahead === 0 ? 'ancestor_or_equal' : 'reconcile_before_cleanup',
  };
});

const worktrees = [];
for (const group of git(['worktree', 'list', '--porcelain']).split(/\n\s*\n/)) {
  const path = group.split('\n').find(line => line.startsWith('worktree '))?.slice('worktree '.length);
  if (!path) continue;
  const branch = group.split('\n').find(line => line.startsWith('branch '))?.slice('branch refs/heads/'.length) ?? 'detached';
  const status = git(['status', '--porcelain'], { at: path, tolerate: true }).split('\n').filter(Boolean);
  worktrees.push({ path, branch, dirtyPaths: status.length, changed: status.slice(0, 12) });
}
const stashes = git(['stash', 'list', '--format=%gd%x09%gs'], { tolerate: true })
  .split('\n').filter(Boolean).map(line => {
    const [id, ...words] = line.split('\t');
    const paths = git(['stash', 'show', '--name-only', '--format=', id], { tolerate: true })
      .split('\n').filter(Boolean);
    return { id, description: words.join(' '), fileCount: paths.length, samplePaths: paths.slice(0, 12) };
  });
const report = {
  generatedAt: new Date().toISOString(), root, mainRef, mainSha,
  counts: { branches: branches.length, branchesToReconcile: branches.filter(b => b.ahead > 0).length,
    worktrees: worktrees.length, dirtyWorktrees: worktrees.filter(w => w.dirtyPaths).length, stashes: stashes.length },
  branches, worktrees, stashes,
};
if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const safe = value => String(value ?? '').replaceAll('|','\\|').replaceAll('\n',' ');
  console.log('# AgentSam WIP landscape — ' + report.generatedAt + '\n');
  console.log('Compared with locally cached ' + mainRef + ' @ ' + mainSha + '. No fetch, delete, reset, or stash apply was performed.\n');
  console.log('**' + branches.length + ' branches**, **' + report.counts.branchesToReconcile + ' with unmatched commit histories**, **' +
    worktrees.length + ' worktrees (' + report.counts.dirtyWorktrees + ' dirty)**, **' + stashes.length + ' stashes**.\n');
  console.log('Unique commits are not proof of missing functionality after squash/cherry-pick.\n');
  console.log('## Local branches\n\n| Branch | Ahead | Behind | State | Latest change |\n|---|---:|---:|---|---|');
  for (const b of branches) console.log('| ' + [safe(b.name),b.ahead,b.behind,safe(b.state),safe(b.subject)].join(' | ') + ' |');
  console.log('\n## Worktrees\n\n| Branch | Dirty paths | Location |\n|---|---:|---|');
  for (const w of worktrees) console.log('| ' + [safe(w.branch),w.dirtyPaths,safe(w.path)].join(' | ') + ' |');
  console.log('\n## Stashes\n\n| Stash | Changed files | Saved intent |\n|---|---:|---|');
  for (const s of stashes) console.log('| ' + [s.id,s.fileCount,safe(s.description)].join(' | ') + ' |');
  console.log('\n**Cleanup policy:** a branch with zero ahead commits may still have a dirty worktree; a stash must be compared before dropping. Never auto-delete either.');
}
