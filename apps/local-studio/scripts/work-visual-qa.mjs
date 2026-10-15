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
    {name:'iphone-ticket-selected',route:'/projects/agentsam-sdk',width:390,height:844,clickTicket:true},
    {name:'desktop-ticket-selected',route:'/projects/agentsam-sdk',width:1440,height:900,clickTicket:true},
    {name:'iphone-project-chats',route:'/projects/agentsam-sdk',width:390,height:844,clickChat:true},
    {name:'desktop-project-chats',route:'/projects/agentsam-sdk',width:1440,height:900,clickChat:true},
    {name:'iphone-project-chat-assignment',route:'/projects/agentsam-sdk',width:390,height:844,clickChat:true,assignChat:true},
    {name:'desktop-project-chat-assignment',route:'/projects/agentsam-sdk',width:1440,height:900,clickChat:true,assignChat:true},
    {name:'iphone-chats-index',route:'/chats',width:390,height:844},
    {name:'desktop-chats-index',route:'/chats',width:1440,height:900},
    {name:'iphone-chats-conversation',route:'/chats/trail-studio',width:390,height:844},
    {name:'desktop-chats-conversation',route:'/chats/trail-studio',width:1440,height:900},
  ]) {
    await call('Emulation.setDeviceMetricsOverride',{width:screen.width,height:screen.height,deviceScaleFactor:1,mobile:screen.width<600,screenWidth:screen.width,screenHeight:screen.height});
    await call('Page.navigate',{url:'http://127.0.0.1:'+port+'/?fixture=populated#'+screen.route});
    await delay(1700);
    if (screen.clickTimeline) {
      await call('Runtime.evaluate', { expression: "Array.from(document.querySelectorAll('.aw-tabs button')).find(button=>button.textContent?.includes('Timeline'))?.click()" });
      await delay(250);
    }
    if (screen.clickTicket) {
      // React keeps the previously selected tab when navigating between fixture
      // screens. Return to Overview before selecting the actual first ticket.
      await call('Runtime.evaluate', { expression: "Array.from(document.querySelectorAll('.aw-tabs button')).find(button=>button.textContent?.includes('Overview'))?.click()" });
      await delay(100);
      await call('Runtime.evaluate', { expression: "document.querySelector('.aw-project-plan__step')?.click()" });
      await delay(350);
    }
    if (screen.clickChat) {
      // The fixture SPA retains an in-page ticket selection between captures.
      // Test the independent chat surface after exiting ticket inspection.
      await call('Runtime.evaluate', { expression: "document.querySelector('.aw-ticket-context__back')?.click()" });
      await delay(100);
      await call('Runtime.evaluate', { expression: "Array.from(document.querySelectorAll('.aw-tabs button')).find(button=>button.textContent?.includes('Chats'))?.click()" });
      await delay(200);
    }
    if (screen.assignChat) {
      await call('Runtime.evaluate', { expression: "(()=>{let el=document.querySelector('#aw-assign-project-chat'); if(el&&el.options.length>1){el.value=el.options[1].value;el.dispatchEvent(new Event('change',{bubbles:true}));return el.value}return ''})()" });
      await delay(150);
      await call('Runtime.evaluate', { expression: "Array.from(document.querySelectorAll('.aw-project-chats__assign button')).find(b=>b.textContent?.includes('Assign')||b.textContent?.includes('Move here'))?.click()" });
      await delay(350);
    }
    const expression="JSON.stringify({href:location.href,width:innerWidth,bodyWidth:document.documentElement.scrollWidth,shellWidth:document.querySelector('.agentsam-work-shell')?.getBoundingClientRect().width,ticketRows:document.querySelectorAll('.aw-row').length,detailSummary:!!document.querySelector('.aw-project-detail__inspector'),chatsTab:!!document.querySelector('.aw-project-chats'),chatsIndex:!!document.querySelector('[data-studio-chats]'),chatConversation:!!document.querySelector('.agentsam-page-layout'),linkedChatsInIndex:document.querySelectorAll('[data-linked-to-work=yes]').length,assignedChats:document.querySelectorAll('.aw-project-chats__item').length,chatAssignControl:!!document.querySelector('#aw-assign-project-chat'),ticketContext:!!document.querySelector('.aw-ticket-context'),ticketOverlayCount:document.querySelectorAll('.aw-drawer-overlay').length,nestedTabs:document.querySelectorAll('.aw-tabs').length,focusRows:document.querySelectorAll('.aw-focus-item').length,projectCards:document.querySelectorAll('.aw-project-v3, .aw-project-cards-v3 .aw-project').length,portfolio:!!document.querySelector('.aw-portfolio-v3'),timeline:!!document.querySelector('.aw-tl'),dock:document.querySelectorAll('.agentsam-work-bottom-nav button').length})";
    const r=await call('Runtime.evaluate',{expression,returnByValue:true});
    const data=JSON.parse(r.result.value);
    const screenshot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    writeFileSync(join(output,screen.name+'.png'),Buffer.from(screenshot.data,'base64'));
    results.push({name:screen.name,...data,overflow:data.bodyWidth>screen.width});
  }
  writeFileSync(join(output,'results.json'),JSON.stringify(results,null,2));
  console.log(JSON.stringify(results,null,2));
  const failures = results.filter(r => r.overflow || (r.name.endsWith('projects') && !(r.projectCards || r.portfolio || r.timeline)) || (r.name.includes('project-timeline') && (!r.timeline || r.nestedTabs !== 1)) || (r.name.includes('project-detail') && !r.detailSummary) || (r.name.includes('ticket-selected') && (!r.ticketContext || r.ticketOverlayCount > 0)) || (r.name.includes('project-chats') && !r.chatsTab) || (r.name.includes('chat-assignment') && (!r.chatAssignControl || r.assignedChats < 1)) || (r.name.includes('chats-index') && (!r.chatsIndex || r.linkedChatsInIndex < 1)) || (r.name.includes('chats-conversation') && !r.chatConversation) || (r.name.includes('tickets') && r.focusRows === 0));
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
