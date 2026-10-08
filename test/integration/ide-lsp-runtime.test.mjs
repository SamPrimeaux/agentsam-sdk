import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import { mkdtempSync,mkdirSync,writeFileSync,rmSync,realpathSync } from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import { startLocalPtyServer } from '../../src/local-pty/server.js';
import {LspClient,HttpLspTransport} from '../../packages/agentsam-ide/dist/lsp/client.js';

const installed=spawnSync('rust-analyzer',['--version'],{encoding:'utf8'}).status===0;
function fakePty(){return {spawn(){throw new Error('PTY not requested in LSP test');}};}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

test('authorized workspace runtime opens an actual rust-analyzer LSP process and reads diagnostics', {skip:!installed,timeout:35000}, async()=>{
  const temp=realpathSync(mkdtempSync(path.join(tmpdir(),'agentsam-lsp-e2e-')));
  mkdirSync(path.join(temp,'src'));
  writeFileSync(path.join(temp,'Cargo.toml'),'[package]\nname="agentsam-lsp-e2e"\nversion="0.1.0"\nedition="2021"\n');
  const source='fn main() { let x = ; }\n';
  writeFileSync(path.join(temp,'src/main.rs'),source);
  const server=await startLocalPtyServer({cwd:temp,port:0,pty:fakePty()});
  const base=`http://${server.host}:${server.port}`;
  const credential=server.capability.capability;
  const transport=new HttpLspTransport(base,credential);
  const client=new LspClient(transport,'rust',new URL('file://'+temp).href,{pollMs:60,timeoutMs:18000});
  const received=[];client.onDiagnostics(event=>received.push(event));
  try{
    const forbidden=await fetch(`${base}/v1/lsp/start`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({language:'rust'})});
    assert.equal(forbidden.status,401,'unauthorized browser cannot launch language servers');
    const handshake=await client.connect();
    assert.match(handshake.serverInfo?.name||'',/rust-analyzer/);
    assert.equal(client.initialized,true);
    assert.equal(client.readiness,'starting','initialize alone must not declare LSP ready');
    const uri=new URL('file://'+temp+'/src/main.rs').href;
    await client.open(uri,'rust',source);
    for(let i=0;i<70 && !received.some(x=>x.diagnostics.length>0);i++)await wait(180);
    assert.ok(received.some(x=>x.uri===uri&&x.diagnostics.length>0),'real rust-analyzer should report invalid Rust syntax');
    assert.equal(client.readiness,'ready','actual diagnostic is server readiness evidence');
    const valid='fn meaning() -> i32 { 42 }\nfn main() { let x = meaning(); println!("{}", x); }\n';
    await client.change(uri,valid);
    for(let i=0;i<40 && !received.some(x=>x.diagnostics.length===0);i++)await wait(180);
    assert.ok(received.some(x=>x.diagnostics.length===0),'invalid Rust syntax must clear after a real LSP document change');
    const col=valid.split('\n')[1].indexOf('meaning')+2;
    const result=await client.definition(uri,1,col);
    assert.ok(result && (!Array.isArray(result)||result.length>0),'real rust-analyzer should resolve local function definition');
    const hover=await client.hover(uri,1,col);
    const refs=await client.references(uri,1,col);
    const rename=await client.rename(uri,1,col,'renamed_meaning');
    assert.ok(hover,'rust-analyzer hover should return symbol information');
    assert.ok(Array.isArray(refs)&&refs.length>0,'rust-analyzer references should return real usages');
    assert.ok(rename?.changes || rename?.documentChanges,'rust-analyzer rename should return a workspace edit');
  }finally{
    await client.close();await server.close();rmSync(temp,{recursive:true,force:true});
  }
});
