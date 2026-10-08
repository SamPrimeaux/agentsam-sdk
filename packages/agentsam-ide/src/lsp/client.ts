/**
 * Provider-agnostic LSP JSON-RPC client. A desktop or remote workspace host
 * supplies the transport; Monaco has no dependency on a particular daemon.
 */
export type LspMessage = { jsonrpc: '2.0'; id?: number | string; method?: string; params?: unknown; result?: unknown; error?: unknown };
export type LspTransport = {
  start(language: string): Promise<{ session_id: string }>;
  send(sessionId: string, message: LspMessage): Promise<void>;
  poll(sessionId: string, after: number): Promise<{ cursor: number; running: boolean; error?: string | null; messages: Array<{seq:number;message:LspMessage}> }>;
  stop(sessionId: string): Promise<void>;
};
export type LspDiagnostics = { uri: string; version?:number|null; diagnostics: Array<{range:{start:{line:number;character:number};end:{line:number;character:number}};message:string;severity?:number;source?:string;code?:string|number}> };
export type LspReady = { serverInfo?: {name:string;version?:string}; capabilities?: Record<string,unknown> };

/** The packaged HTTP bridge is one transport implementation, not mandatory. */
export class HttpLspTransport implements LspTransport {
  constructor(private readonly endpoint: string, private readonly capability: string) {
    if (!endpoint || !capability) throw new Error('lsp_workspace_capability_required');
    const url=new URL(endpoint);
    if (url.protocol!=='https:' && !(url.protocol==='http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname))) {
      throw new Error('lsp_insecure_host_denied');
    }
  }
  private async call(action: string, data: Record<string,unknown>) {
    const u=new URL(`${this.endpoint.replace(/\/$/,'')}/v1/lsp/${action}`);
    if(action==='poll')for(const [key,value] of Object.entries(data))u.searchParams.set(key,String(value));
    const resp=await fetch(u.toString(),{method:action==='poll'?'GET':'POST',headers:{'x-agentsam-workspace-capability':this.capability,...(action==='poll'?{}:{'Content-Type':'application/json'})},...(action==='poll'?{}:{body:JSON.stringify(data)})});
    if(!resp.ok)throw new Error(`lsp_host_http_${resp.status}`);
    const result=await resp.json() as Record<string,unknown>;
    if(!result.ok)throw new Error(String(result.error || 'lsp_host_request_failed'));
    return result;
  }
  async start(language:string){ const r=await this.call('start',{language});return {session_id:String(r.session_id)}; }
  async send(sessionId:string,message:LspMessage){await this.call('send',{session_id:sessionId,message});}
  async poll(sessionId:string,after:number){ const r=await this.call('poll',{session_id:sessionId,after});return {cursor:Number(r.cursor),running:Boolean(r.running),error: r.error ? String(r.error):null,messages:r.messages as Array<{seq:number;message:LspMessage}>}; }
  async stop(sessionId:string){await this.call('stop',{session_id:sessionId});}
}

export class LspClient {
  private session: string | null = null;
  private sequence=0;
  private nextId=1;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private outgoing: Promise<void>=Promise.resolve();
  private diagnosticTimers=new Map<string,ReturnType<typeof setTimeout>>();
  private readonly pending = new Map<number,{resolve:(value:any)=>void;reject:(error:Error)=>void; method:string; timer:ReturnType<typeof setTimeout>}>();
  private closed=false;
  public initialized=false;
  private failure: Error | null = null;
  private readonly listeners=new Set<(event:LspDiagnostics)=>void>();
  private readonly docs=new Map<string,{version:number;text:string;languageId:string}>();
  public readiness: 'missing'|'starting'|'ready'|'error'='missing';
  public serverInfo: LspReady['serverInfo'] | undefined;
  private readonly statusListeners=new Set<(status:'missing'|'starting'|'ready'|'error',reason?:string)=>void>();
  onStatus(listener:(status:'missing'|'starting'|'ready'|'error',reason?:string)=>void):()=>void{this.statusListeners.add(listener);return ()=>this.statusListeners.delete(listener);}
  private setStatus(status:'missing'|'starting'|'ready'|'error',reason?:string){this.readiness=status;for(const listener of this.statusListeners)listener(status,reason);}

  constructor(private readonly transport:LspTransport, private readonly language:string, private readonly workspaceRootUri:string, private readonly opts:{pollMs?:number;timeoutMs?:number}={}) {}

  private async deliver(message:LspMessage){
    if(!this.session||this.closed)throw new Error('lsp_not_started');
    const session=this.session;
    const current=this.outgoing.then(()=>this.transport.send(session,message));
    this.outgoing=current.catch(()=>{});
    return current;
  }

  private async request(method:string,params:unknown):Promise<any>{
    const id=this.nextId++;
    const response=new Promise<any>((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('lsp_request_timeout:'+method));},this.opts.timeoutMs??12000);
      this.pending.set(id,{resolve,reject,method,timer});
    });
    try{await this.deliver({jsonrpc:'2.0',id,method,params});}catch(error){const p=this.pending.get(id);if(p){clearTimeout(p.timer);this.pending.delete(id);p.reject(error as Error);}}
    return response;
  }

  private onMessage(message:LspMessage){
    if(message.id!==undefined && !message.method){
      const key=typeof message.id==='number'?message.id:NaN;
      const p=this.pending.get(key);
      if(!p)return;
      this.pending.delete(key);clearTimeout(p.timer);
      if(message.error)p.reject(new Error('lsp_server_error:'+JSON.stringify(message.error)));
      else {
        p.resolve(message.result);
        if(this.initialized && p.method.startsWith('textDocument/') && this.readiness==='starting')this.setStatus('ready',this.serverInfo?.name);
      }
      return;
    }
    if(message.method==='textDocument/publishDiagnostics'){
      const event=message.params as LspDiagnostics;
      if(event?.uri){
        const known=this.docs.get(event.uri);
        if(known && event.version!=null && event.version<known.version)return;
        for(const listener of this.listeners)listener(event);
        if(this.initialized && known && this.readiness==='starting')this.setStatus('ready',this.serverInfo?.name);
      }
    }
    // LSP servers may make requests during initialize/indexing.
    if(message.id!==undefined && message.method){
      let result:unknown=null;
      if(message.method==='workspace/configuration'){
        const params=message.params as {items?:unknown[]};
        result=(params?.items||[]).map(()=>null);
      }else if(message.method==='window/workDoneProgress/create'||message.method==='client/registerCapability'||message.method==='client/unregisterCapability')result=null;
      else if(message.method==='workspace/workspaceFolders') result=[{uri:this.workspaceRootUri,name:'workspace'}];
      else if(['workspace/diagnostic/refresh','workspace/semanticTokens/refresh','workspace/inlayHint/refresh','workspace/codeLens/refresh'].includes(message.method)){
        result=null;
        if(message.method==='workspace/diagnostic/refresh'){
          for(const uri of this.docs.keys())void this.pullDiagnostics(uri).catch(()=>{});
        }
      }
      else {
        void this.deliver({jsonrpc:'2.0',id:message.id,error:{code:-32601,message:'Method not supported by AgentSam IDE'}}).catch(()=>{});
        return;
      }
      void this.deliver({jsonrpc:'2.0',id:message.id,result}).catch(()=>{});
    }
  }

  private async pump(){
    if(this.closed || !this.session)return;
    try{
      const r=await this.transport.poll(this.session,this.sequence);
      this.sequence=Math.max(this.sequence,r.cursor);
      for(const {message} of r.messages)this.onMessage(message);
      if(!r.running){this.failure=new Error(r.error||'language_server_exited');this.setStatus('error',this.failure.message);this.rejectPending(this.failure);return;}
    }catch(error){this.failure=error as Error;this.setStatus('error',this.failure.message);this.rejectPending(this.failure);return;}
    this.timer=setTimeout(()=>void this.pump(),this.opts.pollMs??150);
  }
  private rejectPending(error:Error){for(const [id,p] of this.pending){clearTimeout(p.timer);p.reject(error);this.pending.delete(id);}}

  async connect():Promise<LspReady>{
    if(this.session)throw new Error('lsp_already_started');
    this.closed=false;this.setStatus('starting');
    const start=await this.transport.start(this.language);
    this.session=start.session_id;this.sequence=0;
    void this.pump();
    try{
      const result=await this.request('initialize',{
        processId:null,rootUri:this.workspaceRootUri,rootPath:null,
        workspaceFolders:[{uri:this.workspaceRootUri,name:'workspace'}],
        clientInfo:{name:'AgentSam IDE',version:'1'},
        capabilities:{textDocument:{diagnostic:{dynamicRegistration:false,relatedDocumentSupport:false},publishDiagnostics:{relatedInformation:true},hover:{contentFormat:['markdown','plaintext']},completion:{completionItem:{snippetSupport:false}},definition:{},references:{},rename:{}},workspace:{workspaceFolders:true,configuration:true,applyEdit:false}},
      }) as LspReady;
      await this.deliver({jsonrpc:'2.0',method:'initialized',params:{}});
      this.serverInfo=result.serverInfo;
      this.initialized=true;
      // Initialize confirms transport, not language intelligence. Readiness is earned
      // on a real diagnostic or a text-document response after opening the file.
      return result;
    }catch(error){await this.close();this.setStatus('error',error instanceof Error?error.message:String(error));throw error;}
  }

  onDiagnostics(listener:(event:LspDiagnostics)=>void):()=>void{this.listeners.add(listener);return ()=>this.listeners.delete(listener);}
  async pullDiagnostics(uri:string):Promise<void>{
    if(!this.initialized||!this.docs.has(uri))return;
    const response=await this.request('textDocument/diagnostic',{textDocument:{uri}}) as {kind?:string;items?:LspDiagnostics['diagnostics']}|null;
    if(response?.kind!=='full'||!Array.isArray(response.items))return;
    if(this.readiness==='starting')this.setStatus('ready',this.serverInfo?.name);
    for(const listener of this.listeners)listener({uri,version:this.docs.get(uri)?.version,diagnostics:response.items});
  }
  async open(uri:string,languageId:string,text:string){if(!this.initialized)throw new Error('lsp_not_initialized');this.docs.set(uri,{version:1,text,languageId});await this.deliver({jsonrpc:'2.0',method:'textDocument/didOpen',params:{textDocument:{uri,languageId,version:1,text}}});}
  async change(uri:string,text:string){
    const d=this.docs.get(uri);if(!d)throw new Error('lsp_document_not_open');
    const previous=d.text;
    if(previous===text)return;
    const lines=previous.split('\n');
    const range={start:{line:0,character:0},end:{line:lines.length-1,character:lines.at(-1)?.length||0}};
    d.version++;d.text=text;
    // Incremental-sync language servers require range on didChange, even for a full-document replacement.
    await this.deliver({jsonrpc:'2.0',method:'textDocument/didChange',params:{textDocument:{uri,version:d.version},contentChanges:[{range,text}]}});
    const prior=this.diagnosticTimers.get(uri);if(prior)clearTimeout(prior);
    this.diagnosticTimers.set(uri,setTimeout(()=>{
      this.diagnosticTimers.delete(uri);
      void this.pullDiagnostics(uri).catch(()=>{});
    },450));
  }
  async saved(uri:string){if(this.docs.has(uri))await this.deliver({jsonrpc:'2.0',method:'textDocument/didSave',params:{textDocument:{uri,text:this.docs.get(uri)?.text}}});}
  async closeDocument(uri:string){if(!this.docs.delete(uri))return;await this.deliver({jsonrpc:'2.0',method:'textDocument/didClose',params:{textDocument:{uri}}});}
  hover(uri:string,line:number,character:number){return this.request('textDocument/hover',{textDocument:{uri},position:{line,character}});}
  definition(uri:string,line:number,character:number){return this.request('textDocument/definition',{textDocument:{uri},position:{line,character}});}
  completion(uri:string,line:number,character:number){return this.request('textDocument/completion',{textDocument:{uri},position:{line,character}});}
  references(uri:string,line:number,character:number){return this.request('textDocument/references',{textDocument:{uri},position:{line,character},context:{includeDeclaration:true}});}
  rename(uri:string,line:number,character:number,newName:string){return this.request('textDocument/rename',{textDocument:{uri},position:{line,character},newName});}
  async close(){this.initialized=false;for(const timer of this.diagnosticTimers.values())clearTimeout(timer);this.diagnosticTimers.clear();this.closed=true;if(this.timer)clearTimeout(this.timer);this.rejectPending(new Error('lsp_closed'));const id=this.session;this.session=null;this.setStatus('missing');if(id)await this.transport.stop(id).catch(()=>{});this.docs.clear();}
}
