import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createWorkspaceTextFile } from '../dist/workspace/file-creation.js';

function fakeWorkspace() {
  const files = new Map();
  const writes = [];
  const workspace = {
    async list(dir='') {
      return [...files.keys()].filter(path => (dir ? path.startsWith(dir+'/') : !path.includes('/')))
        .map(path => ({path,kind:'file'} ));
    },
    async read(path) { const file=files.get(path); if(!file)throw Error('missing_file');return file; },
    async create(path,kind) {
      assert.equal(kind,'file');
      files.set(path,{path,content:'',version:'v1'});
      return {path,kind};
    },
    async write(path,content,expectedVersion,options) {
      writes.push({path,expectedVersion,overwrite:Boolean(options?.overwrite)});
      if(expectedVersion !== files.get(path)?.version) return {ok:false,code:'version_conflict',message:'Changed'};
      const file={path,content,version:'v2'};
      files.set(path,file);
      return {ok:true,file};
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
  const nested={...workspace,async list(){return [];},async create(p,kind){files.set(p,{path:p,content:'',version:'v1'});return {path:p,kind};}};
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

test('Save As creates missing parent folders through the authorized adapter',async()=>{
  const {workspace,files}=fakeWorkspace();
  const folders=new Set();
  const created=[];
  const nested={
    ...workspace,
    async list(parent='') {
      return [
        ...[...folders].filter(path => path.split('/').slice(0,-1).join('/')===parent)
          .map(path=>({path,kind:'folder'})),
        ...[...files.keys()].filter(path => path.split('/').slice(0,-1).join('/')===parent)
          .map(path=>({path,kind:'file'})),
      ];
    },
    async create(path,kind) {
      created.push({path,kind});
      if(kind==='folder')folders.add(path);
      else files.set(path,{path,content:'',version:'v1'});
      return {path,kind};
    },
  };
  const saved=await createWorkspaceTextFile(nested,'src/nested/example.py','print("created")');
  assert.equal(saved.content,'print("created")');
  assert.deepEqual(created,[
    {path:'src',kind:'folder'},{path:'src/nested',kind:'folder'},
    {path:'src/nested/example.py',kind:'file'},
  ]);
});
