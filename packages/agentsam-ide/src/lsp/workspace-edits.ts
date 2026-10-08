/** Authorized host application of LSP text-only workspace edits. */
export type LspTextEdit = {range:{start:{line:number;character:number};end:{line:number;character:number}};newText:string};
export type LspWorkspaceEdit = {changes?:Record<string,LspTextEdit[]>;documentChanges?:Array<{textDocument:{uri:string;version?:number|null};edits:LspTextEdit[]}>};
export type LspWorkspaceFile = {content:string;version:string};
export type LspWorkspaceWriter = {
  read(relativePath:string):Promise<LspWorkspaceFile>;
  write(relativePath:string,content:string,expectedVersion:string):Promise<{version:string}>;
  committed?(relativePath:string,content:string,version:string):void;
};

/** Stable absolute workspace root file URI for an authorized host path. */
export function workspaceRootFileUri(root:string):string {
  const value=root?.trim().replace(/\\/g,'/').replace(/\/$/,'');
  if(!value)throw new Error('lsp_workspace_root_required');
  const absolute=value.startsWith('/')?value:'/'+value;
  const encoded=absolute.split('/').map((part,index)=>{
    if(index===0)return '';
    if(index===1 && /^[a-zA-Z]:$/.test(part))return part;
    if(!part || part==='.' || part==='..')throw new Error('lsp_workspace_root_invalid');
    return encodeURIComponent(part);
  }).join('/');
  return 'file://' + encoded;
}

/** Compute line/character offsets using UTF-16 code units, as required by LSP. */
function offset(text:string,pos:{line:number;character:number}):number{
  if(!Number.isSafeInteger(pos.line)||pos.line<0||!Number.isSafeInteger(pos.character)||pos.character<0)throw new Error('lsp_edit_invalid_position');
  const lines=text.split('\n');
  if(pos.line>=lines.length||pos.character>lines[pos.line].length)throw new Error('lsp_edit_out_of_range');
  let result=pos.character;
  for(let i=0;i<pos.line;i++)result+=lines[i].length+1;
  return result;
}

export function applyLspTextEdits(content:string,edits:LspTextEdit[]):string{
  const mapped=edits.map(e=>({start:offset(content,e.range.start),end:offset(content,e.range.end),text:e.newText})).sort((a,b)=>b.start-a.start);
  let next=content,lastStart=Number.POSITIVE_INFINITY;
  for(const edit of mapped){
    if(edit.start>edit.end||edit.end>lastStart)throw new Error('lsp_edit_overlapping_ranges');
    next=next.slice(0,edit.start)+edit.text+next.slice(edit.end);
    lastStart=edit.start;
  }
  return next;
}

export async function applyLspWorkspaceEdit(edit:LspWorkspaceEdit,rootUri:string,host:LspWorkspaceWriter):Promise<{applied:string[]}> {
  const root=rootUri.endsWith('/')?rootUri:rootUri+'/';
  const pending=new Map<string,LspTextEdit[]>();
  for(const [uri,edits] of Object.entries(edit?.changes||{}))pending.set(uri,edits);
  for(const change of edit?.documentChanges||[]){
    if(!change||!('textDocument' in change)||!Array.isArray(change.edits))throw new Error('lsp_workspace_resource_operations_not_supported');
    const prev=pending.get(change.textDocument.uri)||[];
    pending.set(change.textDocument.uri,[...prev,...change.edits]);
  }
  const staged: Array<{path:string;before:LspWorkspaceFile;after:string}> = [];
  for(const [uri,edits] of pending){
    if(!uri.startsWith(root))throw new Error('lsp_edit_outside_authorized_workspace');
    let p:string;
    try{p=decodeURIComponent(uri.slice(root.length));}catch{throw new Error('lsp_invalid_edit_uri');}
    if(!p||p.split('/').some(part=>!part||part==='.'||part==='..'))throw new Error('lsp_invalid_edit_path');
    const before=await host.read(p);
    staged.push({path:p,before,after:applyLspTextEdits(before.content,edits)});
  }
  // All sources and ranges are validated before writing anything. Each write
  // retains optimistic version checks; remote multi-file writes are not atomic.
  const applied:string[]=[];
  for(const item of staged){
    if(item.after===item.before.content)continue;
    try{
      const result=await host.write(item.path,item.after,item.before.version);
      applied.push(item.path);
      host.committed?.(item.path,item.after,result.version);
    }catch(error){
      throw new Error('lsp_workspace_edit_incomplete; applied='+applied.join(',')+'; failed='+item.path+'; '+String(error));
    }
  }
  return {applied};
}
