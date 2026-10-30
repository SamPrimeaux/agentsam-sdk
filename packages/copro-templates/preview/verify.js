import {TRANSITIONS,createCoProTransitionRenderer} from '../../copro-render/src/transitions/index.js';
import {CREATIVE_TEMPLATES,renderCreativeSvg,renderAnimationSvg,renderOverlaySvg} from '../src/creative.js';
import {ANIMATIONS,OVERLAYS} from '../src/motion.js';
const $=id=>document.getElementById(id);
const hash=data=>{let h=2166136261;for(let i=0;i<data.length;i++)h=Math.imul(h^data[i],16777619);return (h>>>0).toString(16);};
function solid(color){const c=document.createElement('canvas');c.width=128;c.height=72;const x=c.getContext('2d');x.fillStyle=color;x.fillRect(0,0,128,72);return c;}
async function raster(svg){const img=new Image();img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);await img.decode();const c=document.createElement('canvas');c.width=240;c.height=135;const ctx=c.getContext('2d');ctx.drawImage(img,0,0,240,135);return hash(ctx.getImageData(0,0,240,135).data);}
$('run').addEventListener('click',async()=>{
 $('run').disabled=true;$('status').textContent='Running';const result={schema:'copro.browser-proof.v1',userAgent:navigator.userAgent,transitions:[],compositions:[],animations:[],overlays:[],failures:[],contextRecovery:'not-tested',iOSSafari:'not-tested'};
 let renderer;
 try{
  const c=$('gpu'),gl=c.getContext('webgl'),from=solid('#ff0000'),to=solid('#0000ff');renderer=createCoProTransitionRenderer(c);const pixels=new Uint8Array(128*72*4);
  const read=()=>{gl.readPixels(0,0,128,72,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return {hash:hash(pixels),rgba:Array.from(pixels.slice(0,4))};};
  for(const def of TRANSITIONS){try{
   renderer.compile(def.id);const samples=[];for(const timeUs of [0,250000,500000,750000,1000000]){renderer.render({transition:{type:def.id,durationUs:1000000},from,to,timeUs});samples.push(read());}
   if(samples[0].rgba[0]<250||samples[0].rgba[2]>5||samples[4].rgba[2]<250||samples[4].rgba[0]>5)throw new Error('endpoint_pixels_invalid');
   renderer.render({transition:{type:def.id,durationUs:1000000},from,to,timeUs:500000});if(read().hash!==samples[2].hash)throw new Error('nondeterministic_frame');
   if(samples.slice(1,4).every(x=>x.hash===samples[0].hash||x.hash===samples[4].hash))throw new Error('no_intermediate_pixels');
   result.transitions.push({id:def.id,samples:samples.map(x=>x.hash),passed:true});await new Promise(requestAnimationFrame);
  }catch(error){result.failures.push({id:def.id,error:error.message});}}
  const ext=gl.getExtension('WEBGL_lose_context');if(ext){
   const lost=new Promise(resolve=>c.addEventListener('webglcontextlost',resolve,{once:true}));ext.loseContext();await lost;
   try{renderer.compile('gl:Fade');result.failures.push({id:'context-lost',error:'failed_to_reject'});}catch(error){if(!error.message.includes('context_lost'))throw error;}
   const restored=new Promise(resolve=>c.addEventListener('webglcontextrestored',resolve,{once:true}));await new Promise(resolve=>setTimeout(resolve,150));ext.restoreContext();await Promise.race([restored,new Promise((_,reject)=>setTimeout(()=>reject(new Error('context_restore_timeout')),5000))]);renderer.render({transition:'fade',from,to,timeUs:100000});result.contextRecovery='passed';
  }
  for(const t of CREATIVE_TEMPLATES){const duration=t.metadata.creative.durationUs,samples=[];for(const time of [0,Math.floor(duration/2),duration-1])samples.push(await raster(renderCreativeSvg(t.id,time)));if(samples.every(x=>x===samples[0]))result.failures.push({id:t.id,error:'static_composition'});result.compositions.push({id:t.id,samples});}
  for(const a of ANIMATIONS){const svg=renderAnimationSvg(a.id,Math.floor(a.durationUs*.45));result.animations.push({id:a.id,hash:await raster(svg)});}
  for(const o of OVERLAYS)result.overlays.push({id:o.id,hash:await raster(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675"><rect width="1200" height="675" fill="#608878"/>${renderOverlaySvg(o.id,1200000)}</svg>`)});
 }catch(error){result.failures.push({id:'suite',error:error.message});}
 finally{renderer?.dispose();result.passed=result.failures.length===0;result.summary={transitions:result.transitions.length,compositions:result.compositions.length,animations:result.animations.length,overlays:result.overlays.length,failures:result.failures.length};$('results').textContent=JSON.stringify(result,null,2);$('status').textContent=result.passed?'All renderer checks passed':'Renderer checks failed';$('run').disabled=false;}
});
