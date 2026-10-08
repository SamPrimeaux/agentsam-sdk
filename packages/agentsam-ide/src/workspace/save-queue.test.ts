import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkspaceSaveQueue } from './save-queue.ts';

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

test('rapid keystrokes debounce to one versioned write with latest content', async () => {
  const writes: Array<{text:string;expected:string|null}> = [];
  const queue = new WorkspaceSaveQueue({
    debounceMs: 8,
    write: async (_,text,expected) => { writes.push({text,expected}); return {ok:true,version:'v2'}; },
  });
  queue.acceptDiskVersion('src/App.tsx','v1');
  queue.edit('src/App.tsx','a');
  queue.edit('src/App.tsx','ab');
  queue.edit('src/App.tsx','abc');
  await delay(22);
  assert.deepEqual(writes,[{text:'abc',expected:'v1'}]);
  assert.equal(queue.version('src/App.tsx'),'v2');
  assert.equal(queue.status('src/App.tsx'),'saved');
});

test('writes serialize; older completion cannot replace newer edits', async () => {
  const writes:string[] = [];
  const commits:Array<{text:string;superseded:boolean}> = [];
  let resume: (() => void) | null = null;
  const wait = new Promise<void>(resolve => {resume=resolve;});
  const queue = new WorkspaceSaveQueue({ debounceMs:10000,
    write: async (_, text, expected) => {writes.push(`${text}:${expected}`);if(writes.length === 1) await wait;return {ok:true,version:`v${writes.length}`};},
    onCommitted:(_path,text,_result,superseded)=> commits.push({text,superseded}),
  });
  queue.acceptDiskVersion('src/App.tsx','v0');
  queue.edit('src/App.tsx','early');
  const first=queue.flush('src/App.tsx');
  queue.edit('src/App.tsx','latest');
  (resume as (()=>void)|null)?.();
  await first;
  await queue.flush('src/App.tsx');
  assert.deepEqual(writes,['early:v0','latest:v1']);
  assert.deepEqual(commits,[{text:'early',superseded:true},{text:'latest',superseded:false}]);
  assert.equal(queue.status('src/App.tsx'),'saved');
});

test('version conflicts never overwrite without explicit operator action', async () => {
  const writes:Array<{text:string;expected:string|null;overwrite:boolean}> = [];
  const queue = new WorkspaceSaveQueue({ debounceMs:5,
    write: async (_, text, expected, overwrite) => {
      writes.push({text,expected,overwrite});
      return overwrite ? {ok:true,version:'v3'} : {ok:false,error:'Changed on disk',code:'version_conflict'};
    },
  });
  queue.acceptDiskVersion('x.ts','v1');
  queue.edit('x.ts','draft');
  await queue.flush('x.ts');
  assert.equal(queue.status('x.ts'),'conflict');
  queue.edit('x.ts','newer draft');
  await delay(20);
  assert.equal(writes.length,1);
  await queue.flush('x.ts',true);
  assert.deepEqual(writes[1],{text:'newer draft',expected:null,overwrite:true});
  assert.equal(queue.status('x.ts'),'saved');
  assert.equal(queue.version('x.ts'),'v3');
});

test('reload discards pending drafts and accepts external version safely', async () => {
  const writes:string[]=[];
  const queue = new WorkspaceSaveQueue({debounceMs:5,write:async (_,text)=>{writes.push(text);return{ok:true,version:'v3'}}});
  queue.acceptDiskVersion('a.ts','v1');
  queue.edit('a.ts','draft');
  queue.discardDraft('a.ts','v2');
  await delay(16);
  assert.deepEqual(writes,[]);
  assert.equal(queue.version('a.ts'),'v2');
  assert.equal(queue.status('a.ts'),'saved');
});

test('initial disk read cannot implicitly clear early typing or permit unversioned writes', async () => {
  const writes:string[]=[];
  const statuses:string[]=[];
  const queue = new WorkspaceSaveQueue({debounceMs:1000,
    write:async (_,text,version)=>{writes.push(`${text}:${version}`);return {ok:true,version:'v2'};},
    onStatus:(_path,status)=>statuses.push(status),
  });
  queue.edit('src/a.ts','typed before read');
  await queue.flush('src/a.ts');
  assert.deepEqual(writes,[]);
  assert.equal(queue.status('src/a.ts'),'error');
  queue.acceptDiskVersion('src/a.ts','v1');
  assert.equal(queue.status('src/a.ts'),'error');
  await queue.flush('src/a.ts');
  assert.deepEqual(writes,['typed before read:v1']);
  assert.equal(queue.status('src/a.ts'),'saved');
});
