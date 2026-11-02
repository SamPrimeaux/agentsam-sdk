import React,{useEffect,useRef,useState} from "react";
import type {CoProCreativeAsset,CoProMotionSampler,CoProTransitionPreviewFactory} from "./creative-types.js";

/** Samples the shipped composition, animation or two-source GL renderer. No simulated transition. */
export function CoProAssetPreview({asset,playing,renderCreativePreview,sampleMotion,createTransitionPreview,before,after}:{
 asset:CoProCreativeAsset;playing:boolean;renderCreativePreview?:(id:string,timeUs:number)=>string|null;
 sampleMotion?:CoProMotionSampler;createTransitionPreview?:CoProTransitionPreviewFactory;before?:string;after?:string;
}){
 const canvasRef=useRef<HTMLCanvasElement>(null);
 const renderer=useRef<ReturnType<CoProTransitionPreviewFactory>|null>(null);
 const images=useRef<HTMLImageElement[]>([]);
 const [ready,setReady]=useState(false);
 const [timeUs,setTimeUs]=useState(0);
 const [error,setError]=useState(false);
 const duration=Math.max(100000,asset.durationUs??1200000);
 useEffect(()=>{
   setTimeUs(0);setError(false);
 },[asset.id]);
 useEffect(()=>{
   if(!playing)return;
   let frame=0,previous=performance.now();
   const tick=(now:number)=>{setTimeUs(value=>(value+Math.round((now-previous)*1000))%(duration+350000));previous=now;frame=requestAnimationFrame(tick);};
   frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);
 },[playing,duration,asset.id]);
 useEffect(()=>{
   if(asset.category!=="transition"||!createTransitionPreview||!canvasRef.current||!before||!after)return;
   let cancelled=false;setReady(false);
   const load=(url:string)=>new Promise<HTMLImageElement>((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=url;});
   Promise.all([load(before),load(after)]).then(values=>{
     if(cancelled)return;images.current=values;
     renderer.current=createTransitionPreview(canvasRef.current!);setReady(true);
   }).catch(()=>{if(!cancelled)setError(true);});
   return()=>{cancelled=true;renderer.current?.dispose();renderer.current=null;};
 },[asset.id,before,after,createTransitionPreview]);
 useEffect(()=>{
   if(!ready||!renderer.current)return;
   try{renderer.current.render({transition:{type:asset.id,durationUs:duration},from:images.current[0],to:images.current[1],timeUs:Math.min(timeUs,duration)});}
   catch{setError(true);}
 },[ready,timeUs,asset.id,duration]);
 const svg=asset.category==="template"?renderCreativePreview?.(asset.id,timeUs):null;
 const sample=asset.category==="animation"?sampleMotion?.(asset.id,timeUs,{durationUs:duration}):null;
 const style = {
   "--mm-motion-transform":sample?`translate(${sample.x}px,${sample.y}px) scale(${sample.scale}) rotate(${sample.rotation}deg) scaleX(${sample.scaleX})`:"none",
   "--mm-motion-opacity":sample?.opacity??1,
   "--mm-motion-filter":sample?`blur(${sample.blur}px)`:"none",
   "--mm-motion-clip":sample?`inset(0 ${sample.clipInset}% 0 0)`:"none",
 } as React.CSSProperties;
 return <span className="mm-live-asset-preview">
   {asset.category==="transition"?<><canvas ref={canvasRef} width={640} height={360} aria-label={asset.name+" transition preview"}/>{error&&<span role="status">Preview unavailable</span>}</>:
     <img src={svg?"data:image/svg+xml;charset=utf-8,"+encodeURIComponent(svg):before&&sample?before:asset.previewUrl} alt={asset.name+" animated preview"} style={style}/>}
   <input type="range" aria-label="Asset preview position" min={0} max={duration} step={1000} value={Math.min(timeUs,duration)} onChange={event=>setTimeUs(Number(event.currentTarget.value))}/>
 </span>;
}
