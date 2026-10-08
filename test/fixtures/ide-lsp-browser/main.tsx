import React,{useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {loader} from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
import TsWorker from 'monaco-editor/language/typescript/ts.worker?worker';
import {AgentSamMonacoEditor} from '@inneranimalmedia/agentsam-ide/monaco';
import {HttpLspTransport} from '@inneranimalmedia/agentsam-ide/lsp';
(self as any).MonacoEnvironment={getWorker:(_id:string,label:string)=>label==='typescript'||label==='javascript'?new TsWorker():new EditorWorker()};
loader.config({monaco});
const conf=(window as any).IDE_TEST;
const invalid='fn main() { let x = ; }\n';
const g=window as any;g.editorReady=false;g.status='missing';g.currentValue=invalid;
function App(){
 const [text,setText]=useState(invalid);const[status,setStatus]=useState('missing');
 const bridge=useMemo(()=>({transport:new HttpLspTransport(conf.baseUrl,conf.capability),workspaceRootUri:conf.rootUri,onStatus:(status:string,detail?:string)=>{setStatus(status);g.status=status;g.statusDetail=detail;}}),[]);
 return <><label id="status">LSP: {status}</label><div className="ide-test-editor"><AgentSamMonacoEditor document={{workspaceId:'browser-merchant',path:'src/main.rs',text,languageId:'rust'}} onChange={v=>{setText(v);g.currentValue=v;}}
 onSave={async value=>{
  const headers={'x-agentsam-workspace-capability':conf.capability};
  const read=await fetch(conf.baseUrl+'/v1/fs/read?path=src/main.rs',{headers});
  const previous=await read.json();if(!previous.ok)throw Error(previous.error);
  const response=await fetch(conf.baseUrl+'/v1/fs/write',{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({path:'src/main.rs',content:value,expectedVersion:previous.version})});
  const result=await response.json();if(!result.ok)throw Error(result.error);
  g.saveConfirmed=true;
 }} onEditorReady={(editor,m)=>{g.editorReady=true;g.editor=editor;g.monaco=m;}} lsp={bridge}/></div></>;
}
createRoot(document.getElementById('root')!).render(<App/>);
