import {defineCoProTemplate, instantiateTemplate} from './index.js';
import {integerUs, clamp, cubicOut, frameToUs, sampleAnimation, createTypewriterEvents, sampleTypewriter, TREATMENTS, OVERLAYS} from './motion.js';

// CoPro's project and clip metadata remain the authority. This is a frame sampler,
// not a second timeline, media engine or application renderer.
const rows = [
 ['kinetic-stack','Kinetic word stack','typography',4000000,'RenderComp/free-remotion-templates'],
 ['chapter-divider','Chapter divider','documentary',5000000,'RenderComp/free-remotion-templates'],
 ['product-launch','Product launch','product',6000000,'zz41354899/SwiftClip'],
 ['quote-story','Quote story','social',8000000,'zz41354899/SwiftClip'],
 ['floating-cards','Floating feature cards','product',5000000,'reactvideoeditor/clippkit'],
 ['flip-showcase','Flip showcase','product',5000000,'reactvideoeditor/clippkit'],
 ['documentary-opener','Documentary opener','documentary',7000000,'original'],
 ['social-story','Social story','social',6000000,'original'],
 ['product-grid','Product grid','product',6000000,'original'],
 ['technical-explainer','Technical explainer','technical',7000000,'original'],
 ['architectural-review','Architectural review','technical',7000000,'original'],
 ['data-brief','Data brief','graphics',6000000,'original'],
 ['lower-third','Editorial lower third','documentary',5000000,'original'],
 ['caption-story','Word focus captions','captions',6000000,'original'],
 ['photo-montage','Photo montage','social',6000000,'original'],
 ['film-title','Film title','documentary',6000000,'original'],
 ['audiogram','Audio story','graphics',6000000,'original'],
 ['end-card','End card','social',5000000,'original'],
];
const defaults = {title:'Make room for possibility.',subtitle:'A story worth bringing to life.',label:'CHAPTER 01',author:'Your name',contact:'yourwebsite.com',words:['BUILD','WHAT','MATTERS','NEXT'],items:['Design','Precision','Motion','Possibility'],values:[62,88,47,76],accent:'#68dfc0',background:'#101819',foreground:'#f4f4e9',media:'asset:creative-demo',treatment:'clean',overlay:'none'};
export const CREATIVE_TEMPLATES = Object.freeze(rows.map(([id,name,category,durationUs,provenance]) => defineCoProTemplate({
 id:`creative:${id}`, name, description:`Editable ${category} composition; deterministic integer-microsecond sampling.`,
 canvas:{width:category==='social'||category==='captions'?1080:1920,height:category==='social'||category==='captions'?1920:1080,frameRate:30},
 slots:[...['title','subtitle','label','author','contact'].map(id=>({id,kind:'text',default:defaults[id]})),{id:'media',kind:'media',required:false,default:defaults.media},{id:'accent',kind:'color',default:defaults.accent},{id:'words',kind:'text-list',default:defaults.words},{id:'items',kind:'text-list',default:defaults.items},{id:'values',kind:'number-list',default:defaults.values}],
 tracks:[{id:'creative-main',kind:'overlay',name,visible:true,muted:false,locked:false,clips:[{id:`clip:${id}`,assetId:`graphic:${id}`,startUs:0,durationUs,inUs:0,layer:0,muted:false,playbackRate:1,volume:1,metadata:{creative:{schema:'copro.creative-clip.v1',scene:id,parameters:{...defaults}},transitionOut:{type:'none',durationUs:0}}}]}],
 metadata:{creative:{schema:'copro.creative-template.v1',scene:id,category,durationUs,provenance,parameters:defaults,upstreamReferenceFps:30}},
})));
export function findCreativeTemplate(id) { const t=CREATIVE_TEMPLATES.find(x=>x.id===id||x.metadata.creative.scene===id); if(!t) throw new Error('copro_creative_template_unknown'); return structuredClone(t); }
export function createCreativeProject(id, {projectId,slotValues={},parameters={},canvas,now}={}) {
 const t=findCreativeTemplate(id), p=validateParameters({...defaults,...parameters,...slotValues});
 if(canvas) { if(!Number.isSafeInteger(canvas.width)||canvas.width<1||!Number.isSafeInteger(canvas.height)||canvas.height<1||!Number.isFinite(canvas.frameRate)||canvas.frameRate<=0) throw new RangeError('copro_canvas_invalid'); t.canvas=structuredClone(canvas); }
 const project=instantiateTemplate(t,{projectId,slotValues:p,now});
 const clip=project.tracks[0].clips[0]; clip.metadata.creative.parameters=p;
 // Media remains an asset ID; a host-owned resolver supplies a frame/URL later.
 if(p.media && p.media!==defaults.media) {
  project.tracks.unshift({id:'creative-media',kind:'video',name:'Media',visible:true,muted:false,locked:false,clips:[{id:'clip:media',assetId:p.media,startUs:0,durationUs:clip.durationUs,inUs:0,layer:-1,muted:false,playbackRate:1,volume:1,metadata:{}}]});
 }
 return project;
}
export function validateParameters(value={}) {
 const p=structuredClone(value);
 for(const key of ['title','subtitle','label','author','contact','media']) if(p[key]!==undefined && (typeof p[key]!=='string'||p[key].length>4000)) throw new TypeError(`copro_parameter_${key}_invalid`);
 for(const key of ['accent','background','foreground']) if(p[key]!==undefined&&!/^#[0-9a-f]{6}$/i.test(p[key])) throw new TypeError(`copro_parameter_${key}_invalid`);
 for(const key of ['words','items']) if(p[key]!==undefined&&(!Array.isArray(p[key])||p[key].length>24||p[key].some(x=>typeof x!=='string'||x.length>300))) throw new TypeError(`copro_parameter_${key}_invalid`);
 if(p.values!==undefined&&(!Array.isArray(p.values)||p.values.length>24||p.values.some(x=>!Number.isFinite(x)||x<0||x>1000000))) throw new TypeError('copro_parameter_values_invalid');
 if(p.treatment!==undefined&&!TREATMENTS.some(x=>x.id===p.treatment)) throw new Error('copro_treatment_unknown');
 if(p.overlay!==undefined&&p.overlay!=='none'&&!OVERLAYS.some(x=>x.id===p.overlay)) throw new Error('copro_overlay_unknown');
 return p;
}
const esc = s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const n=x=>Number(x.toFixed(5));
const rect=(x,y,w,h,fill,extra='')=>`<rect x="${n(x)}" y="${n(y)}" width="${n(Math.max(0,w))}" height="${n(Math.max(0,h))}" fill="${fill}" ${extra}/>`;
function text(value,x,y,size,color,{anchor='middle',weight=700,maxChars=30,opacity=1,spacing=0}={}) {
 const lines=[]; let line='';
 for(const word of String(value).split(/\s+/)) {
  if(word.length>maxChars){if(line) {lines.push(line);line='';} for(let i=0;i<word.length;i+=maxChars)lines.push(word.slice(i,i+maxChars));continue;}
  if(line.length+word.length+1>maxChars&&line){lines.push(line);line=word;}else line+=(line?' ':'')+word;
 } if(line)lines.push(line);
 return `<text x="${n(x)}" y="${n(y)}" font-size="${n(size)}" fill="${color}" text-anchor="${anchor}" font-weight="${weight}" letter-spacing="${n(spacing)}" opacity="${n(opacity)}">${lines.slice(0,6).map((l,i)=>`<tspan x="${n(x)}" dy="${i?size*1.16:0}">${esc(l)}</tspan>`).join('')}</text>`;
}
function group(content,{x=0,y=0,scale=1,rotation=0,opacity=1,scaleX=1}={},cx=600,cy=337.5) {
 return `<g opacity="${n(clamp(opacity))}" transform="translate(${cx+x} ${cy+y}) rotate(${rotation}) scale(${scale*scaleX} ${scale}) translate(${-cx} ${-cy})">${content}</g>`;
}
function media(p,timeUs,{resolveAsset},w,h) {
 const url=resolveAsset?.(p.media,timeUs);
 if(url) {
  if(typeof url!=='string'||!(/^(https?:\/\/|blob:|data:image\/(png|jpeg|webp|gif|avif);base64,)/i.test(url))) throw new Error('copro_asset_url_invalid');
  return `<image href="${esc(url)}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"/>`;
 }
 // Original procedural demo art. Never impersonates a decoded media frame.
 return `<g>${rect(0,0,w,h,'#253b3b')}<path d="M 0 ${h*.8} L ${w*.3} ${h*.22} L ${w*.6} ${h*.73} L ${w*.8} ${h*.3} L ${w} ${h*.55} V ${h} H 0 Z" fill="#4b7972"/><circle cx="${w*.76}" cy="${h*.2}" r="${w*.07}" fill="${p.accent}"/>${text('PROCEDURAL PREVIEW',w*.07,h*.94,14,'#bcd2c7',{anchor:'start',weight:400})}</g>`;
}
export function renderOverlaySvg(id,timeUs,{width=1200,height=675,accent='#68dfc0',seed=17,intensity=.12}={}) {
 integerUs(timeUs); if(!OVERLAYS.some(x=>x.id===id)) throw new Error('copro_overlay_unknown');
 if(!Number.isSafeInteger(seed)||!Number.isFinite(intensity)||intensity<0||intensity>1||!Number.isFinite(width)||width<=0||!Number.isFinite(height)||height<=0||!/^#[a-f0-9]{6}$/i.test(accent)) throw new RangeError('copro_overlay_parameters_invalid');
 let body=''; const frame=Math.floor(Math.max(0,timeUs)/41667),uid=`fx-${id}-${seed}`;
 switch(id) {
  // Adapted from Onda GrainOverlay's self-contained SVG turbulence filter.
  case 'film-grain': body=`<defs><filter id="${uid}"><feTurbulence type="fractalNoise" baseFrequency=".82" numOctaves="3" seed="${(seed+frame)%10000}" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter></defs>${rect(0,0,width,height,'#fff',`filter="url(#${uid})" opacity="${intensity}"`)}`;break;
  case 'vignette':body=`<defs><radialGradient id="${uid}"><stop offset="40%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity=".8"/></radialGradient></defs>${rect(0,0,width,height,`url(#${uid})`)}`;break;
  case 'letterbox':body=rect(0,0,width,height*.11,'#000')+rect(0,height*.89,width,height*.11,'#000');break;
  case 'scanlines':for(let y=0;y<height;y+=5)body+=rect(0,y,width,1,'#000',`opacity="${intensity}"`);break;
  case 'light-leak':body=`<defs><radialGradient id="${uid}"><stop stop-color="${accent}" stop-opacity=".6"/><stop offset="100%" stop-color="${accent}" stop-opacity="0"/></radialGradient></defs><ellipse cx="${width*(.25+.3*Math.sin(timeUs/1500000))}" cy="${height*.2}" rx="${width*.65}" ry="${height}" fill="url(#${uid})"/>`;break;
  case 'dust':for(let i=0;i<48;i++) {const x=((i*7919+seed*13)%1000)/1000*width,y=((i*3571+frame*3)%1000)/1000*height;body+=`<circle cx="${x}" cy="${y}" r="${1+i%3}" fill="#fff" opacity="${intensity}"/>`;}break;
  case 'blueprint-grid':for(let x=0;x<width;x+=40)body+=`<path d="M${x} 0V${height}" stroke="${accent}" opacity=".15"/>`;for(let y=0;y<height;y+=40)body+=`<path d="M0 ${y}H${width}" stroke="${accent}" opacity=".15"/>`;break;
  case 'halftone':body=`<defs><pattern id="${uid}" width="8" height="8" patternUnits="userSpaceOnUse"><circle cx="4" cy="4" r="1.2" fill="#000" opacity="${intensity}"/></pattern></defs>${rect(0,0,width,height,`url(#${uid})`)}`;break;
 }
 return body;
}
export function renderCreativeSvg(id,timeUs,parameters={},options={}) {
 integerUs(timeUs);const template=findCreativeTemplate(id),def=template.metadata.creative;
 const p=validateParameters({...defaults,...parameters}),canvas=options.canvas||template.canvas;
 const width=canvas.width,height=canvas.height;
 if(!Number.isSafeInteger(width)||width<1||!Number.isSafeInteger(height)||height<1) throw new RangeError('copro_canvas_invalid');
 const w=1200,h=1200*height/width,cx=w/2,cy=h/2;
 const t=Math.max(0,Math.min(timeUs,def.durationUs)),f=t*30/1000000,progress=cubicOut(t/1200000),a=p.accent,fg=p.foreground;
 const title=(s=p.title,y=cy,size=66,opacity=1)=>text(s,cx,y,size,fg,{maxChars:Math.floor(w*.8/(size*.55)),opacity});
 const sub=(s=p.subtitle,y=cy+90,opacity=1)=>text(s,cx,y,26,'#b5c8c2',{maxChars:55,weight:400,opacity});
 const label=(s=p.label,y=cy-110,opacity=1)=>text(s,cx,y,19,a,{spacing:4,weight:500,opacity});
 let body='';
 switch(def.scene) {
  case 'kinetic-stack': {
   const words=(p.words.length?p.words:['BUILD']).slice(0,6),line=Math.min(h*.155,120),top=cy-line*(words.length-1)/2;
   words.forEach((word,i)=>{const e=cubicOut((f-(6+i*11))/22);body+=group(text(word.toUpperCase(),cx,top+i*line,line*.74,i===words.length-1?a:fg,{maxChars:18}),{y:-line*1.1*(1-e),scale:1.18-.18*e,opacity:clamp(e*4)},cx,top+i*line);});break;
  }
  case 'chapter-divider': {
   const e=cubicOut(f/40),line=cubicOut((f-28)/20);body+=group(label(p.label,cy-75,clamp(f/18)),{scale:3-2*e},cx,cy-75);
   body+=rect(cx-w*.2,cy-40,w*.4*line,2,a)+group(title(p.title,cy+35),{y:15*(1-cubicOut((f-45)/9)),opacity:clamp((f-45)/9)},cx,cy)+sub(p.subtitle,cy+125,clamp((f-53)/9));break;
  }
  case 'product-launch': {
   body+=group(title(p.title,cy-65,76,clamp(f/30)),{y:50*(1-cubicOut(f/40))},cx,cy);
   body+=group(sub(p.subtitle,cy+105,clamp((f-30)/30)),{y:50*(1-cubicOut((f-30)/40))},cx,cy);
   body+=label('DISCOVER WHAT IS NEXT',h-70,clamp((f-100)/50));break;
  }
  case 'quote-story': {
   const e=cubicOut((f-10)/20);body+=rect(w*.1,cy-240,w*.8,480,'#20322f','rx="30"');
   const words=p.title.split(/\s+/),count=Math.floor(cubicOut((f-25)/155)*words.length);body+=group(title(words.slice(0,count).join(' '),cy-60,52),{y:50*(1-e),opacity:clamp((f-10)/20)},cx,cy);
   body+=text(p.author,cx,cy+170,26,a,{opacity:clamp((f-185)/30)});break;
  }
  case 'floating-cards': case 'flip-showcase': {
   const items=p.items.slice(0,3);body+=label(p.label,cy-200)+title(p.title,cy-135,44);
   items.forEach((item,i)=>{const x=130+i*330,e=cubicOut((t-i*150000)/800000);let scale=e,word=item;
    if(def.scene==='flip-showcase'){const turn=clamp((t-800000-i*150000)/1400000);scale=Math.abs(Math.cos(turn*Math.PI));if(turn>.5)word=p.subtitle;}
    const content=rect(x,cy-30,285,210,i===1?'#36584e':'#223732','rx="22"')+text(word,x+142,cy+80,27,fg,{maxChars:15});
    body+=group(content,{scaleX:Math.max(.001,scale),scale:def.scene==='floating-cards'?e:1,y:def.scene==='floating-cards'?Math.sin(f/30+i)*10:0,opacity:e},x+142,cy+75);
   });break;
  }
  case 'documentary-opener':body=group(media(p,t,options,w,h),{scale:1+.07*t/def.durationUs},cx,cy)+rect(0,0,w,h,'#061412','opacity=".35"')+label(p.label,cy-85,progress)+title(p.title,cy+10,68,progress)+sub(p.subtitle,cy+120,clamp((t-700000)/1000000))+renderOverlaySvg('letterbox',t,{width:w,height:h});break;
  case 'social-story':body=media(p,t,options,w,h)+rect(0,h*.55,w,h*.45,p.background)+group(label(p.label,h*.63)+title(p.title,h*.72,84)+sub(p.subtitle,h*.88),{y:70*(1-progress),opacity:progress},cx,cy);break;
  case 'product-grid': {
   body+=label(p.label,cy-220)+title(p.title,cy-155,50);
   p.items.slice(0,4).forEach((item,i)=>{const e=cubicOut((t-i*180000)/800000),x=120+i%2*490,y=cy-95+Math.floor(i/2)*165;
    body+=group(rect(x,y,465,140,i===0?'#315d4f':'#20332e','rx="20"')+text(item,x+35,y+83,31,fg,{anchor:'start',maxChars:22}),{opacity:e,y:30*(1-e)},x+230,y+70);});break;
  }
  case 'technical-explainer': {
   body+=label(p.label,65)+title(p.title,130,48);
   const e=cubicOut((t-500000)/2500000);for(let i=0;i<3;i++){const x=cx+(i-1)*(180+e*160),y=cy+(i===1?40:0);body+=`<path d="M${cx} ${cy+40}L${x} ${y}" stroke="${a}" stroke-dasharray="6 7" opacity="${e}"/><circle cx="${x}" cy="${y}" r="64" fill="#243e36" stroke="${a}"/>`+text(p.items[i]||`Layer ${i+1}`,x,y+110,24,fg,{maxChars:18,opacity:e});}body+=sub(p.subtitle,h-55);break;
  }
  case 'architectural-review': {
   body+=label(p.label,65)+title(p.title,125,46);
   const e=cubicOut((t-300000)/2600000);body+=`<g stroke="${a}" fill="none" stroke-width="4" stroke-dasharray="3000" stroke-dashoffset="${3000*(1-e)}"><path d="M220 210H980V540H220ZM580 210V540M580 360H980M350 210V330H220M760 360V540"/></g>`;
   body+=text('7.60 m',cx,580,22,a,{opacity:e})+text('STUDY / LIVING / WORK',cx,cy+60,22,fg,{opacity:e,spacing:3})+sub(p.subtitle,h-40,e);break;
  }
  case 'data-brief': {
   body+=label(p.label,75)+title(p.title,140,48);const max=Math.max(1,...p.values);
   p.values.slice(0,6).forEach((v,i)=>{const e=cubicOut((t-i*200000)/1600000),x=180+i*150,bh=v/max*270*e;body+=rect(x,h-110-bh,95,bh,i===1?a:'#3e7464','rx="8"')+text(String(Math.round(v*e)),x+47,h-125-bh,26,fg)+text(p.items[i]||String(i+1),x+47,h-70,17,fg,{maxChars:12});});break;
  }
  case 'lower-third':body=media(p,t,options,w,h)+group(rect(70,h-185,760,120,'#101819','rx="10"')+rect(70,h-185,7,120,a)+text(p.author,105,h-132,38,fg,{anchor:'start',maxChars:30})+text(p.subtitle,105,h-90,24,a,{anchor:'start',weight:400,maxChars:45}),{x:-50*(1-progress),opacity:progress},cx,cy);break;
  case 'caption-story': {
   body=media(p,t,options,w,h)+rect(0,h*.52,w,h*.48,'#0d1714','opacity=".9"');const words=p.title.split(/\s+/),index=Math.min(words.length-1,Math.floor(t/def.durationUs*words.length));
   body+=title(words[index]||'',h*.69,110)+text(words.slice(Math.max(0,index-2),index+3).join(' '),cx,h*.82,37,a,{maxChars:32})+label('WORD FOCUS',h*.9);break;
  }
  case 'photo-montage': {
   const index=Math.min(2,Math.floor(t/2000000)),zoom=1+.04*((t%2000000)/2000000);body=group(media({...p,media:Array.isArray(p.mediaIds)?p.mediaIds[index]:p.media},t,options,w,h),{scale:zoom,x:(index-1)*18},cx,cy);
   body+=rect(40,h-150,w-80,100,p.background,'rx="10" opacity=".9"')+text(p.items[index]||p.title,cx,h-88,38,fg,{maxChars:38})+text(`0${index+1} / 03`,w-90,70,22,a);break;
  }
  case 'film-title':body+=label(p.label,cy-90,progress)+text(p.title,cx,cy+5,68,fg,{maxChars:22,opacity:progress,spacing:10*(1-progress)})+sub(p.subtitle,cy+130,clamp((t-1500000)/1200000))+renderOverlaySvg('film-grain',t,{width:w,height:h,intensity:.06});break;
  case 'audiogram': {
   body+=label(p.label,cy-175)+title(p.title,cy-80,52);
   const values=p.values.length?p.values:[0];for(let i=0;i<56;i++){const amp=values[i%values.length]/Math.max(1,...values),bh=12+110*amp*Math.abs(Math.sin(i*.7+t/300000));body+=rect(100+i*18,cy+80-bh/2,10,bh,a,'rx="5"');}body+=sub(p.subtitle,h-60);break;
  }
  case 'end-card':body+=group(label(p.label,cy-105)+title(p.title,cy-45,70)+sub(p.subtitle,cy+125)+text(p.contact,cx,h-65,24,a),sampleAnimation('zoom-in',t,{durationUs:1000000}),cx,cy);break;
 }
 if(p.overlay!=='none')body+=renderOverlaySvg(p.overlay,t,{width:w,height:h,accent:a});
 const matrix=TREATMENTS.find(x=>x.id===(p.treatment??'clean')).matrix;
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(template.name)}"><defs><filter id="copro-color-treatment"><feColorMatrix type="matrix" values="${matrix}"/></filter></defs><g font-family="Arial, Helvetica, sans-serif" filter="url(#copro-color-treatment)">${rect(0,0,w,h,p.background)}${body}</g></svg>`;
}
export function renderCreativeProjectFrame(project,timeUs,options={}) {
 if(project?.schema!=='copro.project.v1')throw new Error('copro_creative_project_invalid');integerUs(timeUs);
 const clips=(project.tracks||[]).filter(t=>t.visible!==false).flatMap(t=>t.clips||[]).filter(c=>c.metadata?.creative&&timeUs>=c.startUs&&timeUs<c.startUs+c.durationUs).sort((a,b)=>a.layer-b.layer);
 if(!clips.length)return null;
 if(clips.length>1)throw new Error('copro_creative_multiple_layers_host_compositor_required');
 const clip=clips[0],localUs=Math.round((timeUs-clip.startUs)*(clip.playbackRate??1)+(clip.inUs??0));
 return renderCreativeSvg(clip.metadata.creative.scene,localUs,clip.metadata.creative.parameters,{...options,canvas:project.canvas});
}
export function renderCreativeFrameAtIndex(id,frame,frameRate=30,parameters={},options={}) {return renderCreativeSvg(id,frameToUs(frame,frameRate),parameters,options);}
export function renderTypewriterSvg(textValue,timeUs,{width=1200,height=675,accent='#68dfc0',...timing}={}) {
 const state=sampleTypewriter(createTypewriterEvents(textValue,timing),timeUs);
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 1200 675">${rect(0,0,1200,675,'#101819')}${text(state.text+(state.cursor?'|':''),600,337,54,accent,{maxChars:30})}</svg>`;
}
export function renderAnimationSvg(id,timeUs,{title='MAKE IT MOVE',accent='#68dfc0',durationUs}={}) {
 validateParameters({title,accent});const s=sampleAnimation(id,timeUs,{durationUs});
 const content=text(title,600,350,72,accent,{maxChars:22});
 return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675"><defs><filter id="motion-blur"><feGaussianBlur stdDeviation="${s.blur}"/></filter><clipPath id="motion-wipe"><rect x="0" y="0" width="${1200*(1-s.clipInset)}" height="675"/></clipPath></defs>${rect(0,0,1200,675,'#101819')}<g clip-path="url(#motion-wipe)" filter="url(#motion-blur)">${group(content,s)}</g></svg>`;
}
