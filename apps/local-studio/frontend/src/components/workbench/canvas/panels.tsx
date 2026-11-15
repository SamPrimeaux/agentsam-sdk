import { IconAction } from "@/components/ui/icon-action";
import { useEffect, useState, type CSSProperties } from "react";
import { ChevronDown, ChevronRight, Component, Frame, Image, Layers, MousePointer2, Plus, Type } from "lucide-react";
import { copy, locateNode, safeUrl, type Artboard, type CanvasDocument, type CanvasNode } from "./model";

export function CanvasLayers({document,selected,boardId,onSelect,onAdd,onComponent}:{document:CanvasDocument;selected:string;boardId:string;onSelect:(id:string,board:string)=>void;onAdd:()=>void;onComponent:(id:string)=>void}) {
 const [collapsed,setCollapsed]=useState<Set<string>>(new Set());
 const toggle=(id:string)=>setCollapsed(prev=>{const next=new Set(prev);next.has(id)?next.delete(id):next.add(id);return next;});
 const nodes=(items:CanvasNode[],board:string,depth=0):React.ReactNode=>items.map(node=><div key={node.id}>
   <div className={"cv-layer-row"+(node.id===selected?" selected":"")} style={{"--cv-layer-indent":(8+depth*12)+"px"} as CSSProperties}>
     {node.children?.length?<button aria-label={(collapsed.has(node.id)?"Expand ":"Collapse ")+node.name} onClick={()=>toggle(node.id)}>{collapsed.has(node.id)?<ChevronRight size={12}/>:<ChevronDown size={12}/>}</button>:<span className="cv-layer-spacer"/>}
     <button className="cv-layer-select" aria-pressed={node.id===selected} onClick={()=>onSelect(node.id,board)}>{node.componentId?<Component size={12}/>:node.type==="text"?<Type size={12}/>:node.type==="image"?<Image size={12}/>:<Frame size={12}/>}<span>{node.name}</span></button>
   </div>
   {!collapsed.has(node.id)&&node.children&&nodes(node.children,board,depth+1)}
 </div>);
 return <div className="cv-panel-content"><header className="cv-panel-heading"><strong>Layers</strong><IconAction onClick={onAdd} hint="Add artboard" label="Add artboard"><Plus size={14}/></IconAction></header>
  {document.artboards.map(board=><section key={board.id} className="cv-layer-board">
    <button className={"cv-layer-board-title"+(board.id===boardId?" active":"")} onClick={()=>onSelect("",board.id)}><Frame size={13}/><span>{board.name}</span></button>
    {nodes(board.nodes,board.id)}
    {!board.nodes.length&&<p className="cv-panel-help">Empty artboard</p>}
  </section>)}
  {!document.artboards.length&&<p className="cv-panel-help">Your pages and elements will appear here as they are created.</p>}
  <header className="cv-panel-heading cv-section-gap"><strong>Components</strong><Component size={13}/></header>
  {document.components.length?document.components.map(component=><button key={component.id} className="cv-library-item" disabled={!component.node||!boardId} onClick={()=>onComponent(component.id)}><Component size={13}/><span>{component.name}</span><Plus size={12}/></button>):<p className="cv-panel-help">Save an element as a component to reuse it across artboards.</p>}
 </div>;
}
function Field({label,value,onChange,type="text"}:{label:string;value:string|number;onChange:(value:string)=>void;type?:string}) {
 const [draft,setDraft]=useState(String(value));
 useEffect(()=>setDraft(String(value)),[value]);
 return <label className="cv-field"><span>{label}</span><input type={type} value={draft} onChange={e=>setDraft(e.target.value)} onBlur={()=>{if(draft!==String(value))onChange(draft);}} onKeyDown={e=>{if(e.key==="Enter"){e.currentTarget.blur();}if(e.key==="Escape"){setDraft(String(value));e.currentTarget.blur();}}}/></label>;
}
export function CanvasInspector({document,selected,boardId,onNode,onBoard,onDocument,onRemove,onDuplicate,onComponent}:{document:CanvasDocument;selected:string;boardId:string;onNode:(patch:Partial<CanvasNode>)=>void;onBoard:(patch:Partial<Artboard>)=>void;onDocument:(next:CanvasDocument)=>void;onRemove:()=>void;onDuplicate:()=>void;onComponent:()=>void}) {
 const found=locateNode(document,selected), node=found?.node;
 const board=document.artboards.find(b=>b.id===boardId);
 const number=(key:keyof CanvasNode,value:string)=>{const v=Number(value);if(Number.isFinite(v))onNode({[key]:["width","height"].includes(key)?Math.max(8,v):v});};
 const style=(key:string,value:string)=>onNode({style:{...node?.style,[key]:["fontSize","borderRadius","borderWidth","opacity"].includes(key)?Number(value)||0:value}});
 return <div className="cv-panel-content">
  <header className="cv-panel-heading"><strong>{node?"Properties":board?"Artboard":"Document"}</strong>{node?<MousePointer2 size={13}/>:<Layers size={13}/>}</header>
  {node?<><Field label="Name" value={node.name} onChange={name=>onNode({name})}/>
   <div className="cv-field-grid">{(["x","y","width","height"] as const).map(key=><Field key={key} label={{x:"X",y:"Y",width:"W",height:"H"}[key]} type="number" value={node[key]} onChange={v=>number(key,v)}/>)}</div>
   <div className="cv-alignment" aria-label="Align within parent">
    <button onClick={()=>onNode({x:0})} title="Align left">Left</button><button onClick={()=>onNode({x:Math.round(((found?.parent?.width||board?.width||0)-node.width)/2)})}>Center</button><button onClick={()=>onNode({x:(found?.parent?.width||board?.width||0)-node.width})}>Right</button>
   </div>
   {node.type==="html"&&<>
     <label className="cv-field cv-text-field"><span>Editable HTML source</span><textarea rows={14} spellCheck={false} value={node.sourceHtml||''} onChange={event=>onNode({sourceHtml:event.target.value})}/></label>
     <p className="cv-panel-help">Sandboxed preview. HTML is saved in this Canvas and cannot be published through the CMS converter until explicitly mapped to supported components.</p>
     <button type="button" className="cv-toolbar-button" onClick={()=>{const content=node.sourceHtml||'';if(!content)return;const blob=new Blob([content],{type:'text/html'}),url=URL.createObjectURL(blob),link=window.document.createElement('a');link.href=url;link.download=(node.name||'artboard').replace(/[^a-z0-9_-]+/gi,'-')+'.html';link.click();URL.revokeObjectURL(url);}}>Export HTML</button>
   </>}
   {node.type!=="image"&&node.type!=="html"&&<label className="cv-field cv-text-field"><span>Content</span><textarea value={node.text||""} rows={3} onChange={e=>onNode({text:e.target.value})}/></label>}
   {node.type==="image"&&<><Field label="Image URL" value={node.src||""} onChange={src=>{if(!src||safeUrl(src,true))onNode({src});}}/><p className="cv-panel-help">Use an image from your asset library or an authorized image URL.</p></>}
   <header className="cv-panel-heading cv-section-gap"><strong>Appearance</strong></header>
   <Field label="Fill" value={String(node.style?.backgroundColor||node.style?.background||"")} onChange={v=>style("backgroundColor",v)}/>
   <Field label="Text" value={String(node.style?.color||"#17191d")} onChange={v=>style("color",v)}/>
   <div className="cv-field-grid"><Field label="Size" type="number" value={String(node.style?.fontSize||16)} onChange={v=>style("fontSize",v)}/><Field label="Radius" type="number" value={String(node.style?.borderRadius||0)} onChange={v=>style("borderRadius",v)}/></div>
   <Field label="Font" value={String(node.style?.fontFamily||"inherit")} onChange={v=>style("fontFamily",v)}/>
   <label className="cv-field"><span>Weight</span><select value={String(node.style?.fontWeight||400)} onChange={e=>style("fontWeight",e.target.value)}>{[300,400,500,600,700,800].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
   <header className="cv-panel-heading cv-section-gap"><strong>Interaction</strong></header>
   <label className="cv-field"><span>Action</span><select value={node.action?.type||""} onChange={e=>onNode({action:e.target.value?{type:e.target.value as "navigate"|"toggle"|"submit",target:node.action?.target||""}:undefined})}><option value="">None</option><option value="navigate">Navigate</option><option value="toggle">Toggle element</option><option value="submit">Submit to service</option></select></label>
   {node.action&&<Field label="Target" value={node.action.target} onChange={target=>onNode({action:{...node.action!,target}})}/>}
   {node.binding&&<details className="cv-details"><summary>Data binding</summary><pre>{JSON.stringify(node.binding,null,2)}</pre></details>}
   <header className="cv-panel-heading cv-section-gap"><strong>Responsive</strong></header>
   <p className="cv-panel-help">Overrides preserve the desktop design. Preview each width to inspect them.</p>
   {[390,768].map(width=><details key={width} className="cv-details"><summary>{width===390?"Phone":"Tablet"} · {width}px</summary>
     {(["x","y","width","height"] as const).map(key=><Field key={key} label={key} type="number" value={node.responsive?.[String(width)]?.[key]??node[key]} onChange={value=>{const n=Number(value);if(Number.isFinite(n))onNode({responsive:{...node.responsive,[width]:{...node.responsive?.[String(width)],[key]:n}}});}}/>)}
   </details>)}
   <div className="cv-panel-actions"><button onClick={onComponent}><Component size={12}/> Make component</button><button onClick={onDuplicate}>Duplicate</button><button onClick={onRemove} className="cv-danger">Delete element</button></div>
  </>:board?<><Field label="Name" value={board.name} onChange={name=>onBoard({name})}/><Field label="Route" value={board.route||""} onChange={route=>onBoard({route})}/>
    <div className="cv-field-grid">{(["width","height","x","y"] as const).map(key=><Field key={key} label={key} type="number" value={board[key]} onChange={v=>{const n=Number(v);if(Number.isFinite(n))onBoard({[key]:["width","height"].includes(key)?Math.max(100,n):n});}}/>)}</div>
    <Field label="Background" value={board.background} onChange={background=>onBoard({background})}/>
    <p className="cv-panel-help">Select an element on the canvas or in Layers to edit it precisely.</p>
  </>:<><Field label="Name" value={document.name} onChange={name=>onDocument({...document,name})}/><p className="cv-panel-help">Choose a creative direction, or add your first artboard.</p></>}
  <header className="cv-panel-heading cv-section-gap"><strong>Design tokens</strong></header>
  {Object.entries(document.tokens).map(([key,value])=>typeof value==="string"||typeof value==="number"?<Field key={key} label={key} value={value} onChange={v=>onDocument({...document,tokens:{...document.tokens,[key]:v}})}/>:<details key={key} className="cv-details"><summary>{key}</summary><pre>{JSON.stringify(value,null,2)}</pre></details>)}
  {!Object.keys(document.tokens).length&&<p className="cv-panel-help">The creative system will appear here.</p>}
  {!!document.dataRequirements.length&&<details className="cv-details"><summary>Service requirements ({document.dataRequirements.length})</summary><pre>{JSON.stringify(document.dataRequirements,null,2)}</pre></details>}
 </div>;
}
