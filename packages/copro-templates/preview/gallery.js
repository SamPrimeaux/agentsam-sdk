import {CREATIVE_TEMPLATES, createCreativeProject, renderCreativeSvg, renderAnimationSvg, renderOverlaySvg, renderTypewriterSvg} from '../src/creative.js';
import {ANIMATIONS,OVERLAYS,TREATMENTS,sampleCounter} from '../src/motion.js';
import {TRANSITIONS,createCoProTransitionRenderer,normalizeTransition} from '../../copro-render/src/transitions/index.js';
const $=id=>document.getElementById(id),dialog=$('inspector'),stage=$('stage');
const assets=[...CREATIVE_TEMPLATES.map(t=>({id:t.id,name:t.name,category:'Templates',durationUs:t.metadata.creative.durationUs,source:t.metadata.creative.provenance})),...ANIMATIONS.map(a=>({...a,category:'Motion',source:a.provenance})),...TRANSITIONS.map(t=>({...t,category:'Transitions',durationUs:2000000,source:t.provenance.repository})),...OVERLAYS.map(o=>({...o,category:'Overlays',durationUs:4000000,source:o.provenance})),...TREATMENTS.map(t=>({...t,name:t.id,category:'Treatments',durationUs:4000000,source:'original'})),{id:'typewriter',name:'Typewriter sequence',category:'Graphics',durationUs:4000000,source:'av/remotion-bits'},{id:'counter',name:'Keyframe counter',category:'Graphics',durationUs:4000000,source:'av/remotion-bits'}];
let category='All',active=null,playing=false,timeUs=0,lastClock=0,raf=0,transitionRenderer=null,canvas=null,sourceA=null,sourceB=null,transitionParams={};
const reduced=matchMedia('(prefers-reduced-motion:reduce)').matches;
function params(){return {title:$('title').value,subtitle:$('subtitle').value,author:$('author').value,items:$('items').value.split('\n').filter(Boolean),values:$('values').value.split(',').filter(x=>x.trim()).map(Number),...(active?.id==='creative:kinetic-stack'?{words:$('title').value.split(/\s+/).filter(Boolean)}:{}),accent:$('accent').value,treatment:$('treatment').value};}
function canvasShape(){return $('shape').value==='portrait'?{width:1080,height:1920,frameRate:30}:$('shape').value==='square'?{width:1080,height:1080,frameRate:30}:{width:1920,height:1080,frameRate:30};}
function synthetic(color,text){const c=document.createElement('canvas');c.width=640;c.height=360;const x=c.getContext('2d');x.fillStyle=color;x.fillRect(0,0,640,360);x.fillStyle='#ecf3d8';x.font='bold 100px Arial';x.fillText(text,70,230);x.strokeStyle='#ecf3d8';x.lineWidth=2;x.strokeRect(25,25,590,310);return c;}
function svgFor(asset,t,p){
 switch(asset.category){
 case 'Templates':return renderCreativeSvg(asset.id,t,p,{canvas:canvasShape()});
 case 'Motion':return renderAnimationSvg(asset.id,t,{...p,durationUs:asset.durationUs});
 case 'Overlays':return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675"><rect width="1200" height="675" fill="#295246"/><circle cx="600" cy="337" r="180" fill="${p.accent}"/>${renderOverlaySvg(asset.id,t,{accent:p.accent})}</svg>`;
 case 'Treatments':return renderCreativeSvg('documentary-opener',t,{...p,treatment:asset.id});
 case 'Graphics':if(asset.id==='typewriter')return renderTypewriterSvg(p.title,t,{accent:p.accent});return renderCreativeSvg('end-card',1500000,{...p,title:sampleCounter([0,180,1000],t,{durationUs:4000000}).text});
 default:return null;
 }
}
function svgUrl(svg){return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);}
function draw(){if(!active)return;try{
 if(active.category==='Transitions'){transitionRenderer.render({transition:{type:active.id,durationUs:active.durationUs,parameters:transitionParams},from:sourceA,to:sourceB,timeUs});}
 else stage.innerHTML=svgFor(active,timeUs,params());
 $('scrub').value=String(timeUs);$('time').value=(timeUs/1e6).toFixed(2)+' s';$('preview-status').textContent=active.category==='Transitions'?'WebGL transition · two procedural source frames':'Sampled directly from the reusable source package';
 }catch(error){stop();$('preview-status').textContent=error.message;}}
function stop(){playing=false;cancelAnimationFrame(raf);$('play').textContent='Play';$('play').setAttribute('aria-label','Play preview');}
function tick(clock){if(!playing)return;timeUs=Math.min(active.durationUs,Math.round(timeUs+(clock-lastClock)*1000));lastClock=clock;draw();if(timeUs>=active.durationUs){stop();return;}raf=requestAnimationFrame(tick);}
function toggle(){if(playing){stop();return;}if(timeUs>=active.durationUs)timeUs=0;playing=true;lastClock=performance.now();$('play').textContent='Pause';$('play').setAttribute('aria-label','Pause preview');raf=requestAnimationFrame(tick);}
function open(asset){
 stop();transitionRenderer?.dispose();transitionRenderer=null;active=asset;timeUs=Math.round(asset.durationUs*.45);transitionParams={};
 $('asset-name').textContent=asset.name;$('asset-category').textContent=asset.category;$('source').textContent='Source: '+asset.source;
 $('title').value=asset.id==='creative:kinetic-stack'?'BUILD WHAT MATTERS NEXT':asset.category==='Templates'?'Make room for possibility.':'MAKE IT MOVE';$('shape').value=['creative:social-story','creative:caption-story','creative:quote-story','creative:photo-montage','creative:end-card'].includes(asset.id)?'portrait':'landscape';$('subtitle').value='A story worth bringing to life.';$('treatment').value='clean';
 $('scrub').max=String(asset.durationUs);$('shader-parameters').replaceChildren();$('download-frame').disabled=asset.category==='Transitions';
 if(asset.category==='Transitions'){
  canvas=document.createElement('canvas');canvas.width=960;canvas.height=540;canvas.setAttribute('aria-label','Shader transition preview');stage.replaceChildren(canvas);
  try{transitionRenderer=createCoProTransitionRenderer(canvas);sourceA=synthetic('#193c32','01');sourceB=synthetic('#735346','02');const normalized=normalizeTransition({type:asset.id,durationUs:asset.durationUs});transitionParams=normalized.parameters;
   for(const [key,spec] of Object.entries(asset.parameters)){
    const label=document.createElement('label');label.textContent=key;const input=document.createElement('input');input.dataset.parameter=key;
    if(spec.type==='bool'){input.type='checkbox';input.checked=transitionParams[key];}else{input.type='text';input.value=JSON.stringify(transitionParams[key]);}
    input.addEventListener('change',()=>{try{const next={...transitionParams,[key]:spec.type==='bool'?input.checked:JSON.parse(input.value)};normalizeTransition({type:asset.id,durationUs:asset.durationUs,parameters:next});transitionParams=next;draw();}catch(error){$('preview-status').textContent=error.message;}});label.append(input);$('shader-parameters').append(label);
   }
  }catch(error){$('preview-status').textContent=error.message;}
 }
 dialog.showModal();draw();
 if(!reduced&&asset.category!=='Transitions'){timeUs=0;toggle();}
}
function download(filename,contents,type){const url=URL.createObjectURL(new Blob([contents],{type})),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('download-project').addEventListener('click',()=>{
 let data;
 if(active.category==='Templates')data=createCreativeProject(active.id,{projectId:'project:'+crypto.randomUUID(),slotValues:params(),canvas:canvasShape()});
 else if(active.category==='Transitions')data={schema:'copro.transition-preset.v1',transitionOut:normalizeTransition({type:active.id,durationUs:active.durationUs,parameters:transitionParams})};
 else data={schema:'copro.creative-preset.v1',id:active.id,category:active.category,durationUs:active.durationUs,parameters:params()};
 download(active.id.replaceAll(':','-')+'.json',JSON.stringify(data,null,2),'application/json');
});
$('download-frame').addEventListener('click',()=>{const svg=svgFor(active,timeUs,params());if(svg)download(active.id.replaceAll(':','-')+'.svg',svg,'image/svg+xml');});
$('close').addEventListener('click',()=>dialog.close());dialog.addEventListener('close',()=>{stop();transitionRenderer?.dispose();transitionRenderer=null;active=null;stage.replaceChildren();});
$('play').addEventListener('click',toggle);$('scrub').addEventListener('input',()=>{stop();timeUs=Number($('scrub').value);draw();});
for(const id of ['title','subtitle','author','items','values','shape','accent','treatment'])$(id).addEventListener('input',draw);
function refresh(){const query=$('search').value.trim().toLowerCase(),visible=assets.filter(a=>(category==='All'||a.category===category)&&`${a.name} ${a.source}`.toLowerCase().includes(query));$('grid').replaceChildren();$('empty').hidden=visible.length>0;$('result-count').textContent=visible.length+' assets';
 for(const asset of visible){const card=document.createElement('button');card.className='card';card.setAttribute('aria-label','Preview '+asset.name);const thumb=document.createElement('div');thumb.className='thumb';const img=document.createElement('img');img.loading='lazy';img.alt='';img.src='./thumbnails/'+asset.id.replaceAll(':','-')+'.svg';thumb.append(img);const badge=document.createElement('span');badge.className='type';badge.textContent=asset.category.toUpperCase();thumb.append(badge);const info=document.createElement('div');info.className='card-info';const strong=document.createElement('strong');strong.textContent=asset.name;const meta=document.createElement('span');meta.textContent=(asset.durationUs/1e6).toFixed(1)+'s  ↗';info.append(strong,meta);card.append(thumb,info);card.addEventListener('click',()=>open(asset));$('grid').append(card);}
}
for(const name of ['All','Templates','Motion','Transitions','Overlays','Treatments','Graphics']){const b=document.createElement('button');b.textContent=name;b.setAttribute('aria-pressed',String(name==='All'));b.addEventListener('click',()=>{category=name;for(const other of $('filters').children)other.setAttribute('aria-pressed',String(other===b));refresh();});$('filters').append(b);}
$('search').addEventListener('input',refresh);$('counts').textContent=`${CREATIVE_TEMPLATES.length} compositions / ${TRANSITIONS.length} transitions / ${ANIMATIONS.length} motions`;refresh();
