import test from 'node:test';
import assert from 'node:assert/strict';
import {CREATIVE_TEMPLATES,createCreativeProject,renderCreativeSvg,renderCreativeProjectFrame,renderCreativeFrameAtIndex,renderAnimationSvg,renderOverlaySvg,validateParameters} from '../src/creative.js';
import {ANIMATIONS,OVERLAYS,TREATMENTS,sampleAnimation,frameToUs,createTypewriterEvents,sampleTypewriter,sampleCounter} from '../src/motion.js';
import {validateCoProProject} from '../../copro-project/src/index.js';

test('18 compositions round-trip editable slots through existing CoPro projects',()=>{
 assert.equal(CREATIVE_TEMPLATES.length,18);
 for(const template of CREATIVE_TEMPLATES){
  const p=createCreativeProject(template.id,{projectId:'project:test',slotValues:{title:'A custom headline',media:'asset:mine',accent:'#ee8844'},now:'2026-10-30T12:00:00Z'});
  assert.equal(validateCoProProject(p).ok,true,JSON.stringify(validateCoProProject(p)));
  assert.equal(p.timebase.ticksPerSecond,1000000);assert.equal(p.tracks[0].clips[0].assetId,'asset:mine');
  assert.equal(p.tracks[1].clips[0].metadata.creative.parameters.title,'A custom headline');
  const copy=JSON.parse(JSON.stringify(p));assert.equal(renderCreativeProjectFrame(copy,2200000),renderCreativeSvg(template.id,2200000,copy.tracks[1].clips[0].metadata.creative.parameters));
  assert.notEqual(renderCreativeSvg(template.id,0),renderCreativeSvg(template.id,2200000));
  for(const t of [0,1,1000000,template.metadata.creative.durationUs-1])assert.match(renderCreativeProjectFrame(copy,t),/^<svg/);
  assert.equal(renderCreativeProjectFrame(copy,template.metadata.creative.durationUs),null);
 }
});
test('project frame respects clip offsets, in-points, rate and hidden tracks',()=>{
 const p=createCreativeProject('film-title',{projectId:'p'}),clip=p.tracks[0].clips[0];clip.startUs=1000000;clip.inUs=500000;clip.playbackRate=2;
 assert.equal(renderCreativeProjectFrame(p,100000),null);
 assert.equal(renderCreativeProjectFrame(p,1250000),renderCreativeSvg('film-title',1000000,clip.metadata.creative.parameters));
 p.tracks[0].visible=false;assert.equal(renderCreativeProjectFrame(p,1250000),null);
});
test('sampling is deterministic when scrubbing backwards and across frame rates',()=>{
 for(const t of CREATIVE_TEMPLATES){const a=renderCreativeSvg(t.id,1800000);renderCreativeSvg(t.id,3000000);renderCreativeSvg(t.id,0);assert.equal(renderCreativeSvg(t.id,1800000),a);}
 assert.equal(frameToUs(30000,{numerator:30000,denominator:1001}),1001000000);
 assert.equal(renderCreativeFrameAtIndex('film-title',60,30),renderCreativeSvg('film-title',2000000));
 assert.equal(frameToUs(60000,{numerator:60000,denominator:1001}),1001000000);
 assert.throws(()=>frameToUs(1,29.97),/rational/);assert.throws(()=>frameToUs(Number.MAX_SAFE_INTEGER,1),/overflow/);
});
test('36 motion presets have finite, deterministic entry/exit/combo boundaries',()=>{
 assert.equal(ANIMATIONS.length,36);
 for(const a of ANIMATIONS){for(const t of [-1,0,1,400000,a.durationUs,a.durationUs+1]){const s=sampleAnimation(a.id,t);assert.ok(Object.values(s).every(Number.isFinite),a.id);assert.equal(renderAnimationSvg(a.id,t),renderAnimationSvg(a.id,t));}
  const start=sampleAnimation(a.id,0),end=sampleAnimation(a.id,a.durationUs);if(a.mode==='in')assert.equal(end.opacity,1);if(a.mode==='out'&&a.family!=='wipe')assert.equal(end.opacity,0);if(a.mode==='combo'&&a.family!=='wipe'){assert.equal(start.opacity,0);assert.equal(end.opacity,0);}
 }
 const blur=sampleAnimation('blur-in',0);assert.equal(blur.blur,10);assert.equal(blur.y,16);
 assert.throws(()=>sampleAnimation('none',0),/unknown/);assert.throws(()=>sampleAnimation('fade-in',.5),/invalid/);assert.throws(()=>sampleAnimation('fade-in',0,{durationUs:0}),/invalid/);
});
test('typewriter preserves graphemes, deletes between phrases and supports exact looping',()=>{
 const s=createTypewriterEvents(['👩🏽‍🚀A','B'],{typeUs:100,deleteUs:50,holdUs:100,gapUs:100,loop:true});
 assert.equal(sampleTypewriter(s,99).text,'');assert.equal(sampleTypewriter(s,100).text,'👩🏽‍🚀');assert.equal(sampleTypewriter(s,200).text,'👩🏽‍🚀A');
 assert.equal(sampleTypewriter(s,350).text,'👩🏽‍🚀');assert.equal(sampleTypewriter(s,400).text,'');
 assert.deepEqual(sampleTypewriter(s,s.durationUs+200),sampleTypewriter(s,200));
 assert.equal(sampleTypewriter(s,-1).cursor,false);assert.throws(()=>createTypewriterEvents('x',{typeUs:0}),/invalid/);
 assert.equal(sampleCounter([0,10,20],500000).value,10);assert.equal(sampleCounter([0,10,20],1000000).text,'20');assert.throws(()=>sampleCounter([NaN,5],0),/invalid/);
});
test('overlays, treatments and user values remain deterministic and XML-safe',()=>{
 assert.equal(OVERLAYS.length,8);assert.equal(TREATMENTS.length,4);
 for(const o of OVERLAYS)assert.equal(renderOverlaySvg(o.id,1000000),renderOverlaySvg(o.id,1000000));
 const svg=renderCreativeSvg('product-launch',2000000,{title:'<script>alert("x")</script>',subtitle:'A & B'});
 assert.equal(svg.includes('<script>'),false);assert.match(svg,/&lt;script&gt;/);assert.match(svg,/A &amp; B/);assert.equal(svg.includes('id="treatment"'),false);assert.match(renderCreativeSvg('product-launch',1,{treatment:undefined}),/^<svg/);
 assert.throws(()=>validateParameters({accent:'red"/><script/>'}),/invalid/);assert.throws(()=>validateParameters({values:[Infinity]}),/invalid/);assert.throws(()=>renderCreativeSvg('missing',0),/unknown/);
});
