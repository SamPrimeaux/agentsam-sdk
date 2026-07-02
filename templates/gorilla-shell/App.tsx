import { useState, useEffect, useRef, useMemo, useCallback } from "react";

const PS = 5;
const PAL = ['transparent','#060e1a','#0f2040','#1a3568','#6a6a90','#9898b8','#2a1006','#8a5830','#ff1a1a','#ffd88a','#0e0400','#ffffff','#ffd700','#ffaa00','#ff6600','#ff2200','#9B6E14','#6B4808','#3a2604','#c09030','#ffee44','#cc8800','#44ff88','#ff4444'];

const GORILLA = [
[0,0,0,2,2,2,2,2,2,2,2,2,2,2,0,0,0,0],
[0,0,2,3,3,3,3,3,3,3,3,3,3,2,2,0,0,0],
[0,2,2,3,3,3,3,3,3,3,3,3,3,3,2,2,0,0],
[0,2,3,3,7,7,3,3,3,7,7,3,3,3,2,0,0,0],
[2,2,3,7,7,8,7,3,3,7,8,7,7,3,3,2,2,0],
[2,2,3,7,7,7,7,7,7,7,7,7,7,3,3,2,2,0],
[2,3,3,7,6,10,6,7,7,6,10,6,7,3,3,3,2,0],
[2,3,3,7,7,7,9,9,9,9,7,7,7,3,3,3,2,0],
[0,2,3,3,3,3,3,3,3,3,3,3,3,3,3,2,0,0],
[0,2,2,3,4,4,4,4,4,4,4,4,4,3,2,2,0,0],
[2,2,2,3,4,5,5,5,5,5,5,5,4,3,3,2,2,2],
[2,3,2,3,4,5,5,5,5,5,5,5,4,3,2,3,2,2],
[2,3,3,3,3,4,4,5,5,4,4,3,3,3,3,3,2,0],
[0,2,3,3,3,3,3,3,3,3,3,3,3,3,2,2,0,0],
[0,0,2,3,3,3,3,3,3,3,3,3,3,2,2,0,0,0],
[0,0,2,2,3,3,3,3,3,3,3,3,2,2,0,0,0,0],
[0,0,0,2,2,3,3,0,0,3,3,2,2,0,0,0,0,0],
[0,0,0,2,2,2,2,0,0,2,2,2,2,0,0,0,0,0],
[0,0,0,0,2,2,2,0,0,2,2,2,0,0,0,0,0,0],
[0,0,0,0,2,3,2,0,0,2,3,2,0,0,0,0,0,0],
];
const GORILLA_PUMP = GORILLA.map((r,i) => {
if (i===8)  return [2,2,3,3,3,3,3,3,3,3,3,3,3,3,3,2,2,0];
if (i===9)  return [2,2,3,4,5,5,5,5,5,5,5,5,5,4,3,2,2,0];
if (i===10) return [0,2,3,4,5,5,5,5,5,5,5,5,5,4,3,2,0,0];
if (i===11) return [0,2,3,3,4,5,5,5,5,5,5,5,4,3,3,2,0,0];
return r;
});

const COIN = [[0,12,12,12,12,12,0],[12,20,20,20,20,20,12],[12,20,12,20,12,20,12],[12,20,20,20,20,20,12],[0,12,12,12,12,12,0],[0,0,21,21,0,0,0]];
const FLAME_FRAMES = [
[[0,0,14,0,0],[0,14,15,14,0],[14,15,13,14,0],[14,13,20,14,0],[0,14,13,14,0],[0,13,14,13,0]],
[[0,14,0,14,0],[14,15,14,0,0],[14,13,15,14,0],[0,14,13,14,0],[0,13,14,0,0],[0,14,13,0,0]],
[[0,14,14,0,0],[0,14,15,14,0],[14,15,13,15,0],[14,13,14,13,0],[0,14,13,14,0],[0,0,14,13,0]],
];

const THEMES = {
NIGHT: { bg:'#030a14', panel:'rgba(4,12,26,.97)', accent:'#00e5ff', dim:'#00e5ff22', glow:'0 0 14px #00e5ff55', border:'#00e5ff33' },
DAY:   { bg:'#071a0a', panel:'rgba(6,20,10,.97)', accent:'#44ff88', dim:'#44ff8822', glow:'0 0 14px #44ff8855', border:'#44ff8833' },
LAVA:  { bg:'#0e0003', panel:'rgba(18,2,4,.97)',  accent:'#ff4400', dim:'#ff440022', glow:'0 0 14px #ff440055', border:'#ff440033' },
VOID:  { bg:'#06001a', panel:'rgba(8,2,28,.97)',  accent:'#aa44ff', dim:'#aa44ff22', glow:'0 0 14px #aa44ff55', border:'#aa44ff33' },
};
const TKEYS = Object.keys(THEMES);

// ── Line colors ───────────────────────────────────────────────────────────────
const LC = {
cmd:     '#00e5ff',
success: '#44ff88',
error:   '#ff4444',
warn:    '#ffcc00',
info:    '#88bbff',
muted:   'rgba(255,255,255,.45)',
dim:     'rgba(255,255,255,.18)',
white:   'rgba(255,255,255,.9)',
sam:     '#cc88ff',
table:   '#ffdd88',
pass:    '#44ff88',
fail:    '#ff4444',
accent:  '#00e5ff',
};

// ── Scenario Builders ─────────────────────────────────────────────────────────
const BENCH_TESTS = [
['health_check',13],['auth_superadmin',8],['auth_regular',9],['d1_query_basic',45],
['d1_query_join',67],['d1_write_record',38],['mcp_tool_routing',23],['mcp_auth_bearer',11],
['mcp_audit_log',19],['agent_context_load',88],['r2_upload_asset',54],['r2_fetch_asset',31],
['kv_read_hit',7],['kv_write_ttl',14],['queue_publish',28],['worker_ai_t0',112],
['gemini_flash_lite',189],['haiku_route',145],['sonnet_route',234],['budget_check',6],
['cicd_sandbox_gate',17],['cicd_benchmark_gate',22],['deploy_record_insert',33],
['workspace_switch',12],['terminal_session_resume',19],['rag_cosine_query',78],
['tool_intent_match',15],['client_workflow_run',44],['project_context_load',29],
['skill_lookup',11],['cicd_pipeline_e2e',156],
];

function buildDeploy() {
let d = 0; const L = (text, color, gap=120) => { d+=gap; return {text,color,delay:d}; };
return [
L('gorilla@inneranimal ~ % /deploy sandbox','cmd',0),
L('','dim',60),
L('  ./scripts/with-cloudflare-env.sh npx wrangler deploy','muted',80),
L('  –config wrangler.sandbox.toml','muted',40),
L('','dim',80),
L('  Bundling worker…','muted',300),
L('  esbuild: scanning 847 modules…','muted',500),
L('  Tree-shaking complete: 284kb','muted',400),
L('  Build time: 1.24s','muted',200),
L('','dim',80),
L('  Uploading script…','muted',350),
L('','dim',60),
L('  Worker         inneranimal-dashboard','info',200),
L('  Compat date    2026-04-08','info',60),
L('  D1 binding     inneranimalmedia-business [cf87b717]','info',60),
L('  R2 binding     agent-sam-sandbox-cicd','info',60),
L('  KV binding     IAM_KV, RATE_LIMIT_KV','info',60),
L('  Queues         DEPLOY_QUEUE, AGENT_QUEUE','info',60),
L('','dim',80),
L('  Routing table:','muted',200),
L('    dashboard.inneranimalmedia.com  /* -> inneranimal-dashboard','dim',60),
L('','dim',80),
L('  [OK] Deployed successfully  3.41s','success',400),
L('  >> https://inneranimal-dashboard.samprimeaux.workers.dev','accent',80),
L('','dim',100),
L('  Next: run /benchmark to proceed to prod','warn',200),
];
}

function buildBenchmark() {
let d = 0; const L = (text, color, gap=80) => { d+=gap; return {text,color,delay:d}; };
const lines = [
L('gorilla@inneranimal ~ % /benchmark','cmd',0),
L('','dim',60),
L('  Running 31 tests against inneranimal-dashboard…','muted',200),
L('','dim',60),
];
BENCH_TESTS.forEach(([name, ms], i) => {
const num = String(i+1).padStart(2,'0');
const dots = '.'.repeat(Math.max(2, 36 - name.length));
lines.push(L(`  [${num}/31] ${name} ${dots} PASS   ${ms}ms`,'pass',75));
});
lines.push(L('','dim',100));
lines.push(L('  '+'-'.repeat(52),'dim',100));
lines.push(L('  RESULTS   31 / 31 PASSED   avg 47ms   total 1.46s','success',200));
lines.push(L('  '+'-'.repeat(52),'dim',60));
lines.push(L('','dim',80));
lines.push(L('  [GATE PASSED] Cleared for production promote','success',300));
return lines;
}

function buildD1() {
let d = 0; const L = (text, color, gap=100) => { d+=gap; return {text,color,delay:d}; };
const SEP = '  +—————————+———+———————+';
const rows = [
['inneranimalmedia','success','2026-04-07 23:10:56'],
['inneranimal-dashboard','success','2026-04-07 22:55:15'],
['inneranimal-dashboard','success','2026-04-07 22:06:28'],
['inneranimalmedia','success','2026-04-06 18:32:11'],
['inneranimal-dashboard','error','2026-04-06 17:44:03'],
];
return [
L('gorilla@inneranimal ~ % /d1 SELECT name, status, created_at FROM deployments ORDER BY created_at DESC LIMIT 5','cmd',0),
L('','dim',60),
L('  DB: inneranimalmedia-business','muted',150),
L('  ID: cf87b717-d4e2-4cf8-bab0-a81268e32d49','dim',60),
L('','dim',100),
L(SEP,'table',200),
L('  | name                      | status  | created_at          |','table',60),
L(SEP,'table',60),
...rows.map(([n,s,t]) => L(
`  | ${n.padEnd(25)} | ${s.padEnd(7)} | ${t} |`,
s==='error'?'error':'white', 90
)),
L(SEP,'table',90),
L('  5 rows  |  2ms','dim',100),
];
}

function buildTail() {
let d = 0; const L = (text, color, gap=280) => { d+=gap; return {text,color,delay:d}; };
const reqs = [
['GET ','/ ','200','14ms',''],
['POST','/api/agent/chat ','200','234ms',''],
['GET ','/api/workspace/status ','200','8ms',''],
['POST','/mcp ','200','45ms','[MCP]'],
['GET ','/api/deployments ','200','12ms',''],
['POST','/api/agent/chat ','200','891ms','[LLM]'],
['GET ','/health ','200','2ms',''],
['POST','/api/d1/query ','200','34ms',''],
['GET ','/api/workspace/list ','200','18ms',''],
['POST','/api/agent/chat ','500','12ms','[ERR]'],
];
const delays = [0,320,180,260,400,350,220,310,280,450];
return [
L('gorilla@inneranimal ~ % /tail inneranimalmedia','cmd',0),
L('','dim',60),
L('  npx wrangler tail inneranimalmedia –format pretty','muted',100),
L('  Streaming live logs… (CTRL+C to stop)','dim',300),
L('','dim',100),
...reqs.map(([m,p,s,t,tag],i) => L(
`  [10:23:${41+i}] ${m} ${p.padEnd(30)}${s}  ${t.padEnd(8)}${tag}`,
s==='500'?'error': tag==='[LLM]'?'warn': tag==='[MCP]'?'info': 'muted',
delays[i] || 300
)),
L('','dim',200),
L('  1 error detected – POST /api/agent/chat returned 500','error',200),
L('  Tip: run /samiam to diagnose','warn',200),
];
}

function buildSamIAm() {
let d = 0; const L = (text, color, gap=80) => { d+=gap; return {text,color,delay:d}; };
return [
L('gorilla@inneranimal ~ % /samiam how is our terminal setup','cmd',0),
L('','dim',60),
L('  >> AGENT SAM ACTIVATED','sam',200),
L('  >> Workspace: ws_inneranimalmedia','sam',100),
L('  >> PTY context: injecting last 30 lines','sam',100),
L('  >> Routing: claude-sonnet-4-6 (T2)','sam',100),
L('','dim',200),
L('  [SAM] Terminal PTY is running clean. Your xterm.js','sam',400),
L('        bridge is connected to iam-pty via WebSocket.','sam',150),
L('        gorilla-mode shell is rendering on top of it.','sam',150),
L('','dim',80),
L('  [SAM] One issue flagging: 50 open errors in status','sam',300),
L('        bar – traced to mcp_services table having 30','sam',150),
L('        rows all pointing to same endpoint, NULL last_used.','sam',150),
L('        Table is never read by Worker – safe to truncate.','sam',150),
L('','dim',80),
L('  [SAM] Also: terminal_sessions user_id backfill is','sam',300),
L('        still needed in register INSERT (hardcoded sam).','sam',150),
L('','dim',80),
L('  [1] Show me the mcp_services cleanup query','white',300),
L('  [2] Run /d1 truncate mcp_services directly','white',80),
L('  [3] Open the terminal_sessions bug in Cursor','white',80),
L('  [esc] Skip for now','dim',80),
];
}

function buildWrangler() {
let d = 0; const L = (text, color, gap=100) => { d+=gap; return {text,color,delay:d}; };
return [
L('gorilla@inneranimal ~ % /wrangler tail inneranimalmedia','cmd',0),
L('','dim',60),
L('  [GATE] About to run:','warn',150),
L('  ./scripts/with-cloudflare-env.sh npx wrangler tail inneranimalmedia','white',80),
L('','dim',80),
L('  PROCEED?  [1] YES   [esc] NO','warn',200),
L('','dim',100),
L('  >> 1','cmd',600),
L('','dim',60),
L('  Connecting to worker: inneranimalmedia','muted',200),
L('  Account: Inner Animal Media (6f2a…)','muted',80),
L('  Zone: inneranimalmedia.com','muted',80),
L('','dim',100),
L('  [STREAM] Listening for events…','success',300),
L('','dim',80),
L('  10:31:04  GET  /                        200  11ms','dim',400),
L('  10:31:06  POST /api/agent/chat          200  445ms','dim',350),
L('  10:31:07  GET  /api/status              200  6ms','dim',250),
L('  10:31:09  POST /mcp                     200  88ms  [MCP]','info',380),
L('  10:31:11  POST /api/agent/chat          200  1201ms [LLM]','warn',620),
L('','dim',200),
L('  LLM call latency spike: 1201ms – check Sonnet routing','warn',200),
];
}

const SCENARIOS = [
{ key:'deploy',    label:'/deploy',    fn:buildDeploy,    status:'DEPLOYING',  coins:6,  pump:true,  errAt:null },
{ key:'benchmark', label:'/benchmark', fn:buildBenchmark, status:'BENCHMARKING',coins:12, pump:true,  errAt:null },
{ key:'d1',        label:'/d1 query',  fn:buildD1,        status:'QUERYING D1',coins:3,  pump:false, errAt:null },
{ key:'tail',      label:'/tail',      fn:buildTail,      status:'TAILING',    coins:0,  pump:false, errAt:9 },
{ key:'samiam',    label:'/samiam',    fn:buildSamIAm,    status:'SAM ACTIVE', coins:4,  pump:true,  errAt:null },
{ key:'wrangler',  label:'/wrangler',  fn:buildWrangler,  status:'CF GATE',    coins:2,  pump:false, errAt:null },
];

// ── Sprite Renderer ───────────────────────────────────────────────────────────
function Sprite({ data, scale=1 }) {
const ps = PS * scale;
return (
<svg width={data[0].length*ps} height={data.length*ps} style={{imageRendering:'pixelated',display:'block'}}>
{data.flatMap((row,y) => row.map((c,x) =>
c ? <rect key={`${x},${y}`} x={x*ps} y={y*ps} width={ps} height={ps} fill={PAL[c]}/> : null
))}
</svg>
);
}

// ── Bar ───────────────────────────────────────────────────────────────────────
function Bar({ pct, color, label, val }) {
return (
<div style={{marginBottom:10}}>
<div style={{display:'flex',justifyContent:'space-between',fontSize:9,letterSpacing:2,color:'rgba(255,255,255,.4)',marginBottom:3}}>
<span>{label}</span><span style={{color}}>{val}</span>
</div>
<div style={{height:6,background:'rgba(255,255,255,.07)',position:'relative'}}>
<div style={{position:'absolute',top:0,left:0,height:'100%',width:`${pct}%`,background:color,transition:'width .4s ease',boxShadow:`0 0 6px ${color}`}}/>
</div>
</div>
);
}

// ── Main ──────────────────────────────────────────────────────────────────────
const PROJECT = import.meta.env.VITE_PROJECT_NAME || '{{PROJECT_NAME}}';
const LANE = import.meta.env.VITE_LANE_KEY || '{{LANE_KEY}}';
const AGENT = import.meta.env.VITE_AGENT || '{{AGENT}}';

export default function GorillaMode() {
const [themeIdx, setThemeIdx] = useState(0);
const [lines, setLines]       = useState([{text:`gorilla@${PROJECT} ~ % Gorilla Mode ready — type /help or pick a demo.`, color:'dim', delay:0}]);
const [running, setRunning]   = useState(false);
const [status, setStatus]     = useState('READY');
const [progress, setProgress] = useState(0);
const [pump, setPump]         = useState(false);
const [errorFlash, setError]  = useState(false);
const [coinCount, setCoinCount] = useState(0);
const [floatCoins, setFloat]  = useState([]);
const [flameTick, setFlameTick] = useState(0);
const [booted, setBooted]     = useState(false);
const [bootLine, setBootLine] = useState('');
const [activeScenario, setActive] = useState(null);
const [inputLine, setInputLine] = useState('');
const [apiOnline, setApiOnline] = useState(false);
const termRef = useRef(null);
const timerRefs = useRef([]);
const inputRef = useRef(null);

const appendLine = useCallback((text, color = 'white') => {
  setLines((prev) => [...prev, { text, color, delay: 0 }]);
}, []);

const runLiveSam = useCallback(async (message) => {
  const msg = String(message || '').trim();
  if (!msg) return;
  setRunning(true);
  setStatus('SAM ACTIVE');
  setPump(true);
  appendLine('  >> AGENT SAM (local Worker API)', 'sam');
  try {
    const res = await fetch('/api/agentsam/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg, lane: LANE, agent: AGENT }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      appendLine(`  [ERR] ${data.error || res.status}`, 'error');
    } else {
      appendLine(`  [intent] ${data.intent} · agent ${data.agent} · lane ${data.lane}`, 'sam');
      (data.next_steps || []).forEach((step) => appendLine(`  → ${step}`, 'white'));
      if (data.requires_approval) appendLine('  ⚠ requires approval before destructive action', 'warn');
    }
  } catch (e) {
    appendLine(`  [ERR] ${e?.message || 'API unreachable — is npm run dev:worker running?'}`, 'error');
  } finally {
    setRunning(false);
    setPump(false);
    setStatus(apiOnline ? 'READY' : 'API OFFLINE');
  }
}, [appendLine, apiOnline]);

const T = THEMES[TKEYS[themeIdx]];

// Boot
useEffect(() => {
const BOOT = [`GORILLA MODE v1.5`,`>> PROJECT: ${PROJECT}`,`>> LANE: ${LANE}`,`>> AGENT: ${AGENT}`,`>> PROBING LOCAL API…`];
let i = 0;
const t = setInterval(() => { if(i<BOOT.length){setBootLine(BOOT[i]);i++;}else{clearInterval(t);setTimeout(async ()=>{
  try {
    const res = await fetch('/api/health');
    setApiOnline(res.ok);
    if (res.ok) setBootLine('>> AGENT SAM: ONLINE (local)');
    else setBootLine('>> AGENT SAM: waiting for worker…');
  } catch {
    setApiOnline(false);
    setBootLine('>> AGENT SAM: start npm run dev');
  }
  setTimeout(()=>setBooted(true),400);
},200);}}, 340);
return () => clearInterval(t);
}, []);

// Flame tick
useEffect(() => {
const t = setInterval(() => setFlameTick(n => (n+1)%3), 190);
return () => clearInterval(t);
}, []);

// Auto-scroll terminal
useEffect(() => {
if (termRef.current) termRef.current.scrollTop = termRef.current.scrollHeight;
}, [lines]);

const stars = useMemo(() =>
Array.from({length:40},(_,i) => ({id:i,x:Math.random()*100,y:Math.random()*45,s:Math.random()<.2?2:1,d:Math.random()*4}))
,[]);

const spawnCoins = useCallback((n) => {
if (!n) return;
const batch = Array.from({length:n},(_,i) => ({id:Date.now()+i,x:15+Math.random()*30,y:40+Math.random()*15,dx:(Math.random()-.5)*50}));
setFloat(p=>[...p,...batch]);
setCoinCount(c=>c+n);
setTimeout(()=>setFloat(p=>p.filter(c=>!batch.find(b=>b.id===c.id))),1400);
},[]);

const runScenario = useCallback((s) => {
if (running) return;
timerRefs.current.forEach(clearTimeout);
timerRefs.current = [];
const scenario = SCENARIOS.find(x=>x.key===s);
if (!scenario) return;
const sceneLines = scenario.fn();
const maxDelay = Math.max(...sceneLines.map(l=>l.delay));
setLines([]);
setRunning(true);
setStatus(scenario.status);
setProgress(0);
setActive(s);

sceneLines.forEach((line,i) => {
  const t = setTimeout(() => {
    setLines(p=>[...p,line]);
    setProgress(Math.round(((i+1)/sceneLines.length)*100));
    if (line.color==='error'||line.color==='fail') {
      setError(true); setTimeout(()=>setError(false),600);
    }
  }, line.delay);
  timerRefs.current.push(t);
});

const done = setTimeout(() => {
  setRunning(false);
  setStatus('READY');
  setProgress(100);
  if (scenario.pump) { setPump(true); setTimeout(()=>setPump(false),700); }
  spawnCoins(scenario.coins);
}, maxDelay + 400);
timerRefs.current.push(done);

}, [running, spawnCoins]);

const runCommand = useCallback(async (raw) => {
  const cmd = String(raw || '').trim();
  if (!cmd || running) return;
  appendLine(`gorilla@${PROJECT} ~ % ${cmd}`, 'cmd');
  setInputLine('');
  if (cmd === '/help') {
    appendLine('  /health · /info · /samiam <msg> · demo: /deploy /benchmark /d1 /tail /wrangler', 'info');
    appendLine('  Or type any goal — hits local POST /api/agentsam/message', 'muted');
    return;
  }
  if (cmd === '/health') {
    try {
      const res = await fetch('/api/health');
      appendLine(`  ${await res.text()}`, res.ok ? 'success' : 'error');
      setApiOnline(res.ok);
    } catch (e) {
      appendLine(`  ${e?.message || 'offline'}`, 'error');
      setApiOnline(false);
    }
    return;
  }
  if (cmd === '/info') {
    try {
      const res = await fetch('/api/agentsam/info');
      appendLine(`  ${await res.text()}`, res.ok ? 'info' : 'error');
    } catch (e) {
      appendLine(`  ${e?.message || 'offline'}`, 'error');
    }
    return;
  }
  if (cmd.startsWith('/samiam ')) {
    await runLiveSam(cmd.slice(8));
    return;
  }
  const demoKey = cmd.startsWith('/') ? cmd.slice(1).split(/\s+/)[0] : '';
  if (demoKey && SCENARIOS.find((s) => s.key === demoKey)) {
    runScenario(demoKey);
    return;
  }
  if (cmd.startsWith('/')) {
    appendLine(`  Unknown command. Try /help`, 'warn');
    return;
  }
  await runLiveSam(cmd);
}, [appendLine, runLiveSam, running, runScenario]);

const CSS = `@keyframes idle    {0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)}} @keyframes pump    {0%{transform:scale(1)} 30%{transform:scale(1.12) translateY(-7px)} 70%{transform:scale(.97)} 100%{transform:scale(1)}} @keyframes shake   {0%,100%{transform:translateX(0)} 20%{transform:translateX(-4px)} 40%{transform:translateX(4px)} 60%{transform:translateX(-3px)} 80%{transform:translateX(3px)}} @keyframes rise    {0%{transform:translateY(0) scale(1);opacity:1} 100%{transform:translateY(-80px) scale(.3);opacity:0}} @keyframes blink   {0%,100%{opacity:1} 50%{opacity:0}} @keyframes twinkle {0%,100%{opacity:.7} 50%{opacity:.1}} @keyframes flicker {0%,100%{transform:scaleY(1)} 50%{transform:scaleY(1.12) scaleX(.9)}} @keyframes scan    {0%{opacity:.02} 50%{opacity:.05} 100%{opacity:.02}} @keyframes fadein  {from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:none}} @keyframes errflash{0%,100%{box-shadow:none} 50%{box-shadow:0 0 30px #ff444488 inset}} .scen-btn{cursor:pointer;transition:all .12s;font-family:"Courier New",monospace;} .scen-btn:hover{transform:translateY(-1px);} .scen-btn:disabled{opacity:.35;cursor:not-allowed;transform:none;}`;

if (!booted) return (
<div style={{width:'100%',height:'100vh',background:'#030a14',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',fontFamily:'"Courier New",monospace',color:'#00e5ff'}}>
<style>{CSS}</style>
<div style={{fontSize:10,letterSpacing:6,opacity:.35,marginBottom:14}}>INNERANIMAL MEDIA</div>
<div style={{fontSize:15,letterSpacing:2,textShadow:'0 0 10px #00e5ff'}}>
{bootLine}<span style={{animation:'blink .7s infinite'}}>_</span>
</div>
</div>
);

return (
<div style={{width:'100%',minHeight:'100vh',background:`linear-gradient(160deg,${T.bg} 0%,#030a14 100%)`,fontFamily:'"Courier New",monospace',position:'relative',overflow:'hidden'}}>
<style>{CSS}</style>

  {/* Scanlines */}
  <div style={{position:'absolute',inset:0,pointerEvents:'none',zIndex:99,
    backgroundImage:`repeating-linear-gradient(0deg,${T.dim.replace('22','06')} 0,${T.dim.replace('22','06')} 1px,transparent 1px,transparent 3px)`,
    animation:'scan 5s infinite'}}/>

  {/* Stars */}
  {stars.map(s=>(
    <div key={s.id} style={{position:'absolute',left:`${s.x}%`,top:`${s.y}%`,width:s.s,height:s.s,background:'#fff',
      animation:`twinkle ${2+s.d}s infinite`,animationDelay:`${s.d}s`,pointerEvents:'none'}}/>
  ))}

  {/* Floating coins */}
  {floatCoins.map(c=>(
    <div key={c.id} style={{position:'absolute',left:`${c.x}%`,top:`${c.y}%`,
      animation:'rise 1.3s ease-out forwards',transform:`translateX(${c.dx}px)`,pointerEvents:'none',zIndex:60}}>
      <Sprite data={COIN} scale={.9}/>
    </div>
  ))}

  {/* Top bar */}
  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',
    padding:'10px 18px 8px',borderBottom:`1px solid ${T.border}`,background:T.panel}}>
    <div>
      <span style={{fontSize:9,letterSpacing:5,color:T.accent,opacity:.6}}>INNERANIMAL MEDIA  //  </span>
      <span style={{fontSize:12,fontWeight:900,letterSpacing:4,color:'#fff',textShadow:T.glow}}>GORILLA MODE</span>
    </div>
    <div style={{display:'flex',alignItems:'center',gap:16}}>
      <div style={{display:'flex',alignItems:'center',gap:6,background:'rgba(0,0,0,.5)',border:`1px solid ${T.accent}`,padding:'3px 10px'}}>
        <Sprite data={COIN} scale={.45}/>
        <span style={{color:T.accent,fontSize:11,letterSpacing:2}}>x {coinCount}</span>
      </div>
      <button className="scen-btn" onClick={()=>setThemeIdx(i=>(i+1)%TKEYS.length)}
        style={{padding:'4px 10px',background:'transparent',border:`1px solid ${T.border}`,color:T.accent,fontSize:9,letterSpacing:2}}>
        {TKEYS[themeIdx]}
      </button>
    </div>
  </div>

  {/* Main split */}
  <div style={{display:'flex',height:'calc(100vh - 130px)',minHeight:400}}>

    {/* LEFT: Gorilla + HUD */}
    <div style={{width:200,minWidth:180,borderRight:`1px solid ${T.border}`,background:T.panel,
      display:'flex',flexDirection:'column',alignItems:'center',padding:'16px 14px',gap:0,flexShrink:0}}>

      {/* Gorilla */}
      <div style={{
        animation: errorFlash ? 'shake .5s ease' : pump ? 'pump .6s ease' : 'idle 2.8s ease-in-out infinite',
        filter: errorFlash ? 'brightness(1.5) saturate(2) hue-rotate(-20deg)' : 'none',
        marginBottom:8,
      }}>
        <Sprite data={pump ? GORILLA_PUMP : GORILLA} scale={1.05}/>
      </div>

      {/* Flames */}
      <div style={{display:'flex',justifyContent:'center',gap:60,marginTop:-4}}>
        {[0,1].map(i=>(
          <div key={i} style={{animation:'flicker .45s infinite',animationDelay:`${i*.2}s`}}>
            <Sprite data={FLAME_FRAMES[flameTick]} scale={.9}/>
          </div>
        ))}
      </div>

      {/* Status */}
      <div style={{width:'100%',marginTop:14,paddingTop:12,borderTop:`1px solid ${T.border}`}}>
        <div style={{fontSize:9,letterSpacing:3,color:T.accent,marginBottom:10,textAlign:'center',textShadow:T.glow}}>
          {status}
          {running && <span style={{animation:'blink .7s infinite',marginLeft:4}}>_</span>}
        </div>

        <Bar pct={progress} color={T.accent} label="PROGRESS" val={`${progress}%`}/>
        <Bar pct={Math.max(0,100-progress)} color="#ff4444" label="ERRORS" val="50"/>
        <Bar pct={running?65:100} color="#44ff88" label="AGENT" val={running?'BUSY':'READY'}/>

        <div style={{marginTop:12,paddingTop:10,borderTop:`1px solid ${T.border}`,fontSize:9,color:'rgba(255,255,255,.3)',letterSpacing:1,lineHeight:1.8}}>
          <div>{PROJECT}</div>
          <div>lane: {LANE} · {AGENT}</div>
          <div>api: {apiOnline ? 'local :8787' : 'offline'}</div>
          <div style={{color:activeScenario?T.accent:'inherit'}}>
            {activeScenario ? `> ${activeScenario}` : '> idle'}
          </div>
        </div>
      </div>
    </div>

    {/* RIGHT: Terminal */}
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>

      {/* Terminal header */}
      <div style={{padding:'7px 16px',borderBottom:`1px solid ${T.border}`,background:'rgba(0,0,0,.4)',
        display:'flex',alignItems:'center',gap:8}}>
        <div style={{width:8,height:8,borderRadius:'50%',background:running?T.accent:'#ffffff22',boxShadow:running?T.glow:'none',transition:'all .3s'}}/>
        <span style={{fontSize:9,letterSpacing:2,color:'rgba(255,255,255,.3)'}}>TERMINAL OUTPUT</span>
        <span style={{marginLeft:'auto',fontSize:9,color:'rgba(255,255,255,.2)',letterSpacing:1}}>{lines.length} lines</span>
      </div>

      {/* Output */}
      <div ref={termRef} style={{flex:1,overflowY:'auto',padding:'14px 18px',
        animation: errorFlash ? 'errflash .5s ease' : 'none',
        scrollbarWidth:'thin',scrollbarColor:`${T.accent}33 transparent`}}>
        {lines.map((line, i) => (
          <div key={i} style={{
            fontFamily:'"Courier New",monospace',fontSize:12,lineHeight:1.65,
            whiteSpace:'pre',color: LC[line.color] || LC.white,
            animation: i===lines.length-1 ? 'fadein .15s ease' : 'none',
          }}>
            {line.text || '\u00A0'}
          </div>
        ))}
        {running && (
          <div style={{color:T.accent,fontSize:12,animation:'blink .7s infinite',marginTop:2}}>_</div>
        )}
      </div>

      {/* Input line */}
      <div style={{padding:'8px 16px',borderTop:`1px solid ${T.border}`,background:'rgba(0,0,0,.5)',
        display:'flex',alignItems:'center',gap:8}}>
        <span style={{color:T.accent,fontSize:12,whiteSpace:'nowrap'}}>gorilla@{PROJECT} ~ %</span>
        <input
          ref={inputRef}
          value={inputLine}
          disabled={running}
          onChange={(e) => setInputLine(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void runCommand(inputLine); }}
          placeholder={running ? 'running…' : '/help · /health · /samiam …'}
          style={{
            flex:1, fontSize:12, letterSpacing:.5, color:'rgba(255,255,255,.85)',
            background:'transparent', border:'none', outline:'none', fontFamily:'"Courier New",monospace',
          }}
        />
      </div>
    </div>
  </div>

  {/* Scenario buttons */}
  <div style={{borderTop:`1px solid ${T.border}`,background:T.panel,
    display:'flex',flexWrap:'wrap',gap:0}}>
    {SCENARIOS.map(s=>(
      <button key={s.key} className="scen-btn" disabled={running}
        onClick={()=>runScenario(s.key)}
        style={{flex:'1 1 0',padding:'10px 8px',minWidth:100,
          background: activeScenario===s.key ? T.dim : 'transparent',
          border:'none',borderRight:`1px solid ${T.border}`,
          color: activeScenario===s.key ? T.accent : 'rgba(255,255,255,.5)',
          fontSize:11,letterSpacing:1.5,textShadow: activeScenario===s.key ? T.glow : 'none'}}>
        {s.label}
      </button>
    ))}
  </div>
</div>
);
}
