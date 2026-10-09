import test from 'node:test';
import assert from 'node:assert/strict';
import {applyLspTextEdits,applyLspWorkspaceEdit,workspaceRootFileUri} from './workspace-edits.ts';

const loc=(line:number,start:number,end:number,newText:string)=>({range:{start:{line,character:start},end:{line,character:end}},newText});

test('LSP position edits apply to UTF-16 text in descending order',()=>{
  const original='function foo() {\n  return foo;\n}\n';
  const result=applyLspTextEdits(original,[loc(0,9,12,'bar'),loc(1,9,12,'bar')]);
  assert.equal(result,'function bar() {\n  return bar;\n}\n');
  assert.throws(()=>applyLspTextEdits('abcdef',[loc(0,1,4,'x'),loc(0,2,5,'y')]),/overlapping/);
});

test('LSP workspace edits reject out-of-root, path traversal and unsupported resource operations before writing',async()=>{
  let writes=0;
  const host={read:async()=>({content:'fn a(){}',version:'v1'}),write:async()=>{writes++;return{version:'v2'}}};
  await assert.rejects(applyLspWorkspaceEdit({changes:{'file:///etc/passwd':[loc(0,0,1,'x')]}},'file:///project',host),/outside_authorized/);
  await assert.rejects(applyLspWorkspaceEdit({changes:{'file:///project/../other':[loc(0,0,1,'x')]}},'file:///project',host),/invalid_edit_path/);
  await assert.rejects(applyLspWorkspaceEdit({documentChanges:[{kind:'rename',oldUri:'file:///project/a',newUri:'file:///project/b'}] as any},'file:///project',host),/resource_operations_not_supported/);
  assert.equal(writes,0);
});

test('multi-file rename reads and validates all files, then uses actual versions for guarded writes',async()=>{
  const files=new Map([['src/a.rs',{content:'fn foo() {}',version:'v1'}],['src/b.rs',{content:'fn main() {foo()}',version:'v2'}]]);
  const seen:string[]=[];
  const result=await applyLspWorkspaceEdit({changes:{
    'file:///project/src/a.rs':[loc(0,3,6,'bar')],
    'file:///project/src/b.rs':[loc(0,11,14,'bar')],
  }},'file:///project',{
    read:async path=>{let x=files.get(path);if(!x)throw Error('not found');return x;},
    write:async(path,content,version)=>{const prev=files.get(path);if(prev?.version!==version)throw Error('version conflict');seen.push(`${path}:${version}`);files.set(path,{content,version:'new'});return{version:'new'};},
  });
  assert.deepEqual(result.applied,['src/a.rs','src/b.rs']);
  assert.deepEqual(seen,['src/a.rs:v1','src/b.rs:v2']);
  assert.equal(files.get('src/a.rs')?.content,'fn bar() {}');
  assert.equal(files.get('src/b.rs')?.content,'fn main() {bar()}');
});

test('root URI is portable and URI-encodes paths',()=>{
  assert.equal(workspaceRootFileUri('/workspace/demo/My Apps'),'file:///workspace/demo/My%20Apps');
  assert.equal(workspaceRootFileUri('D:\\Projects\\Demo'),'file:///D:/Projects/Demo');
});
