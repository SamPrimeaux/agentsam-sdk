import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type PointerEvent as ReactPointerEvent } from "react";
import { ArrowUpRight, ImageOff, MousePointer2 } from "lucide-react";
import { canvasBounds, locateNode, nodeAtWidth, safeStyle, safeUrl, type Artboard, type CanvasDocument, type CanvasNode } from "./model";

type Props = {
  document: CanvasDocument; selected: string; boardId: string; preview: boolean; width: number;
  zoom: number; onZoom: (zoom:number)=>void; onSelect:(id:string,boardId:string)=>void;
  onChange:(id:string,patch:Partial<CanvasNode>)=>void; fitToken:number; tool:"select"|"pan"|"comment"; onPlacePin?:(boardId:string,x:number,y:number)=>void; renderComponent?:(node:CanvasNode,board:Artboard)=>ReactNode;
};
export function CanvasStage({document,selected,boardId,preview,width,zoom,onZoom,onSelect,onChange,fitToken,tool,onPlacePin,renderComponent}:Props) {
  const viewport=useRef<HTMLDivElement>(null);
  const [pan,setPan]=useState({x:56,y:72});
  const [drag,setDrag]=useState<{id:string;x:number;y:number;startX:number;startY:number;mode:"move"|"resize"}|null>(null);
  const [position,setPosition]=useState<{x:number;y:number}|null>(null);
  const panGesture=useRef<{startX:number;startY:number;x:number;y:number}|null>(null);
  const [hidden,setHidden]=useState<Set<string>>(new Set());
  const [notice,setNotice]=useState("");
  const [activePage,setActivePage]=useState("");
  const previewValues=useRef<Record<string,string>>({});
  const boards=preview ? document.artboards.filter(b=>b.id===(activePage||boardId||document.artboards[0]?.id)) : document.artboards;
  const selectedNode=locateNode(document,selected);
  useEffect(()=>{
    setActivePage("");
    setHidden(new Set());
  },[preview,boardId]);
  useEffect(()=>{
    if(!viewport.current||!document.artboards.length)return;
    const bounds=canvasBounds(preview?boards:document.artboards), rect=viewport.current.getBoundingClientRect();
    const targetWidth=preview&&width?width:bounds.width;
    const z=Math.min(1,Math.max(.08,Math.min((rect.width-96)/targetWidth,(rect.height-120)/bounds.height)));
    onZoom(z);
    setPan({x:(rect.width-targetWidth*z)/2-bounds.x*z,y:60-bounds.y*z});
  // The explicit Fit command intentionally frames current boards.
  },[fitToken,preview,width]);
  function wheel(event:React.WheelEvent<HTMLDivElement>) {
    if(event.ctrlKey||event.metaKey) {
      event.preventDefault();
      const rect=event.currentTarget.getBoundingClientRect();
      const z=Math.min(3,Math.max(.08,zoom*Math.exp(-event.deltaY*.008)));
      const x=event.clientX-rect.left,y=event.clientY-rect.top;
      setPan(p=>({x:x-(x-p.x)*z/zoom,y:y-(y-p.y)*z/zoom}));
      onZoom(z);
    } else setPan(p=>({x:p.x-event.deltaX,y:p.y-event.deltaY}));
  }
  function placePin(event:ReactPointerEvent<HTMLElement>,board:Artboard) {
    const rect=event.currentTarget.closest(".cv-artboard")?.getBoundingClientRect();
    if(!rect||!onPlacePin)return;
    onPlacePin(board.id,Math.max(0,Math.min(board.width,Math.round((event.clientX-rect.left)/zoom))),Math.max(0,Math.min(board.height,Math.round((event.clientY-rect.top)/zoom))));
  }
  function startNode(event:ReactPointerEvent<HTMLDivElement>,node:CanvasNode,board:Artboard,mode:"move"|"resize"="move") {
    if(preview||tool==="pan"||event.button!==0)return;
    if(tool==="comment" && !node.componentId?.startsWith("review-pin:")) {
      event.stopPropagation();event.preventDefault();placePin(event,board);return;
    }
    if(node.componentId?.startsWith("review-pin:")) {
      event.stopPropagation();onSelect(node.id,board.id);return;
    }
    event.stopPropagation();event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    onSelect(node.id,board.id);
    setDrag({id:node.id,x:node.x,y:node.y,startX:event.clientX,startY:event.clientY,mode});
    setPosition(null);
  }
  function move(event:ReactPointerEvent) {
    if(panGesture.current) {
      const p=panGesture.current;
      setPan({x:p.x+event.clientX-p.startX,y:p.y+event.clientY-p.startY});
    }
    if(drag)setPosition({x:Math.round((event.clientX-drag.startX)/zoom),y:Math.round((event.clientY-drag.startY)/zoom)});
  }
  function end() {
    if(drag&&position&&(Math.abs(position.x)>0||Math.abs(position.y)>0)) {
      const original=locateNode(document,drag.id)?.node;
      if(original)onChange(drag.id,drag.mode==="move"?{x:drag.x+position.x,y:drag.y+position.y}:{width:Math.max(8,original.width+position.x),height:Math.max(8,original.height+position.y)});
    }
    setDrag(null);setPosition(null);panGesture.current=null;
  }
  async function action(node:CanvasNode) {
    if(!node.action)return;
    const {type,target}=node.action;
    if(type==="toggle") {
      if(!locateNode(document,target)) { setNotice("This interaction points to a missing element.");return; }
      setHidden(previous=>{const next=new Set(previous);next.has(target)?next.delete(target):next.add(target);return next;});
    } else if(type==="navigate") {
      const page=document.artboards.find(b=>b.id===target||b.route===target||"#"+b.id===target);
      if(page){setActivePage(page.id);setNotice("");return;}
      const href=safeUrl(target);
      if(href)window.open(href,"_blank","noopener,noreferrer");
      else setNotice("This link needs a valid destination.");
    } else if(type==="submit") {
      const binding=node.binding;
      const endpoint=typeof binding?.endpoint==="string"?binding.endpoint:target;
      if(!/^\/(?!\/)/.test(endpoint)){setNotice("This form needs an authorized relative API endpoint.");return;}
      const method=String(binding?.method||"POST").toUpperCase();
      if(!["GET","POST"].includes(method)){setNotice("This form method is not supported.");return;}
      setNotice("Submitting…");
      try {
        const response=await fetch(endpoint,{method,credentials:"same-origin",headers:{"Content-Type":"application/json"},...(method==="POST"?{body:JSON.stringify(previewValues.current)}:{})});
        if(!response.ok)throw new Error("The service returned "+response.status+".");
        setNotice("Submission received by the connected service.");
      } catch(error){setNotice(error instanceof Error?error.message:"The submission could not be sent.");}
    }
  }
  function renderNode(original:CanvasNode,board:Artboard):React.ReactNode {
    const node=nodeAtWidth(original,preview&&width?width:undefined);
    const moving=drag?.id===node.id&&position;
    const authored=safeStyle(node.style);
    const length=(value:unknown,fallback:string)=>typeof value==="number"?value+"px":String(value||fallback);
    // Canvas artwork is intentionally dynamic; CSS custom properties keep
    // authored values separate from application layout and design tokens.
    const style={
      "--cv-node-left":(node.x+(moving&&drag.mode==="move"?moving.x:0))+"px",
      "--cv-node-top":(node.y+(moving&&drag.mode==="move"?moving.y:0))+"px",
      "--cv-node-width":Math.max(8,node.width+(moving&&drag.mode==="resize"?moving.x:0))+"px",
      "--cv-node-height":Math.max(8,node.height+(moving&&drag.mode==="resize"?moving.y:0))+"px",
      "--cv-node-color":String(authored.color||"inherit"),
      "--cv-node-background":String(authored.backgroundColor||authored.background||"transparent"),
      "--cv-node-border-color":String(authored.borderColor||"transparent"),
      "--cv-node-border-width":length(authored.borderWidth,"0px"),
      "--cv-node-border-style":String(authored.borderStyle||"solid"),
      "--cv-node-border-radius":length(authored.borderRadius,"0px"),
      "--cv-node-font-family":String(authored.fontFamily||"inherit"),
      "--cv-node-font-size":length(authored.fontSize,"inherit"),
      "--cv-node-font-weight":String(authored.fontWeight||"inherit"),
      "--cv-node-font-style":String(authored.fontStyle||"inherit"),
      "--cv-node-letter-spacing":length(authored.letterSpacing,"normal"),
      "--cv-node-line-height":String(authored.lineHeight||"1.35"),
      "--cv-node-text-align":String(authored.textAlign||"start"),
      "--cv-node-text-transform":String(authored.textTransform||"none"),
      "--cv-node-text-decoration":String(authored.textDecoration||"none"),
      "--cv-node-opacity":String(authored.opacity??1),
      "--cv-node-padding":length(authored.padding,"0px"),
      "--cv-node-padding-top":length(authored.paddingTop,"var(--cv-node-padding)"),
      "--cv-node-padding-right":length(authored.paddingRight,"var(--cv-node-padding)"),
      "--cv-node-padding-bottom":length(authored.paddingBottom,"var(--cv-node-padding)"),
      "--cv-node-padding-left":length(authored.paddingLeft,"var(--cv-node-padding)"),
      "--cv-node-display":String(authored.display||"block"),
      "--cv-node-align-items":String(authored.alignItems||"stretch"),
      "--cv-node-justify-content":String(authored.justifyContent||"flex-start"),
      "--cv-node-gap":length(authored.gap,"0px"),
      "--cv-node-shadow":String(authored.boxShadow||"none"),
      "--cv-node-object-fit":String(authored.objectFit||"cover"),
      "--cv-node-overflow":String(authored.overflow||"visible"),
      "--cv-node-white-space":String(authored.whiteSpace||"normal"),
    } as CSSProperties;
    if(hidden.has(node.id))return null;
    const common={
      "data-canvas-node":node.id,
      "data-node-kind":node.type,
      className:"cv-node"+(!preview&&selected===node.id?" is-selected":""),
      style,
      onPointerDown:(event:ReactPointerEvent<HTMLDivElement>)=>startNode(event,node,board),
    };
    return <div key={node.id} {...common} role={node.type==="input"?"group":"button"} tabIndex={node.type==="input"?-1:0}
      aria-label={node.name}
      onKeyDown={event=>{if(event.target!==event.currentTarget)return;if(event.key==="Enter"||event.key===" "){event.preventDefault();if(preview)void action(node);else onSelect(node.id,board.id);}}}
      onClick={event=>{event.stopPropagation();if(preview)void action(node);else onSelect(node.id,board.id);}}>
      {renderComponent&&node.componentId?.startsWith("live-preview:") ? renderComponent(node,board) :
       node.type==="image" ? <CanvasImage src={safeUrl(node.src,true)} alt={node.text||node.name}/> :
       node.type==="input" ? <input className="cv-native-input" aria-label={node.name} placeholder={node.text} readOnly={!preview} onChange={e=>{previewValues.current[node.id]=e.target.value;}}/> :
       node.type==="button" ? <button type="button" className="cv-native-button" tabIndex={preview?0:-1}>{node.text||node.name}</button> :
       node.type==="link" ? <span className="cv-link">{node.text||node.name}</span> :
       node.text ? <span className="cv-text">{node.text}</span> : null}
      {node.children?.map(child=>renderNode(child,board))}
      {!preview&&selected===node.id&&<>
        <span className="cv-selection-label" style={{"--cv-label-font":11/zoom+"px","--cv-label-padding":3/zoom+"px","--cv-label-top":-25/zoom+"px"} as CSSProperties}>{node.name}</span>
        <div className="cv-resize-handle" role="button" tabIndex={0} aria-label="Resize selected element"
          style={{"--cv-handle-size":9/zoom+"px","--cv-handle-inset":-4/zoom+"px"} as CSSProperties}
          onKeyDown={event=>{const delta=event.shiftKey?10:1;if(event.key==="ArrowRight"||event.key==="ArrowDown"){event.preventDefault();onChange(node.id,{width:node.width+delta,height:node.height+delta});}else if(event.key==="ArrowLeft"||event.key==="ArrowUp"){event.preventDefault();onChange(node.id,{width:Math.max(8,node.width-delta),height:Math.max(8,node.height-delta)});}}}
          onPointerDown={event=>startNode(event,node,board,"resize")}/>
      </>}
    </div>;
  }
  return <div ref={viewport} className={"cv-viewport "+(preview?"is-preview ":"")+(tool==="pan"?"is-pan":"")}
    aria-label={preview?"Interactive Canvas preview":"Spatial Canvas"} onWheel={wheel}
    onPointerDown={event=>{
      if(event.target===event.currentTarget&&!preview)onSelect("",boardId);
      if(event.button===1||tool==="pan"||event.target===event.currentTarget) {
        event.currentTarget.setPointerCapture(event.pointerId);
        panGesture.current={startX:event.clientX,startY:event.clientY,...pan};
      }
    }} onPointerMove={move} onPointerUp={end} onPointerCancel={()=>{setDrag(null);setPosition(null);panGesture.current=null;}}>
    <div className="cv-world" style={{"--cv-world-transform":"translate("+pan.x+"px,"+pan.y+"px) scale("+zoom+")"} as CSSProperties}>
      {boards.map(board=><section key={board.id} className="cv-artboard" data-artboard={board.id}
        aria-label={board.name} style={{"--cv-board-left":board.x+"px","--cv-board-top":board.y+"px","--cv-board-width":(preview&&width?width:board.width)+"px","--cv-board-height":board.height+"px","--cv-board-background":board.background||"#fff"} as CSSProperties}
        onPointerDown={event=>{if(tool==="pan")return;event.stopPropagation();if(tool==="comment"&&event.button===0){placePin(event,board);return;}if(!preview)onSelect("",board.id);}}>
        <button type="button" className={"cv-artboard-name"+(board.id===boardId?" active":"")} style={{"--cv-board-label-font":12/zoom+"px","--cv-board-label-top":-30/zoom+"px"} as CSSProperties}
          onClick={event=>{event.stopPropagation();onSelect("",board.id);}}>{board.name}<span>{preview&&width?width:board.width} × {board.height}</span></button>
        {board.nodes.map(node=>renderNode(node,board))}
      </section>)}
    </div>
    {!document.artboards.length&&<div className="cv-stage-empty"><MousePointer2 size={22}/><span>Your ideas have room to grow.</span></div>}
    {notice&&<div className="cv-preview-notice" role="status">{notice}<button onClick={()=>setNotice("")} aria-label="Dismiss preview status">×</button></div>}
    {preview&&<div className="cv-preview-label"><ArrowUpRight size={12}/> Live interactions · saved document structure</div>}
    {!preview&&selectedNode&&<div className="cv-coordinate-hint">{Math.round(selectedNode.node.width)} × {Math.round(selectedNode.node.height)} · {selectedNode.node.type}</div>}
  </div>;
}
function CanvasImage({src,alt}:{src?:string;alt:string}) {
  const [failed,setFailed]=useState(false);
  useEffect(()=>setFailed(false),[src]);
  return src&&!failed?<img className="cv-node-image" src={src} alt={alt} draggable={false} onError={()=>setFailed(true)}/>:
    <span className="cv-missing-image"><ImageOff size={20}/><span>{src?"Image unavailable":"Choose an image"}</span></span>;
}
