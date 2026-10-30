import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {CREATIVE_TEMPLATES,renderCreativeSvg,renderAnimationSvg,renderOverlaySvg,renderTypewriterSvg} from '../src/creative.js';
import {ANIMATIONS,OVERLAYS,TREATMENTS} from '../src/motion.js';
import {TRANSITIONS} from '../../copro-render/src/transitions/index.js';
const dir=fileURLToPath(new URL('../preview/',import.meta.url));await mkdir(dir+'thumbnails',{recursive:true});
const items=[];
const add=async(id,category,name,durationUs,svg,source)=>{const file='thumbnails/'+id.replaceAll(':','-')+'.svg';await writeFile(dir+file,svg);items.push({id,category,name,durationUs,preview:file,source});};
for(const t of CREATIVE_TEMPLATES){const d=t.metadata.creative;await add(t.id,'template',t.name,d.durationUs,renderCreativeSvg(t.id,Math.round(d.durationUs*.65),{}, {canvas:{width:640,height:360}}),d.provenance);}
for(const a of ANIMATIONS)await add(a.id,'animation',a.name,a.durationUs,renderAnimationSvg(a.id,Math.round(a.durationUs*.4)),a.provenance);
for(const t of TRANSITIONS)await add(t.id,'transition',t.name,2000000,renderCreativeSvg('end-card',1500000,{title:t.name,subtitle:'LIVE WEBGL TRANSITION',label:t.provenance.license},{canvas:{width:640,height:360}}),t.provenance.repository);
for(const o of OVERLAYS)await add(o.id,'overlay',o.name,4000000,`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 1200 675"><rect width="1200" height="675" fill="#30574a"/><circle cx="600" cy="337" r="180" fill="#a4bb85"/>${renderOverlaySvg(o.id,1500000)}</svg>`,o.provenance);
for(const t of TREATMENTS)await add(t.id,'treatment',t.id,4000000,renderCreativeSvg('documentary-opener',1500000,{treatment:t.id},{canvas:{width:640,height:360}}),'original');
await add('typewriter','graphic','Typewriter sequence',4000000,renderTypewriterSvg('Make it move.',1500000),'av/remotion-bits');
await add('counter','graphic','Keyframe counter',4000000,renderCreativeSvg('end-card',1500000,{title:'1,024',subtitle:'KEYFRAME COUNTER'},{canvas:{width:640,height:360}}),'av/remotion-bits');
await writeFile(dir+'catalog.json',JSON.stringify({schema:'copro.creative-catalog.v1',status:'prototype/not-integrated',items},null,2)+'\n');
console.log(JSON.stringify({compositions:CREATIVE_TEMPLATES.length,transitions:TRANSITIONS.length,animations:ANIMATIONS.length,overlays:OVERLAYS.length,treatments:TREATMENTS.length,graphics:2,previews:items.length}));
