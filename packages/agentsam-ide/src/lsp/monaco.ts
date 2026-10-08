/** Monaco UI adapters for live LSP sessions; no filesystem or process authority. */
import type * as Monaco from 'monaco-editor';
import type { LspClient, LspDiagnostics } from './client.js';

export type LspLocation = { uri: string; range: { start: {line:number;character:number}; end:{line:number;character:number} } };
export type MonacoLspContext = {
  /** Monaco's virtual project-local model URI. */
  modelUri: string;
  /** Actual file:// URI resolved by the authorized workspace host. */
  fileUri: string;
  languageId: string;
  /** Resolve returned file:// paths to user-visible Monaco virtual models. */
  resolveLocation?: (location: LspLocation) => Monaco.languages.Location | null | Promise<Monaco.languages.Location | null>;
  /** A multi-file rename is permitted only through explicit host implementation. */
  applyWorkspaceEdit?: (edit: unknown) => Promise<Monaco.languages.WorkspaceEdit>;
};

function markdown(contents: unknown): Monaco.IMarkdownString[] {
  if(!contents)return [];
  const items=Array.isArray(contents)?contents:[contents];
  return items.map(item=>typeof item==='string'?{value:item}:typeof item==='object'&&item!==null&&'value' in item?{value:String(item.value)}:{value:String(item)});
}
function lspPos(p:Monaco.Position){return {line:p.lineNumber-1,character:p.column-1};}
function range(monaco:typeof Monaco,r:LspLocation['range']){return new monaco.Range(r.start.line+1,r.start.character+1,r.end.line+1,r.end.character+1);}

export function attachLspToMonaco(monaco: typeof Monaco, editor: Monaco.editor.IStandaloneCodeEditor, client: LspClient, context: MonacoLspContext) {
  const registrations:Monaco.IDisposable[]=[];
  const modelMatches=(m:Monaco.editor.ITextModel)=>m.uri.toString()===context.modelUri;
  const resolve=async(value:unknown):Promise<Monaco.languages.Location[]>=>{
    const raw=Array.isArray(value)?value:(value?[value]:[]);
    const locations:Monaco.languages.Location[]=[];
    for(const candidate of raw){
      const x=candidate as Partial<LspLocation & {targetUri:string;targetSelectionRange:LspLocation['range']}>;
      const uri=x.uri??x.targetUri;const r=x.range??x.targetSelectionRange;
      if(!uri || !r)continue;
      const l:LspLocation={uri,range:r};
      const resolved=await context.resolveLocation?.(l);
      if(resolved)locations.push(resolved);
      else if(uri===context.fileUri)locations.push({uri:monaco.Uri.parse(context.modelUri),range:range(monaco,r)});
    }
    return locations;
  };
  registrations.push(monaco.languages.registerHoverProvider(context.languageId,{
    async provideHover(model,position){
      if(!modelMatches(model) || !client.initialized || client.readiness==='error')return null;
      const h=await client.hover(context.fileUri,position.lineNumber-1,position.column-1) as {contents?:unknown;range?:LspLocation['range']}|null;
      if(!h?.contents)return null;
      return {contents:markdown(h.contents),...(h.range?{range:range(monaco,h.range)}:{})};
    },
  }));
  registrations.push(monaco.languages.registerDefinitionProvider(context.languageId,{
    async provideDefinition(model,position){if(!modelMatches(model)||!client.initialized || client.readiness==='error')return null;return resolve(await client.definition(context.fileUri,position.lineNumber-1,position.column-1));},
  }));
  registrations.push(monaco.languages.registerReferenceProvider(context.languageId,{
    async provideReferences(model,position){if(!modelMatches(model)||!client.initialized || client.readiness==='error')return [];return resolve(await client.references(context.fileUri,position.lineNumber-1,position.column-1));},
  }));
  registrations.push(monaco.languages.registerCompletionItemProvider(context.languageId,{
    triggerCharacters:['.',':','>','/'],
    async provideCompletionItems(model,position){
      if(!modelMatches(model)||!client.initialized || client.readiness==='error')return {suggestions:[]};
      const result=await client.completion(context.fileUri,position.lineNumber-1,position.column-1) as {items?:any[]}|any[]|null;
      const raw=Array.isArray(result)?result:(result?.items||[]);
      const suggestions:Monaco.languages.CompletionItem[]=raw.map((item:any)=>({
        label:item.label,
        kind:item.kind?Math.max(0,item.kind-1):monaco.languages.CompletionItemKind.Text,
        insertText:typeof item.insertText==='string'?item.insertText:item.label,
        detail:item.detail,
        documentation:item.documentation?.value||item.documentation,
        range:item.textEdit?.range?range(monaco,item.textEdit.range):model.getWordUntilPosition(position).endColumn>=position.column
          ?{startLineNumber:position.lineNumber,endLineNumber:position.lineNumber,startColumn:model.getWordUntilPosition(position).startColumn,endColumn:model.getWordUntilPosition(position).endColumn}
          :new monaco.Range(position.lineNumber,position.column,position.lineNumber,position.column),
      }));
      return {suggestions};
    },
  }));
  registrations.push(monaco.languages.registerRenameProvider(context.languageId,{
    async provideRenameEdits(model,position,newName){
      if(!modelMatches(model)||!client.initialized || client.readiness==='error')return {edits:[]};
      const result=await client.rename(context.fileUri,position.lineNumber-1,position.column-1,newName);
      if(!context.applyWorkspaceEdit)throw new Error('lsp_multi_file_rename_requires_authorized_workspace_adapter');
      return context.applyWorkspaceEdit(result);
    },
  }));
  const onDiagnostics=(data:LspDiagnostics)=>{
    if(data.uri!==context.fileUri)return;
    const model=monaco.editor.getModel(monaco.Uri.parse(context.modelUri));
    if(!model)return;
    monaco.editor.setModelMarkers(model,'agentsam-lsp',data.diagnostics.map(d=>({
      ...range(monaco,d.range), message:d.message,
      severity:d.severity===1?monaco.MarkerSeverity.Error:d.severity===2?monaco.MarkerSeverity.Warning:monaco.MarkerSeverity.Info,
      source:d.source||'LSP',code:d.code===undefined?undefined:String(d.code),
    })));
  };
  const action=editor.addAction({
    id:'agentsam.ide.goToDefinition',
    label:'Go to definition',
    keybindings:[monaco.KeyCode.F12],
    run:async(ed)=>{
      const position=ed.getPosition();
      if(!position || !client.initialized || client.readiness==='error')return;
      const list=await resolve(await client.definition(context.fileUri,position.lineNumber-1,position.column-1));
      const first=list[0];if(!first)return;
      if(first.uri.toString()===context.modelUri){
        ed.setSelection(first.range);
        ed.revealRangeInCenter(first.range);
      }
    },
  });
  registrations.push(action);
  const remove=client.onDiagnostics(onDiagnostics);
  return {dispose(){remove();registrations.forEach(x=>x.dispose());const model=monaco.editor.getModel(monaco.Uri.parse(context.modelUri));if(model)monaco.editor.setModelMarkers(model,'agentsam-lsp',[]);}};
}
