#!/usr/bin/env node
/**
 * Full IDE consumer proof: install the packed SDK into an unrelated project,
 * boot an authorized local workspace, open a real rust-analyzer process, and
 * verify diagnostics, versioned disk saving, and F12 in an actual browser.
 * Local opt-in: requires installed rust-analyzer and Chrome/Playwright.
 */
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {copyFileSync,existsSync,mkdirSync,mkdtempSync,readFileSync,realpathSync,rmSync,symlinkSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {startLocalPtyServer} from '../src/local-pty/server.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const studioRequire=createRequire(path.join(root,'apps/local-studio/package.json'));
const {createServer}=await import(pathToFileURL(studioRequire.resolve('vite')).href);
const {default:react}=await import(pathToFileURL(studioRequire.resolve('@vitejs/plugin-react')).href);
const playwright=await import(pathToFileURL(studioRequire.resolve('playwright')).href);
const chromium=playwright.chromium||playwright.default?.chromium;
if(!chromium)throw new Error('Playwright chromium unavailable');
const chrome=process.env.AGENTSAM_IDE_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if(spawnSync('rust-analyzer',['--version'],{stdio:'ignore'}).status!==0)throw new Error('rust-analyzer is not installed; cannot prove real Rust LSP');
if(!existsSync(chrome))throw new Error('Chrome not installed at '+chrome+'; set AGENTSAM_IDE_CHROME');
const temp=mkdtempSync(path.join(tmpdir(),'agentsam-ide-browser-proof-'));
const consumer=path.join(temp,'unrelated-customer-app');
const workspace=realpathSync(mkdtempSync(path.join(tmpdir(),'agentsam-ide-rust-workspace-')));
let vite,host,browser;
function link(name,source){const target=path.join(consumer,'node_modules',name);mkdirSync(path.dirname(target),{recursive:true});symlinkSync(source,target,'dir');}
try{
  mkdirSync(consumer);
  writeFileSync(path.join(consumer,'package.json'),JSON.stringify({name:'independent-monaco-consumer',private:true,type:'module'},null,2));
  const packed=execFileSync('npm',['pack',path.join(root,'packages/agentsam-ide'),'--pack-destination',temp,'--silent'],{cwd:root,encoding:'utf8'}).trim().split('\n').at(-1);
  execFileSync('npm',['install','--offline','--ignore-scripts','--no-audit','--no-fund','--legacy-peer-deps',path.join(temp,packed)],{cwd:consumer,stdio:'pipe'});
  for(const dep of ['react','react-dom','monaco-editor','@monaco-editor/react','@monaco-editor/loader'])link(dep,path.join(root,'node_modules',dep));
  for(const dep of ['vite','playwright','@vitejs/plugin-react'])link(dep,path.join(root,'apps/local-studio/node_modules',dep));
  const sample=path.join(root,'test/fixtures/ide-lsp-browser');
  for(const [source,target] of [['index.html','index.html'],['main.tsx','main.tsx'],['test.css','test.css']])copyFileSync(path.join(sample,source),path.join(consumer,target));
  mkdirSync(path.join(workspace,'src'));
  writeFileSync(path.join(workspace,'Cargo.toml'),'[package]\nname="agentsam-ide-browser"\nversion="0.1.0"\nedition="2021"\n');
  writeFileSync(path.join(workspace,'src/main.rs'),'fn main() { let x = ; }\n');

  vite=await createServer({root:consumer,configFile:false,plugins:[react()],optimizeDeps:{force:true},server:{host:'127.0.0.1',port:0}});
  await vite.listen();
  const origin=`http://127.0.0.1:${vite.httpServer.address().port}`;
  const originalOrigins=process.env.AGENTSAM_LOCAL_STUDIO_ORIGINS;
  process.env.AGENTSAM_LOCAL_STUDIO_ORIGINS=[originalOrigins,origin].filter(Boolean).join(',');
  host=await startLocalPtyServer({cwd:workspace,port:0,pty:{spawn(){throw new Error('PTY not requested in LSP test');}}});
  browser=await chromium.launch({headless:true,executablePath:chrome,args:['--no-sandbox']});
  const page=await browser.newPage();const failures=[];
  page.on('pageerror',e=>failures.push(e.message));
  const conf={baseUrl:`http://127.0.0.1:${host.port}`,capability:host.capability.capability,rootUri:pathToFileURL(workspace).href};
  await page.addInitScript(x=>{window.IDE_TEST=x;},conf);
  await page.goto(origin,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.editorReady&&window.status==='ready',null,{timeout:30000});
  assert.match(await page.evaluate(()=>window.statusDetail),/rust-analyzer/);
  await page.waitForFunction(()=>window.monaco.editor.getModelMarkers({owner:'agentsam-lsp'}).length>0,null,{timeout:20000});
  const fixed='fn meaning() -> i32 {42}\nfn main() { let x = meaning(); println!("{}",x); }\n';
  await page.evaluate(text=>window.editor.setValue(text),fixed);
  await page.evaluate(()=>window.editor.getAction('agentsam.ide.save').run());
  await page.waitForFunction(()=>window.saveConfirmed===true,null,{timeout:12000});
  await page.waitForFunction(()=>window.monaco.editor.getModelMarkers({owner:'agentsam-lsp'}).length===0,null,{timeout:20000});
  await page.evaluate(()=>{const x=window.editor.getModel().getLineContent(2).indexOf('meaning');window.editor.setPosition({lineNumber:2,column:x+2});window.editor.focus();});
  await page.keyboard.press('F12');
  await page.waitForFunction(()=>window.editor.getPosition()?.lineNumber===1,null,{timeout:16000});
  assert.deepEqual(failures,[]);
  assert.equal(readFileSync(path.join(workspace,'src/main.rs'),'utf8'),fixed,'the edited file was really persisted to disk');
  console.log(JSON.stringify({ok:true,consumer:'packed-sdk-in-unrelated-react-app',host:'authorized-node-workspace',server:'real rust-analyzer',monaco:true,diagnostics:true,save_to_disk:true,diagnostics_clear:true,f12_definition:true,browser_errors:0}));
}finally{
  await browser?.close().catch(()=>{});
  await host?.close().catch(()=>{});
  await vite?.close().catch(()=>{});
  rmSync(temp,{recursive:true,force:true});
  rmSync(workspace,{recursive:true,force:true});
}
