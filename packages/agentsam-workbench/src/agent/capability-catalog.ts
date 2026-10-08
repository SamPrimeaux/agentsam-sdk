/**
 * A read-only projection, NOT a registry. Hosts provide their installed and
 * authorized tools, OAuth connections, widgets, skills and agents.
 * Selecting a mention never grants permission to execute.
 */
export type ComposerKind = 'connection' | 'mcp' | 'plugin' | 'widget' | 'skill' | 'agent' | 'command';
export type ComposerAction =
  | { type: 'mention' }
  | { type: 'open-side-stage'; tab: string }
  | { type: 'setup'; pluginId: string };
export type ComposerCatalogEntry = {
  id: string; kind: ComposerKind; label: string; mention: string; ready: boolean;
  status: string; description?: string; iconUrl?: string; iconDarkUrl?: string; icon?: string;
  capabilities?: string[]; action: ComposerAction;
};
type Plugin = Record<string, any>;
type Connection = Record<string, any>;
type HostItem = {
  id: string; label: string; mention?: string; description?: string;
  ready?: boolean; status?: string; icon?: string; iconUrl?: string;
  capabilities?: string[]; action?: ComposerAction;
};
export type ComposerCatalogSources = {
  plugins?: Plugin[]; connections?: Connection[]; widgets?: HostItem[];
  skills?: HostItem[]; agents?: HostItem[]; commands?: HostItem[];
};
export const COMPOSER_GROUPS: Array<{kind: ComposerKind; label: string}> = [
  {kind:'connection', label:'Connections'},
  {kind:'mcp', label:'MCP servers'},
  {kind:'widget', label:'Apps / widgets'},
  {kind:'plugin', label:'Plugins'},
  {kind:'skill', label:'Skills'},
  {kind:'agent', label:'Agents'},
  {kind:'command', label:'Commands'},
];
const enabled = (value: unknown) => value === 1 || value === true;
function mention(value: unknown): string | null {
  const raw=String(value||'').trim().toLowerCase().replace(/^@/,'');
  return /^[a-z][a-z0-9-]*$/.test(raw) ? '@'+raw : null;
}
export function projectComposerCatalog(sources: ComposerCatalogSources = {}): ComposerCatalogEntry[] {
  const result: ComposerCatalogEntry[]=[];
  const seen=new Set<string>();
  const add=(entry:ComposerCatalogEntry) => {
    if(!entry.mention || seen.has(entry.kind+':'+entry.id)) return;
    result.push(entry); seen.add(entry.kind+':'+entry.id);
  };
  for(const row of sources.connections || []) {
    if(row.kind!=='oauth') continue; // BYOK model keys are not tool connections.
    const token=mention(row.provider);
    if(!token) continue;
    const ready=row.status==='connected';
    add({id:'connection:'+row.provider,kind:'connection',
      label:String(row.display_name||row.label||row.provider),mention:token,ready,
      status:String(row.status||'not_connected'),description:ready?'Connected service':'Connect in Settings',
      action:ready?{type:'mention'}:{type:'setup',pluginId:String(row.provider)}});
  }
  for(const row of sources.plugins||[]) {
    if(!row||!enabled(row.composer_visible)||!enabled(row.is_enabled)) continue;
    const token=(Array.isArray(row.mention_aliases)?row.mention_aliases:[])
      .map(mention).find(Boolean)||mention(row.plugin_key);
    if(!token) continue;
    const key=String(row.plugin_key||'');
    const kind:ComposerKind=row.plugin_kind==='mcp'||row.transport==='mcp'||
      row.tool_lanes?.includes('mcp')||key.endsWith('-mcp')?'mcp':'plugin';
    const healthy=!['disabled','unhealthy','unreachable','auth_error'].includes(String(row.health_status||''));
    const ready=healthy&&(row.setup_status==='connected'||
      (row.setup_status==='configured'&&['none','workers_binding'].includes(String(row.auth_type||''))));
    add({id:'plugin:'+String(row.id||key),kind,mention:token,label:String(row.display_name||key),
      description:row.description||((row.tool_count||0)+' tools'),ready,
      status:row.health_status==='auth_error'?'reconnect':String(row.setup_status||'unconfigured'),
      iconUrl:row.icon_url,iconDarkUrl:row.icon_dark_url,capabilities:row.capabilities||[],
      action:ready?{type:'mention'}:{type:'setup',pluginId:String(row.id||key)}});
  }
  for(const [kind,items] of [
    ['widget',sources.widgets],['skill',sources.skills],['agent',sources.agents],['command',sources.commands]
  ] as const) {
    for(const item of items||[]) {
      const token=mention(item.mention||item.id);
      if(!token) continue;
      add({id:kind+':'+item.id,kind,mention:token,label:item.label,
        description:item.description,status:item.status||(item.ready?'available':'unavailable'),
        ready:item.ready===true,icon:item.icon,iconUrl:item.iconUrl,
        capabilities:item.capabilities,action:item.action||{type:'mention'}});
    }
  }
  return result.sort((a,b)=>COMPOSER_GROUPS.findIndex(x=>x.kind===a.kind)-
    COMPOSER_GROUPS.findIndex(x=>x.kind===b.kind)||a.label.localeCompare(b.label));
}
export function filterComposerCatalog(entries: readonly ComposerCatalogEntry[],query=''): ComposerCatalogEntry[] {
  const q=String(query).trim().replace(/^@/,'').toLowerCase();
  if(!q)return [...entries];
  return entries.filter(row=>[row.label,row.mention,row.description,row.kind,...(row.capabilities||[])]
    .some(value=>String(value||'').toLowerCase().includes(q)))
    .sort((a,b)=>Number(b.mention.slice(1).startsWith(q))-Number(a.mention.slice(1).startsWith(q)));
}
