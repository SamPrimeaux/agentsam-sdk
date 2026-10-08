import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {LspHost,resolveLanguageServerBinary} from '../../packages/agentsam-ide/src/lsp/host.mjs';
const fixture=fileURLToPath(new URL('../fixtures/ide-fake-lsp-server.mjs',import.meta.url));

async function answer(host,id,request,cursor=0){
  assert.ok(host.send(id,request).ok);
  for(let i=0;i<70;i++){
    await new Promise(r=>setTimeout(r,25));
    const poll=host.poll(id,cursor);
    const result=poll.messages.find(x=>x.message.id===request.id);
    if(result)return result.message;
  }
  throw Error('expected LSP response never arrived');
}

test('host parses fragmented Content-Length frames and multibyte JSON text',async()=>{
  const host=new LspHost({root:os.tmpdir(),spawnProcess:()=>spawn(process.execPath,[fixture],{stdio:['pipe','pipe','pipe']})});
  try{
    const one=host.start('rust');assert.ok(one.ok);
    const two=host.start('rust');assert.ok(two.ok);
    assert.notEqual(one.session_id,two.session_id,'different editors must not share process initialization');
    const response=await answer(host,one.session_id,{jsonrpc:'2.0',id:1,method:'test/unicode'});
    assert.equal(response.result.text,'λ © 🌍');
    assert.equal(host.poll(one.session_id).running,true);
    assert.equal(host.poll(two.session_id).running,true);
    assert.ok(host.stop(one.session_id).ok);
    assert.equal(host.poll(two.session_id).running,true,'stopping one editor must not stop another');
  }finally{host.close();}
});

test('macOS binary discovery works with a Finder-like PATH where Homebrew/rustup are omitted',{skip:process.platform!=='darwin'},()=>{
  const resolved=resolveLanguageServerBinary('rust-analyzer',{PATH:'/usr/bin:/bin:/usr/sbin:/sbin',HOME:os.homedir()});
  assert.ok(resolved && path.isAbsolute(resolved),`expected an installed binary under Homebrew or rustup, found ${resolved}`);
  assert.ok(resolved.includes('rust-analyzer'));
});
