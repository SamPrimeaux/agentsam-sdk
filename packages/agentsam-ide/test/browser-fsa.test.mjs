import assert from 'node:assert/strict';
import test from 'node:test';
import {createBrowserFsaWorkspace} from '../dist/workspace/browser-fsa.js';
import {createWorkspaceTextFile} from '../dist/workspace/file-creation.js';

function fixture(){
  const disk=new Map([['README.md','First'],['main.ts','export const one=1;']]);
  const file=name=>({kind:'file',name,
    async getFile(){if(!disk.has(name))throw Error('missing');return new Blob([disk.get(name)],{type:'text/plain'});},
    async createWritable(){let next='';return {async write(text){next=String(text);},async close(){disk.set(name,next);},async abort(){}};},
  });
  const root={kind:'directory',name:'chosen',
    async *entries(){for(const name of disk.keys())yield [name,file(name)];},
    async getFileHandle(name,options={}){if(!disk.has(name)){if(options.create)disk.set(name,'');else throw Error('missing');}return file(name);},
    async getDirectoryHandle(){throw Error('missing folder');},
    async removeEntry(name){disk.delete(name);},
  };
  return {root,disk};
}

test('authorized browser folder reads, lists, writes and verifies a real version',async()=>{
  const {root,disk}=fixture(),fs=createBrowserFsaWorkspace(root);
  assert.deepEqual((await fs.list('.')).map(f=>f.path),['main.ts','README.md']);
  const initial=await fs.read('main.ts');
  assert.equal(initial.language,'typescript');
  assert.match(initial.version,/^[0-9a-f]{64}$/);
  const saved=await fs.write('main.ts','const changed=true;',initial.version);
  assert.equal(saved.ok,true);
  assert.equal(disk.get('main.ts'),'const changed=true;');
  assert.notEqual(saved.file.version,initial.version);
  assert.equal(fs.configuration.manualSave,true);
  const stale=await fs.write('main.ts','will not overwrite',initial.version);
  assert.equal(stale.code,'version_conflict');
  assert.equal(disk.get('main.ts'),'const changed=true;');
  await assert.rejects(fs.read('../secret'),/Invalid|relative/i);
  await assert.rejects(fs.delete('main.ts',initial.version),/changed on disk/);
  await fs.delete('main.ts',saved.file.version);
  assert.equal(disk.has('main.ts'),false);
});

test('unsupported operations fail explicitly without simulated success',async()=>{
  const fs=createBrowserFsaWorkspace(fixture().root);
  await assert.rejects(fs.rename('README.md','changed.md'),/atomic rename/);
  await assert.rejects(fs.history('README.md'),/history/);
  await assert.rejects(fs.restore('README.md','revision','version'),/restoration/);
});

test('New File Save As creates nested browser file using leaf name, not a slash-delimited getFileHandle', async()=>{
  const disk=new Map();
  const attempted=[];
  const fileHandle=name=>({
    kind:'file',name,
    async getFile(){return new Blob([disk.get(name)||''],{type:'text/plain'});},
    async createWritable(){let pending='';return {async write(value){pending=String(value);},async close(){disk.set(name,pending);},async abort(){}};},
  });
  const nested={
    kind:'directory',name:'reports',
    async *entries(){for(const name of disk.keys())yield [name,fileHandle(name)];},
    async getFileHandle(name,options={}){
      attempted.push(name);
      if(name.includes('/'))throw new TypeError('Name is not allowed');
      if(!disk.has(name)){if(!options.create)throw Error('missing');disk.set(name,'');}
      return fileHandle(name);
    },
    async getDirectoryHandle(){throw Error('missing directory');},
  };
  const root={
    kind:'directory',name:'project',
    async *entries(){yield ['reports',nested];},
    async getDirectoryHandle(name){if(name==='reports')return nested;throw Error('missing directory');},
    async getFileHandle(){throw Error('root should not receive nested file handle');},
  };
  const workspace=createBrowserFsaWorkspace(root);
  const saved=await createWorkspaceTextFile(workspace,'reports/validate_project.py','print("verified")');
  assert.equal(saved.path,'reports/validate_project.py');
  assert.equal(saved.content,'print("verified")');
  assert.ok(attempted.length >= 3);
  assert.ok(attempted.every(name=>name==='validate_project.py'));
  assert.equal(disk.get('validate_project.py'),'print("verified")');
});
