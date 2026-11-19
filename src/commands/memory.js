import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';

const TYPES = new Set(['fact','preference','decision','policy','state','procedure','event','error']);
const HELP = [
  'AgentSam remote memory (canonical IAM_MAIN; local code index is separate)',
  'agentsam memory remote doctor [--json]',
  'agentsam memory remote search "query" [--key decision:cms:authority] [--project-id ID] [--json]',
  'agentsam memory remote commit --key decision:cms:authority --title "CMS authority" --file decision.md [--apply] [--json]',
  'Writes are dry runs unless --apply is supplied. Requires agentsam mcp connect inneranimalmedia.',
].join('\n');

function parse(argv) {
  const args = argv[0] === 'remote' ? argv.slice(1) : argv;
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    help:{type:'boolean',short:'h'}, json:{type:'boolean'}, query:{type:'string'},
    key:{type:'string'}, type:{type:'string'}, title:{type:'string'},
    content:{type:'string'}, file:{type:'string'}, tags:{type:'string'},
    'project-id':{type:'string'}, 'repository-id':{type:'string'},
    'source-ref':{type:'string'}, source:{type:'string'},
    sensitivity:{type:'string'}, apply:{type:'boolean'}, eager:{type:'boolean'},
    'top-k':{type:'string'}
  } });
  return { verb:positionals[0]||'help', rest:positionals.slice(1), values };
}
function fail(code){ const error = new Error(code); error.code=code; throw error; }
function unwrap(call){
  if(!call?.ok) fail(call?.error || 'memory_remote_mcp_call_failed');
  let value = call.result?.structuredContent;
  if(!value) {
    const raw = call.result?.content?.find(x=>x.type==='text')?.text;
    try { value=JSON.parse(raw); } catch { value={text:raw}; }
  }
  if(value?.ok===false) fail(value.error || 'memory_remote_backend_failed');
  return value;
}
export async function runMemory(argv=[], dependencies={}) {
  const {verb,rest,values:v}=parse(argv);
  const write=dependencies.write || (s=>process.stdout.write(s));
  if(v.help || verb==='help') { write(HELP+'\n'); return {help:true}; }
  if(!['doctor','search','commit'].includes(verb)) fail('memory_remote_unknown_command');
  // OAuth/resource server owns account identity; callers may not supply tenant IDs.
  const resolve=dependencies.resolveServer || (await import('../mcp/oauth-connection.js')).resolveMcpResourceServer;
  const mcp=dependencies.mcp || await import('../mcp/client.js');
  const server=await resolve();
  let output;
  if(verb==='doctor') {
    const found=await mcp.listMcpTools(server);
    if(found.error) fail('memory_remote_tool_discovery_failed');
    const names=new Set((found.tools||[]).map(t=>t.name));
    output={ok:names.has('agentsam_memory_search')&&names.has('agentsam_memory_commit'),
      provider:'inneranimalmedia-mcp',backend:'IAM_MAIN',
      search_available:names.has('agentsam_memory_search'),
      commit_available:names.has('agentsam_memory_commit'),
      note:'Tool discovery is not a memory service health or write receipt.'};
  } else if(verb==='search') {
    const query=String(v.query||rest.join(' ')).trim(), key=String(v.key||'').trim();
    if(!query&&!key) fail('memory_remote_query_or_key_required');
    const topK=v['top-k']===undefined ? 8:Number(v['top-k']);
    if(!Number.isInteger(topK)||topK<1||topK>20) fail('memory_remote_top_k_invalid');
    const params={...(query?{query}:{}),...(key?{memory_key:key}:{}),top_k:topK,
      ...(v['project-id']?{project_id:v['project-id']}:{}),
      ...(v['repository-id']?{repository_id:v['repository-id']}:{})};
    output=unwrap(await mcp.callMcpTool(server,'agentsam_memory_search',params));
  } else {
    if(rest.length) fail('memory_remote_commit_unknown_positionals');
    const key=String(v.key||'').trim(), title=String(v.title||'').trim();
    if(!key||!title) fail('memory_remote_key_and_title_required');
    if(!/^[a-z][a-z0-9_-]*:[a-z0-9_-]+:[a-z0-9_-]+$/i.test(key)) fail('memory_remote_key_format_invalid');
    if(v.content&&v.file) fail('memory_remote_use_content_or_file');
    const type=v.type||key.split(':')[0];
    if(!TYPES.has(type)) fail('memory_remote_type_invalid');
    if(v.sensitivity&&!['normal','internal','confidential','secret'].includes(v.sensitivity)) fail('memory_remote_sensitivity_invalid');
    let body=String(v.content||'');
    if(v.file){
      const file=path.resolve(v.file), stat=await fs.stat(file);
      if(!stat.isFile()||stat.size>65536) fail('memory_remote_file_too_large_or_invalid');
      body=await fs.readFile(file,'utf8');
    }
    if(!body.trim()) fail('memory_remote_content_required');
    if(Buffer.byteLength(body,'utf8')>65536) fail('memory_remote_content_too_large');
    const params={memory_key:key,memory_type:type,title,content:body,
      dry_run:!v.apply,eager:Boolean(v.eager),
      source:v.source||'agentsam-cli',source_client:'mcp',
      idempotency_key:'cli_'+createHash('sha256').update(JSON.stringify([key,title,body])).digest('hex').slice(0,32),
      ...(v['source-ref']?{source_ref:v['source-ref']}:{}),
      ...(v.tags?{tags:v.tags.split(',').map(x=>x.trim()).filter(Boolean)}:{}),
      ...(v['project-id']?{project_id:v['project-id']}:{}),
      ...(v['repository-id']?{repository_id:v['repository-id']}:{}),
      ...(v.sensitivity?{sensitivity:v.sensitivity}:{})};
    output=unwrap(await mcp.callMcpTool(server,'agentsam_memory_commit',params));
    output={...output,dry_run:!v.apply,action:v.apply?'committed':'validated_only'};
  }
  write(JSON.stringify(output,null,2)+'\n');
  return output;
}

