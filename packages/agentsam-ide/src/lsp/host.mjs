/**
 * Optional Node workspace-host adapter for a real Language Server Protocol process.
 * Exposes JSON-RPC messages without tying agentsam-ide/monaco to Go, Node, or HTTP.
 * Only supported installed binaries can be executed, always in the authorized cwd.
 */
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve, join, delimiter } from 'node:path';
import { existsSync, accessSync, constants, readdirSync } from 'node:fs';
import { homedir } from 'node:os';

export const LANGUAGE_EXECUTABLES = Object.freeze({
  typescript: { name: 'typescript-language-server', args: ['--stdio'] },
  javascript: { name: 'typescript-language-server', args: ['--stdio'] },
  rust: { name: 'rust-analyzer', args: [] },
  go: { name: 'gopls', args: ['serve'] },
  python: { name: 'pyright-langserver', args: ['--stdio'] },
});


/** Discover executables without an interactive shell or hidden installation.
 * Works for Finder-launched macOS apps whose PATH omits Homebrew, nvm and rustup.
 */
export function resolveLanguageServerBinary(name, env=process.env) {
  if (!/^[a-zA-Z0-9-]+$/.test(name)) return null;
  const home=env.HOME||homedir();
  const paths=[...(env.PATH||'').split(delimiter),
    '/opt/homebrew/bin','/usr/local/bin',join(home,'.cargo','bin'),
    join(home,'.local','bin'),
  ];
  const versions=join(home,'.nvm','versions','node');
  if(existsSync(versions))for(const v of readdirSync(versions).sort().reverse())paths.push(join(versions,v,'bin'));
  for(const folder of paths){
    if(!folder)continue;
    const full=join(folder,name);
    try {accessSync(full,constants.X_OK);return full;} catch { /* try next known install directory */ }
  }
  return null;
}

function encode(message) {
  const body = Buffer.from(JSON.stringify(message), 'utf8');
  return Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`), body]);
}

export class LspHost {
  constructor({ root, spawnProcess = spawn, maxSessions = 20, maxMessages = 512 }) {
    this.root = resolve(root);
    this.spawnProcess = spawnProcess;
    this.maxSessions = maxSessions;
    this.maxMessages = maxMessages;
    this.sessions = new Map();
  }

  listAvailable() {
    return Object.keys(LANGUAGE_EXECUTABLES);
  }
  capabilities(){
    return Object.fromEntries(Object.entries(LANGUAGE_EXECUTABLES).map(([language,config])=>[
      language, { installed:Boolean(resolveLanguageServerBinary(config.name)),binary:config.name }
    ]));
  }

  start(language) {
    const cfg = LANGUAGE_EXECUTABLES[language];
    if (!cfg) return { ok: false, error: 'unsupported_language' };
    // Each editor client owns its language-server lifecycle. Never reuse sessions: a second initialize or close would corrupt another editor.
    for(const [key,value] of this.sessions){ if(!value.running && Date.now() - (value.exitedAt||Date.now()) > 1000) this.sessions.delete(key); }
    if (this.sessions.size >= this.maxSessions) return { ok: false, error: 'session_limit' };
    const id = randomUUID();
    const binary=resolveLanguageServerBinary(cfg.name);
    if(!binary)return {ok:false,error:'server_not_installed',server:cfg.name};
    const proc = this.spawnProcess(binary, cfg.args, {
      cwd: this.root,
      stdio: ['pipe','pipe','pipe'],
      env: { ...process.env },
      shell: false,
    });
    const session = { id, language, proc, buffer: Buffer.alloc(0), seq: 0, messages: [], running: true, error: null };
    this.sessions.set(id, session);
    const event = (message) => {
      session.seq++;
      session.messages.push({ seq: session.seq, message });
      if (session.messages.length > this.maxMessages) session.messages.splice(0, session.messages.length-this.maxMessages);
    };
    proc.stdout.on('data', chunk => {
      session.buffer = Buffer.concat([session.buffer, chunk]);
      if(session.buffer.length>16*1024*1024){session.error='lsp_buffer_limit';this.stop(id);return;}
      for (;;) {
        const divider = session.buffer.indexOf('\r\n\r\n');
        if (divider < 0) break;
        const header = session.buffer.subarray(0,divider).toString('ascii');
        const size = /^Content-Length:\s*(\d+)\s*$/im.exec(header)?.[1];
        if (!size || Number(size) > 8*1024*1024) {session.error = 'invalid_lsp_frame';this.stop(id);break;}
        const end = divider+4+Number(size);
        if (session.buffer.length < end) break;
        try {event(JSON.parse(session.buffer.subarray(divider+4,end).toString('utf8')));} catch {event({jsonrpc:'2.0',method:'$/parseError'});}
        session.buffer=session.buffer.subarray(end);
      }
    });
    proc.stderr.on('data', chunk => { session.stderr=String(chunk).slice(-600); });
    proc.on('error', error => {session.error=error.code==='ENOENT'?'server_not_installed':error.message;session.running=false;event({jsonrpc:'2.0',method:'$/serverExit',params:{error:session.error}});});
    proc.on('exit',(code,signal)=>{session.running=false;session.exitedAt=Date.now();event({jsonrpc:'2.0',method:'$/serverExit',params:{code,signal,error:session.error}});});
    return { ok: true, session_id: id, language, transport:'lsp.jsonrpc.v2' };
  }

  send(id, message) {
    const s=this.sessions.get(id);
    if (!s || !s.running) return { ok:false, error:s?.error||'session_not_running' };
    if (!message || message.jsonrpc !== '2.0' || (typeof message.method !== 'string' && (message.id === undefined || (!('result' in message) && !('error' in message))))) return {ok:false,error:'invalid_jsonrpc_message'};
    const framed=encode(message);
    if (framed.length > 8*1024*1024) return {ok:false,error:'message_too_large'};
    try {s.proc.stdin.write(framed);return {ok:true};} catch(error) {return {ok:false,error:error.message};}
  }

  poll(id, after=0) {
    const s=this.sessions.get(id);
    if (!s) return {ok:false,error:'unknown_session'};
    const next=s.messages.filter(e=>e.seq>after);
    return {ok:true,session_id:id,running:s.running,error:s.error,cursor:s.seq,messages:next};
  }

  stop(id) {
    const s=this.sessions.get(id);
    if (!s) return {ok:false,error:'unknown_session'};
    s.running=false;
    try {s.proc.kill();} catch {}
    this.sessions.delete(id);
    return {ok:true};
  }

  close() {for(const id of [...this.sessions.keys()]) this.stop(id);}
}
