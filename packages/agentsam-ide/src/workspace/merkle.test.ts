import assert from 'node:assert/strict';
import test from 'node:test';
import { diffWorkspaceSnapshots, hashWorkspaceEntries } from './merkle.ts';

test('Merkle roots are independent of file order and change with content hashes',async()=>{
  const a=await hashWorkspaceEntries([{path:'src/b.ts',hash:'B'},{path:'src/a.ts',hash:'A'}],'2026-01-01');
  const b=await hashWorkspaceEntries([{path:'src/a.ts',hash:'A'},{path:'src/b.ts',hash:'B'}],'2026-01-01');
  assert.equal(a.rootHash,b.rootHash);
  assert.notEqual(a.rootHash,(await hashWorkspaceEntries([{path:'src/a.ts',hash:'C'},{path:'src/b.ts',hash:'B'}])).rootHash);
});
test('Merkle changes report added, modified and deleted files',async()=>{
  const before=await hashWorkspaceEntries([{path:'a',hash:'1'},{path:'b',hash:'2'}]);
  const after=await hashWorkspaceEntries([{path:'b',hash:'3'},{path:'c',hash:'4'}]);
  assert.deepEqual(diffWorkspaceSnapshots(before,after),[{path:'a',status:'deleted'},{path:'b',status:'modified'},{path:'c',status:'added'}]);
});
test('Merkle refuses missing hashes and traversal paths',async()=>{
  await assert.rejects(hashWorkspaceEntries([{path:'a',hash:''}]));
  await assert.rejects(hashWorkspaceEntries([{path:'../x',hash:'1'}]));
});
