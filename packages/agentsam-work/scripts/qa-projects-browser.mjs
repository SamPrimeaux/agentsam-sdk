/** Desktop+iPhone screenshot gate with package source and realistic fixture.
 * Run: node packages/agentsam-work/scripts/qa-projects-browser.mjs
 */
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root=resolve(import.meta.dirname,'../../..');
const temp=mkdtempSync(join(tmpdir(),'agentsam-projects-qa-'));
const out=process.env.PROJECTS_QA_OUTPUT || join(temp,'screenshots');
mkdirSync(out,{recursive:true});
const buildDir=join(temp,'site');
mkdirSync(buildDir);
const chromeBin=process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
await build({entryPoints:[join(root,'packages/agentsam-work/scripts/qa-preview-entry.tsx')],outfile:join(buildDir,'bundle.js'),bundle:true,format:'iife',platform:'browser',jsx:'automatic',minify:false,define:{'process.env.NODE_ENV':'"production"'},absWorkingDir:root});
if (!readFileSync(join(buildDir,'bundle.css'),'utf8').includes('.agentsam-work-shell')) throw Error('missing Work stylesheet');
writeFileSync(join(buildDir,'index.html'),'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/><link rel="stylesheet" href="/bundle.css"/></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
const server=createServer((req,res)=>{
  const file=join(buildDir,req.url==='/bundle.js'?'bundle.js':req.url==='/bundle.css'?'bundle.css':'index.html');
  try {res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html'); res.end(readFileSync(file));}
  catch {res.writeHead(404).end();}
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const port=server.address().port;
const profile=mkdtempSync(join(tmpdir(),'agentsam-projects-chrome-'));
const chrome=spawn(chromeBin,['--headless=new','--disable-gpu','--remote-debugging-port=0','--remote-allow-origins=*','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
try {
let remotePort;
for(let i=0;i<80;i++){try{remotePort=Number(readFileSync(join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]);if(remotePort)break;}catch{} await sleep(100);}
if(!remotePort) throw Error('Chrome debugging unavailable');
const targets=await(await fetch('http://127.0.0.1:'+remotePort+'/json/list')).json();
const ws=new WebSocket(targets.find(x=>x.type==='page').webSocketDebuggerUrl);
await new Promise((ok,err)=>{ws.onopen=ok;ws.onerror=err;});
let requestId=0;const pending=new Map();
ws.onmessage=msg=>{const reply=JSON.parse(msg.data);const task=pending.get(reply.id);if(!task)return;pending.delete(reply.id);reply.error?task.reject(Error(reply.error.message)):task.resolve(reply.result);};
const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++requestId;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
await call('Page.enable');await call('Runtime.enable');
const snapshots=[];
for(const width of [390,1440]){
  for(const page of ['catalog','detail']){
    const height=width===390?844:900;
    await call('Emulation.setDeviceMetricsOverride',{width,height,mobile:width===390,deviceScaleFactor:1,screenWidth:width,screenHeight:height});
    await call('Page.navigate',{url:'http://127.0.0.1:'+port+'/'});
    await sleep(600);
    const setTheme="document.documentElement.style.cssText='--color-background:#131415;--color-card:#202125;--color-muted:#282a2f;--color-foreground:#f1f2f4;--color-muted-foreground:#b1b3bd;--color-border:#444750;--color-accent:#b2a4ea;--color-accent-foreground:#121212;';";
    await call('Runtime.evaluate',{expression:setTheme});
    await sleep(500);
    if(page==='detail') {
      await call('Runtime.evaluate',{expression:"document.querySelector('.aw-project-v3')?.click()"});
      await sleep(550);
    }
    const expression="JSON.stringify({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,projectCards:document.querySelectorAll('.aw-project-v3').length,portfolio:!!document.querySelector('.aw-portfolio-v3'),focus:!!document.querySelector('.aw-project-home__focus'),quickStats:document.querySelector('.aw-project-inspector__head')?.textContent||'',canvas:getComputedStyle(document.querySelector('.agentsam-work')).backgroundColor,shellDisplay:getComputedStyle(document.querySelector('.agentsam-work-shell')).display,cardBg:getComputedStyle(document.querySelector('.aw-project-v3')||document.querySelector('.aw-project-home')).backgroundColor,styles:document.styleSheets.length,mobileSummary:!!document.querySelector('.aw-project-mobile-summary')})";
    const result=await call('Runtime.evaluate',{expression,returnByValue:true});
    const entry={page,width,...JSON.parse(result.result.value)};
    const picture=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    writeFileSync(join(out,width+'-'+page+'.png'),Buffer.from(picture.data,'base64'));
    snapshots.push(entry);
    if(entry.scrollWidth>width+1) throw Error('horizontal overflow '+JSON.stringify(entry));
    if(entry.shellDisplay!=='grid' || entry.canvas==='rgba(0, 0, 0, 0)') throw Error('work-stylesheet-not-applied '+JSON.stringify(entry));
    if(page==='catalog' && (!entry.projectCards || entry.portfolio)) throw Error('catalog failed '+JSON.stringify(entry));
    if(page==='detail' && (!entry.focus || !entry.quickStats.includes('Quick stats'))) throw Error('detail failed '+JSON.stringify(entry));
  }
}
console.log('PROJECTS_VISUAL_QA_PASS '+JSON.stringify(snapshots));
ws.close();
}finally{chrome.kill('SIGTERM');server.close();await sleep(350);rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:150});if(!process.env.PROJECTS_QA_OUTPUT)rmSync(temp,{recursive:true,force:true,maxRetries:5,retryDelay:150});}
