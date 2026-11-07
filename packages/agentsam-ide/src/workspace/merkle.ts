import type { WorkspaceChange, WorkspaceSnapshot } from './files.js';

export type WorkspaceHashedEntry = {path:string; hash:string};

/** Strict, content-hash-only snapshot. No mtime/filename masquerading as a Merkle digest. */
export async function hashWorkspaceEntries(entries: WorkspaceHashedEntry[], createdAt = new Date().toISOString()): Promise<WorkspaceSnapshot> {
  const normalized = [...entries].sort((a,b)=>a.path.localeCompare(b.path));
  const unique = new Set<string>();
  for (const entry of normalized) {
    if (!entry.path || !entry.hash || unique.has(entry.path) || entry.path.startsWith('/') || entry.path.split('/').some(p=>p==='..'))
      throw new Error('Workspace Merkle snapshot requires unique relative paths and verified content hashes.');
    unique.add(entry.path);
  }
  const sha = async (text:string):Promise<string> => {
    const bytes = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
  };
  let level = await Promise.all(normalized.map(entry=>sha('leaf\0'+entry.path+'\0'+entry.hash)));
  if (level.length === 0) level = [await sha('empty')];
  while(level.length>1) {
    const next:string[] = [];
    for(let i=0;i<level.length;i+=2)next.push(await sha('node\0'+level[i]+'\0'+(level[i+1]||level[i])));
    level=next;
  }
  return {id:level[0]!,rootHash:level[0]!,createdAt,fileCount:normalized.length,entries:normalized.map(x=>({...x}))};
}

export function diffWorkspaceSnapshots(baseline: WorkspaceSnapshot, current: WorkspaceSnapshot): WorkspaceChange[] {
  if (!baseline.entries || !current.entries) throw new Error('Merkle changes require both complete verified entry manifests.');
  const before=new Map(baseline.entries.map(entry=>[entry.path,entry.hash]));
  const after=new Map(current.entries.map(entry=>[entry.path,entry.hash]));
  const changes:WorkspaceChange[]=[];
  for(const [path,hash] of after){
    const old=before.get(path);
    if(old===undefined)changes.push({path,status:'added'});
    else if(old!==hash)changes.push({path,status:'modified'});
  }
  for(const path of before.keys())if(!after.has(path))changes.push({path,status:'deleted'});
  return changes.sort((a,b)=>a.path.localeCompare(b.path));
}
