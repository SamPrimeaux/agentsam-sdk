import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  buildFsChangeMapFromStatus, buildVisibleChangePathSet,
  mapStatusTokenToState, toWorkspaceChanges,
} from './changes.ts';

test('migrated AgentSamFilesystem Changes preserves GitHub rename and delete semantics', () => {
  const changes=toWorkspaceChanges({files:[
    {filename:'src/edit.ts',status:'modified',sha:'abcdef0123456'},
    {filename:'src/moved.ts',status:'renamed',previous_filename:'src/old.ts'},
    {filename:'docs/old.md',status:'removed'},
  ]});
  assert.deepEqual(changes,[
    {path:'docs/old.md',status:'deleted'},
    {path:'src/edit.ts',status:'modified'},
    {path:'src/moved.ts',status:'renamed',previousPath:'src/old.ts'},
  ]);
});

test('Changes overlay preserves ancestor folders and excludes pending change-set staging', () => {
  const map=buildFsChangeMapFromStatus({files:[
    {filename:'src/nested/file.ts',status:'added'},
    {filename:'src/other.ts',status:'modified',source:'change_set_pending'},
  ]});
  assert.equal(map.has('src/other.ts'),false);
  const visible=buildVisibleChangePathSet(map);
  assert.ok(visible.has('src'));
  assert.ok(visible.has('src/nested'));
  assert.ok(visible.has('src/nested/file.ts'));
  assert.equal(mapStatusTokenToState('removed'),'deleted');
});
