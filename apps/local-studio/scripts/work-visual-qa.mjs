/**
 * Visual QA of the actual packaged desktop SPA (not the isolated component).
 * Requires local Chrome with remote-debugging; uses only fixture data.
 * Example: node scripts/work-visual-qa.mjs
 */
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, resolve, extname } from 'node:path';
import { spawn } from 'node:child_process';

const dist = resolve(import.meta.dirname, '../desktop-dist');
const index = join(dist, 'index.html');
if (!existsSync(index)) throw Error('Run npm run build:desktop first');
const chromePath = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!existsSync(chromePath)) throw Error('No Chromium binary, set CHROME_BIN');
const output = process.env.WORK_QA_OUTPUT || join(homedir(), 'Downloads', 'agentsam-work-visual-review');
mkdirSync(output, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = resolve(dist, pathname.slice(1) || 'index.html');
  if (!file.startsWith(dist)) return res.writeHead(403).end();
  try {
    res.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream');
    res.end(readFileSync(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
const port = server.address().port;
const profile = mkdtempSync(join(tmpdir(), 'agentsam-visual-'));
const chrome = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--no-default-browser-check', '--remote-debugging-port=0', '--remote-allow-origins=*',
  '--user-data-dir=' + profile, 'about:blank',
], { stdio: 'ignore' });
const delay = (time) => new Promise(ok => setTimeout(ok, time));

async function connect() {
  let debugPort;
  for (let i=0;i<60;i++) {
    try {
      debugPort = Number(readFileSync(join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]);
      if (debugPort) break;
    } catch {}
    await delay(100);
  }
  if (!debugPort) throw Error('Chromium did not open a CDP port');
  const targets = await (await fetch('http://127.0.0.1:'+debugPort+'/json/list')).json();
  const target = targets.find(target => target.type === 'page');
  if (!target) throw Error('No Chrome page target');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = event => {
    const packet = JSON.parse(event.data);
    if (!packet.id || !pending.has(packet.id)) return;
    const reply = pending.get(packet.id);
    pending.delete(packet.id);
    if (packet.error) reply.reject(Error(packet.error.message));
    else reply.resolve(packet.result);
  };
  const call = (method, params={}) => new Promise((resolve, reject) => {
    const current = ++id;
    pending.set(current, {resolve, reject});
    ws.send(JSON.stringify({id:current, method, params}));
  });
  return { ws, call };
}

try {
  const {ws,call}=await connect();
  await call('Page.enable');
  await call('Runtime.enable');
  const results=[];
  for(const screen of [
    {name:'iphone-projects',route:'/projects',width:390,height:844},
    {name:'iphone-tickets',route:'/tickets',width:390,height:844},
    {name:'desktop-projects',route:'/projects',width:1440,height:900},
    {name:'desktop-tickets',route:'/tickets',width:1440,height:900},
    {name:'iphone-project-detail',route:'/projects/agentsam-sdk',width:390,height:844},
    {name:'desktop-project-detail',route:'/projects/agentsam-sdk',width:1440,height:900},
    {name:'iphone-project-timeline',route:'/projects/agentsam-sdk',width:390,height:844,clickTimeline:true},
    {name:'desktop-project-timeline',route:'/projects/agentsam-sdk',width:1440,height:900,clickTimeline:true},
  ]) {
    await call('Emulation.setDeviceMetricsOverride',{width:screen.width,height:screen.height,deviceScaleFactor:1,mobile:screen.width<600,screenWidth:screen.width,screenHeight:screen.height});
    await call('Page.navigate',{url:'http://127.0.0.1:'+port+'/?fixture=populated#'+screen.route});
    await delay(1700);
    if (screen.clickTimeline) {
      await call('Runtime.evaluate', { expression: "Array.from(document.querySelectorAll('.aw-tabs button')).find(button=>button.textContent?.includes('Timeline'))?.click()" });
      await delay(250);
    }
    const expression="JSON.stringify({href:location.href,width:innerWidth,bodyWidth:document.documentElement.scrollWidth,shellWidth:document.querySelector('.agentsam-work-shell')?.getBoundingClientRect().width,ticketRows:document.querySelectorAll('.aw-row').length,detailSummary:!!document.querySelector('.aw-project-summary'),nestedTabs:document.querySelectorAll('.aw-tabs').length,focusRows:document.querySelectorAll('.aw-focus-item').length,projectCards:document.querySelectorAll('.aw-project').length,timeline:!!document.querySelector('.aw-tl'),dock:document.querySelectorAll('.agentsam-work-bottom-nav button').length})";
    const r=await call('Runtime.evaluate',{expression,returnByValue:true});
    const data=JSON.parse(r.result.value);
    const screenshot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    writeFileSync(join(output,screen.name+'.png'),Buffer.from(screenshot.data,'base64'));
    results.push({name:screen.name,...data,overflow:data.bodyWidth>screen.width});
  }
  writeFileSync(join(output,'results.json'),JSON.stringify(results,null,2));
  console.log(JSON.stringify(results,null,2));
  const failures = results.filter(r => r.overflow || (r.name.endsWith('projects') && !(r.projectCards || r.timeline)) || (r.name.includes('project-timeline') && (!r.timeline || r.nestedTabs !== 1)) || (r.name.includes('project-detail') && !r.detailSummary) || (r.name.includes('tickets') && r.focusRows === 0));
  if (failures.length) {
    process.exitCode=1;
    console.error('Work visual QA failed:', failures.map(r=>r.name).join(', '));
  }
  ws.close();
} finally {
  chrome.kill('SIGTERM');
  server.close();
  await delay(400);
  try{rmSync(profile,{recursive:true,force:true,maxRetries:4,retryDelay:200})}catch{}
}
