import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createWorkspaceTextFile } from '../../dist/workspace/file-creation.js';
import type { FileWorkspace, WorkspaceEntry, WorkspaceFile } from './files.js';

function fakeWorkspace() {
  const files = new Map<string, WorkspaceFile>();
  const writes: Array<{path:string;expectedVersion:string|null;overwrite:boolean}> = [];
  const workspace: FileWorkspace = {
    async list(dir='') {
      return [...files.keys()].filter(path => (dir ? path.startsWith(dir+'/') : !path.includes('/')))
        .map(path => ({path,kind:'file'} satisfies WorkspaceEntry));
    },
    async read(path) { const file=files.get(path); if(!file)throw Error('missing_file');return file; },
    async create(path,kind) {
      assert.equal(kind,'file');
      files.set(path,{path,content:'',version:'v1'});
      return {path,kind};
    },
    async write(path,content,expectedVersion,options) {
      writes.push({path,expectedVersion,overwrite:Boolean(options?.overwrite)});
      if(expectedVersion !== files.get(path)?.version) return {ok:false as const,code:'version_conflict',message:'Changed'};
      const file={path,content,version:'v2'};
      files.set(path,file);
      return {ok:true as const,file};
    },
    async rename() {throw Error('not tested');},
    async delete() {throw Error('not tested');},
    async search() {return [];},
    async history() {return [];},
    async restore() {throw Error('not tested');},
  };
  return {workspace,files,writes};
}

test('New File saves nested path and actual text using verified provider version',async()=>{
  const {workspace,files,writes}=fakeWorkspace();
  const nested:FileWorkspace={...workspace,async list(){return [];},async create(p,kind){files.set(p,{path:p,content:'',version:'v1'});return {path:p,kind};}};
  const saved=await createWorkspaceTextFile(nested,'src/hello.ts','export const ok = true;');
  assert.equal(saved.path,'src/hello.ts');
  assert.equal(saved.content,'export const ok = true;');
  assert.deepEqual(writes,[{path:'src/hello.ts',expectedVersion:'v1',overwrite:false}]);
});

test('New File creates a real empty file, without writing an artificial draft version',async()=>{
  const {workspace,writes,files}=fakeWorkspace();
  const saved=await createWorkspaceTextFile(workspace,'untitled.ts','');
  assert.equal(files.get('untitled.ts')?.content,'');
  assert.equal(saved.version,'v1');
  assert.equal(writes.length,0);
});

test('Save As does not overwrite an existing file or use a readonly provider',async()=>{
  const {workspace,files}=fakeWorkspace();
  files.set('existing.ts',{path:'existing.ts',content:'keep me',version:'v9'});
  await assert.rejects(()=>createWorkspaceTextFile(workspace,'existing.ts','replace'),/already exists/);
  assert.equal(files.get('existing.ts')?.content,'keep me');
  await assert.rejects(()=>createWorkspaceTextFile(
    {...workspace,configuration:{readonly:true}},'new.ts','text'),/writable/);
  assert.equal(files.has('new.ts'),false);
});

test('Save As rejects traversal before any filesystem mutation',async()=>{
  const {workspace,files}=fakeWorkspace();
  await assert.rejects(()=>createWorkspaceTextFile(workspace,'../secrets','text'),/Invalid|workspace-relative/);
  assert.equal(files.size,0);
});
