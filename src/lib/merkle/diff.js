import { comparePaths } from './hash.js';
import { validateSnapshot } from './snapshot.js';

export function diffTrees(beforeInput, afterInput) {
  const before = validateSnapshot(beforeInput);
  const after = validateSnapshot(afterInput);
  if (JSON.stringify(before.policy) !== JSON.stringify(after.policy)) {
    throw new Error('Snapshots use different ignore rules. Rebuild them with the same include/exclude policy.');
  }
  const left = new Map(before.entries.map((entry) => [entry.path, entry]));
  const right = new Map(after.entries.map((entry) => [entry.path, entry]));
  const stats = { unchanged: 0, modified: 0, added: 0, removed: 0 };
  const changes = [];
  for (const name of [...new Set([...left.keys(), ...right.keys()])].sort(comparePaths)) {
    const a = left.get(name), b = right.get(name);
    if ((!a || a.type === 'directory') && (!b || b.type === 'directory')) continue;
    const status = !a || a.type === 'directory' ? 'added' : !b || b.type === 'directory' ? 'removed'
      : a.type === b.type && a.hash === b.hash ? 'unchanged' : 'modified';
    stats[status]++;
    if (status !== 'unchanged') changes.push({ path: name, status, before: a || null, after: b || null });
  }
  return { equal: before.rootHash === after.rootHash, beforeHash: before.rootHash, afterHash: after.rootHash, stats, changes };
}
