import React, {useId, useMemo, useRef, useState, type PointerEvent, type WheelEvent} from 'react';
import {applyDesignOperation} from '@inneranimalmedia/agentsam-cad-shared';
import type {DesignProject} from '@inneranimalmedia/agentsam-cad-shared';
import {buildNativeSketchOperations, importLegacySketch, type NativeSketchPoint, type NativeSketchStroke, type NativeSketchKind} from '../lib/native-sketch';

type Tool = 'ink' | 'line' | 'rect' | 'pan' | 'eraser';
type View = {x:number;y:number;w:number;h:number};

export function NativeSketchCanvas({project,onUpdateProject,canEdit}:{
 project:DesignProject;onUpdateProject:(next:DesignProject)=>void;canEdit:boolean;
}) {
 const patternId = useId().replace(/:/g,'');
 const svgRef = useRef<SVGSVGElement>(null);
 const gesture = useRef<{kind:Tool;start:NativeSketchPoint;points:NativeSketchPoint[];origin:View;pointer:number}|null>(null);
 const [view,setView] = useState<View>({x:0,y:0,w:900,h:650});
 const [tool,setTool] = useState<Tool>('ink');
 const [preview,setPreview] = useState<NativeSketchPoint[]>([]);
 const [status,setStatus] = useState('');
 const [legacyWarn,setLegacyWarn] = useState('');
 const strokes = project.sketchDocument?.nativeStrokes || [];
 const proposal = useMemo(() => buildNativeSketchOperations(strokes,project),[strokes,project]);
 const legacy = project.sketchDocument?.tldrawSnapshot;
 const write = (next:NativeSketchStroke[], note:string) => {
   onUpdateProject({...project,sketchDocument:{...project.sketchDocument,nativeStrokes:next,shapesCount:next.length,lastEditedAt:Date.now()}});
   setStatus(note);
 };
 const toPoint = (e:PointerEvent<SVGSVGElement> | WheelEvent<SVGSVGElement>):NativeSketchPoint => {
   const svg = svgRef.current;
   const ctm = svg?.getScreenCTM();
   if (!svg || !ctm) return [0,0];
   const p = new DOMPoint(e.clientX,e.clientY).matrixTransform(ctm.inverse());
   return [Math.round(p.x*10)/10,Math.round(p.y*10)/10];
 };
 const nearestStroke = (point:NativeSketchPoint) => {
   let match=-1, best=18;
   strokes.forEach((stroke,i) => {
     for (let j=1;j<stroke.points.length;j++) {
       const a=stroke.points[j-1],b=stroke.points[j];
       const dx=b[0]-a[0],dy=b[1]-a[1],l2=dx*dx+dy*dy;
       const t=l2 ? Math.max(0,Math.min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dy)/l2)):0;
       const dist=Math.hypot(point[0]-a[0]-t*dx,point[1]-a[1]-t*dy);
       if(dist<best){best=dist;match=i;}
     }
   });
   return match;
 };
 const down = (e:PointerEvent<SVGSVGElement>) => {
   if(e.button !== 0 && e.button !== 1) return;
   if(!canEdit && tool !== 'pan') return;
   const point=toPoint(e);
   if(tool==='eraser'){
     const index=nearestStroke(point);
     if(index>=0)write(strokes.filter((_,i)=>i!==index),'Sketch element removed');
     else setStatus('No sketch stroke at this location');
     return;
   }
   const kind=e.button===1?'pan':tool;
   gesture.current={kind,start:point,points:[point],origin:view,pointer:e.pointerId};
   e.currentTarget.setPointerCapture(e.pointerId);
   setPreview([point]);
 };
 const move = (e:PointerEvent<SVGSVGElement>) => {
   const g=gesture.current;
   if(!g||g.pointer!==e.pointerId)return;
   const point=toPoint(e);
   if(g.kind==='pan'){
     setView(v=>({...v,x:v.x+g.start[0]-point[0],y:v.y+g.start[1]-point[1]}));
     return;
   }
   if(g.kind==='ink'){
     const last=g.points[g.points.length-1];
     if(Math.hypot(last[0]-point[0],last[1]-point[1])>=2)g.points.push(point);
   }else g.points=[g.start,point];
   setPreview([...g.points]);
 };
 const up = (e:PointerEvent<SVGSVGElement>) => {
   const g=gesture.current;
   if(!g||g.pointer!==e.pointerId)return;
   gesture.current=null;
   if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
   setPreview([]);
   if(g.kind==='pan'||g.points.length<2)return;
   if(Math.hypot(g.points[0][0]-g.points[g.points.length-1][0],g.points[0][1]-g.points[g.points.length-1][1])<4){
     setStatus('Draw at least four inches');return;
   }
   const stroke:NativeSketchStroke={id:'sk-'+crypto.randomUUID(),kind:g.kind as NativeSketchKind,points:g.points};
   write([...strokes,stroke],g.kind==='rect'?'Space outline drawn':'Sketch stroke drawn');
 };
 const zoom = (e:WheelEvent<SVGSVGElement>) => {
   e.preventDefault();
   const p=toPoint(e), factor=e.deltaY<0?0.88:1.12;
   setView(v=>{
     const w=Math.min(3600,Math.max(120,v.w*factor)),h=v.h*(w/v.w);
     const r=w/v.w;
     return {x:p[0]-(p[0]-v.x)*r,y:p[1]-(p[1]-v.y)*r,w,h};
   });
 };
 const convert = () => {
   if(!canEdit || proposal.operations.length===0)return;
   let next=project;
   for(const operation of proposal.operations){
     const result=applyDesignOperation(next,operation);
     if(!result.success){setStatus('Conversion rejected: '+(result.error||'Invalid design operation'));return;}
     next=result.project;
   }
   onUpdateProject(next);
   setStatus('Committed '+proposal.preview.walls.length+' walls and '+proposal.preview.rooms.length+' spaces to editable CAD geometry');
 };
 const importArchive = () => {
   const result=importLegacySketch(legacy);
   if(!result.strokes.length){
     setLegacyWarn('No supported rectangles or straight lines were found. Archived drawing is retained; no geometry was guessed.');return;
   }
   const existingIds=new Set(strokes.map(s=>s.id));
   write([...strokes,...result.strokes.filter(s=>!existingIds.has(s.id))],'Imported '+result.strokes.length+' supported legacy sketch elements');
   if(result.unsupported)setLegacyWarn(result.unsupported+' unsupported legacy shapes remain in the preserved snapshot.');
 };
 const format=(n:number)=>Math.round(n/12*10)/10+' ft';
 const renderShape=(s:NativeSketchStroke, color:string, key:string) => {
   const points=s.points;
   if(s.kind==='rect'){
     const a=points[0],b=points[points.length-1];
     return <rect key={key} x={Math.min(a[0],b[0])} y={Math.min(a[1],b[1])}
       width={Math.abs(b[0]-a[0])} height={Math.abs(b[1]-a[1])}
       fill="rgba(91,165,234,.09)" stroke={color} strokeWidth={2.5} vectorEffect="non-scaling-stroke"/>;
   }
   return <polyline key={key} points={points.map(p=>p.join(',')).join(' ')}
     fill="none" stroke={color} strokeWidth={s.kind==='ink'?3:2.5}
     strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>;
 };
 return <div className="flex h-full w-full min-w-0 flex-col overflow-hidden bg-[#0b111c] text-slate-100" data-samsketch-native="true">
   <header className="flex min-h-12 flex-wrap items-center gap-2 border-b border-white/10 bg-[#151c29] px-3 py-2">
     <img src={import.meta.env.BASE_URL + 'samsketch-icon.png'} width={26} height={26} alt="" className="rounded-md" />
     <strong className="mr-2 text-xs">SamSketch</strong>
     <div className="flex flex-wrap gap-1" role="toolbar" aria-label="SamSketch drawing tools">
       {([['ink','Freehand'],['line','Line'],['rect','Space'],['pan','Pan'],['eraser','Erase']] as const).map(([value,label])=>
         <button key={value} type="button" disabled={!canEdit&&value!=='pan'} aria-pressed={tool===value}
           className={'rounded-md px-2 py-1.5 text-xs '+(tool===value?'bg-sky-600 text-white':'bg-white/5 text-slate-300 hover:bg-white/10')}
           onClick={()=>setTool(value)}>{label}</button>)}
     </div>
     <button type="button" disabled={!canEdit||!strokes.length} onClick={()=>write(strokes.slice(0,-1),'Undid last sketch stroke')}
       className="rounded-md border border-white/15 px-2 py-1.5 text-xs disabled:opacity-40">Undo stroke</button>
     <button type="button" disabled={!canEdit||!proposal.operations.length} onClick={convert}
       className="ml-auto rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">
       Commit geometry ({proposal.preview.walls.length} walls, {proposal.preview.rooms.length} spaces)
     </button>
   </header>
   {(legacy&&!strokes.length)&&<div className="flex items-center gap-3 border-b border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs">
     <span>Archived sketch found</span><button onClick={importArchive} className="rounded bg-amber-400/20 px-2 py-1">Import compatible elements</button>
     <span className="text-amber-200">Original source preserved</span>
   </div>}
   <div className="min-h-0 flex-1 relative overflow-hidden">
     <svg ref={svgRef} viewBox={view.x+' '+view.y+' '+view.w+' '+view.h}
       preserveAspectRatio="xMidYMid meet" className="h-full w-full touch-none"
       style={{cursor:tool==='pan'?'grab':tool==='eraser'?'crosshair':'crosshair'}}
       role="img" aria-label="SamSketch native freehand and dimensioned space drafting"
       onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={()=>{gesture.current=null;setPreview([])}}
       onWheel={zoom} onContextMenu={e=>e.preventDefault()}>
       <defs><pattern id={patternId} width={project.gridSize||12} height={project.gridSize||12} patternUnits="userSpaceOnUse">
         <path d={'M '+(project.gridSize||12)+' 0 L 0 0 0 '+(project.gridSize||12)} fill="none" stroke="#25415c" strokeWidth="0.35"/></pattern></defs>
       <rect x={view.x} y={view.y} width={view.w} height={view.h} fill={'url(#'+patternId+')'} />
       {project.rooms.map(room=><polygon key={room.id} points={room.points.map(p=>p.join(',')).join(' ')}
         fill="#315a6e" fillOpacity={0.15} stroke="#416f8b" strokeOpacity={0.5} strokeWidth={1}/>)}
       {project.walls.map(w=><line key={w.id} x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2}
         stroke="#8fa7bd" strokeWidth={Math.max(2,w.thickness)} strokeLinecap="square" opacity={0.65}/>)}
       {strokes.map(s=>renderShape(s,'#62c8f9',s.id))}
       {proposal.preview.walls.map(w=><line key={'proposed-'+w.id} x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2}
         stroke="#45cb91" strokeWidth={1} strokeDasharray="8 5" opacity="0.75"/>)}
       {preview.length>1&&renderShape({id:'preview',kind:tool==='pan'?'line':tool as NativeSketchKind,points:preview},'#fbbf24','preview')}
     </svg>
     <div className="pointer-events-none absolute bottom-3 left-3 rounded bg-[#111b2b]/90 px-3 py-2 text-[11px] text-slate-300">
       World units: inches · grid {format(project.gridSize||12)} · wheel to zoom · Pan tool to move
     </div>
   </div>
   <footer className="flex min-h-9 flex-wrap items-center gap-x-4 gap-y-1 border-t border-white/10 bg-[#151c29] px-3 py-2 text-[11px]">
     <span>{strokes.length} sketch strokes</span><span>{proposal.preview.walls.length} pending walls</span>
     <span>{proposal.preview.rooms.length} pending spaces</span>
     {proposal.skipped>0&&<span>{proposal.skipped} duplicate or short segments skipped</span>}
     {proposal.warnings.length>0&&<span className="text-amber-300" role="status">{proposal.warnings[0]}</span>}
     {legacyWarn&&<span className="text-amber-300" role="status">{legacyWarn}</span>}
     {status&&<span className="text-sky-300" role="status">{status}</span>}
   </footer>
 </div>;
}
