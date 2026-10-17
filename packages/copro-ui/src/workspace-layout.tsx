import React, { useEffect, useRef, useState } from "react";

export type WorkspacePane = "source" | "inspector";
export type LayoutMode = "wide" | "compact" | "mobile";
export type WorkspaceLayout = {
  sourceWidth:number; inspectorWidth:number; timelineHeight:number;
  sourceOpen:boolean; inspectorOpen:boolean;
  swapped:boolean; floating:WorkspacePane|null; floatX:number; floatY:number;
  sourceTool:string; inspectorTool:string; activePane:WorkspacePane;
};
export const WORKSPACE_STORAGE_KEY = "copro.editor.layout.v1";
export const DEFAULT_WORKSPACE_LAYOUT:WorkspaceLayout = {
  sourceWidth:300, inspectorWidth:320, timelineHeight:270,
  sourceOpen:true, inspectorOpen:true, swapped:false, floating:null, floatX:150, floatY:90,
  sourceTool:"media", inspectorTool:"trim", activePane:"source",
};
export function bounded(value:number,min:number,max:number) {
  return Math.max(min,Math.min(max,Number.isFinite(value)?value:min));
}
export function layoutModeFromContainer(width:number):LayoutMode {
  return width>=1160?"wide":width>=700?"compact":"mobile";
}
export function normalizeWorkspaceLayout(value:unknown):WorkspaceLayout {
  const x=(value&&typeof value==="object"?value:{}) as Partial<WorkspaceLayout>;
  return {
    sourceWidth:bounded(Number(x.sourceWidth??300),220,500),
    inspectorWidth:bounded(Number(x.inspectorWidth??320),240,510),
    timelineHeight:bounded(Number(x.timelineHeight??270),150,550),
    sourceOpen:x.sourceOpen!==false, inspectorOpen:x.inspectorOpen!==false,
    swapped:x.swapped===true,
    floating:x.floating==="source"||x.floating==="inspector"?x.floating:null,
    floatX:bounded(Number(x.floatX??150),0,1000),
    floatY:bounded(Number(x.floatY??90),0,1000),
    sourceTool:["media","audio","text","captions","effects","transitions","templates"].includes(x.sourceTool??"media")?(x.sourceTool??"media"):"media",
    inspectorTool:["trim","speed","volume","text","captions","effects","transitions","export"].includes(x.inspectorTool??"trim")?(x.inspectorTool??"trim"):"trim",
    activePane:x.activePane==="inspector"?"inspector":"source",
  };
}
export function useCoProWorkspaceLayout() {
  const [layout,setLayout]=useState<WorkspaceLayout>(()=>{
    if(typeof window==="undefined")return {...DEFAULT_WORKSPACE_LAYOUT};
    try {
      const raw=window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
      return raw?normalizeWorkspaceLayout(JSON.parse(raw)):{...DEFAULT_WORKSPACE_LAYOUT};
    }catch{return {...DEFAULT_WORKSPACE_LAYOUT};}
  });
  useEffect(()=>{
    try{window.localStorage.setItem(WORKSPACE_STORAGE_KEY,JSON.stringify(layout));}catch{}
  },[layout]);
  return {
    layout,
    update:(patch:Partial<WorkspaceLayout>)=>setLayout(previous=>normalizeWorkspaceLayout({...previous,...patch})),
    reset:()=>setLayout({...DEFAULT_WORKSPACE_LAYOUT}),
  };
}
export function useWorkspaceContainer(ref:React.RefObject<HTMLElement|null>) {
  const [width,setWidth]=useState(0);
  useEffect(()=>{
    const node=ref.current;if(!node)return;
    const sync=()=>setWidth(node.getBoundingClientRect().width);
    sync();const observer=new ResizeObserver(sync);observer.observe(node);
    return ()=>observer.disconnect();
  },[ref]);
  return {width,mode:layoutModeFromContainer(width)};
}
export function CoProResizeHandle({label,orientation,value,min,max,onDelta,onReset,className=""}:{
  label:string;orientation:"vertical"|"horizontal";value:number;min:number;max:number;
  onDelta:(delta:number)=>void;onReset:()=>void;className?:string;
}) {
  const last=useRef<number|null>(null);
  const update=useRef(onDelta);update.current=onDelta;
  return <div role="separator" tabIndex={0} aria-label={label} aria-orientation={orientation}
    aria-valuemin={min} aria-valuemax={max} aria-valuenow={Math.round(value)}
    title={label+" — drag or use arrows, double-click to reset"}
    className={"copro-resize-handle copro-resize-"+orientation+" "+className}
    onDoubleClick={onReset}
    onPointerDown={event=>{
      if(event.button!==0)return;
      event.preventDefault();
      last.current=orientation==="vertical"?event.clientX:event.clientY;
      event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.dataset.dragging="true";
    }}
    onPointerMove={event=>{
      if(last.current===null)return;
      const current=orientation==="vertical"?event.clientX:event.clientY;
      const delta=current-last.current;last.current=current;
      if(delta)update.current(delta);
    }}
    onPointerUp={event=>{
      last.current=null;event.currentTarget.dataset.dragging="false";
      if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
    }}
    onPointerCancel={event=>{last.current=null;event.currentTarget.dataset.dragging="false";}}
    onKeyDown={event=>{
      const minus=orientation==="vertical"?"ArrowLeft":"ArrowUp";
      const plus=orientation==="vertical"?"ArrowRight":"ArrowDown";
      if(![minus,plus,"Home","End"].includes(event.key))return;
      event.preventDefault();
      update.current(event.key==="Home"?min-value:event.key==="End"?max-value:(event.key===minus?-1:1)*(event.shiftKey?40:12));
    }}
  ><span aria-hidden="true"/></div>;
}
