import test from "node:test";
import assert from "node:assert/strict";
import { createCoProProject, createTrack, createClip } from "../../copro-project/src/index.js";
import { applyCoProCommand, CoProEditorSession } from "../src/index.js";

function fixture() {
  const project = createCoProProject({ id: "project:1", now: "2026-10-04T00:00:00.000Z" });
  const track = createTrack({ id: "track:1" });
  track.clips.push(createClip({
    id: "clip:1",
    assetId: "asset:1",
    startUs: 0,
    durationUs: 10_000_000,
  }));
  project.tracks.push(track);
  return project;
}

test("split requires caller-provided deterministic right clip id", () => {
  assert.throws(() => applyCoProCommand(fixture(), {
    type: "clip.split",
    payload: { clipId: "clip:1", atUs: 4_000_000 },
  }), /copro_split_right_clip_id_required/);

  const next = applyCoProCommand(fixture(), {
    type: "clip.split",
    payload: { clipId: "clip:1", atUs: 4_000_000, rightClipId: "clip:2" },
  });

  assert.deepEqual(next.tracks[0].clips.map((clip) => ({
    id: clip.id,
    startUs: clip.startUs,
    inUs: clip.inUs,
    durationUs: clip.durationUs,
  })), [
    { id: "clip:1", startUs: 0, inUs: 0, durationUs: 4_000_000 },
    { id: "clip:2", startUs: 4_000_000, inUs: 4_000_000, durationUs: 6_000_000 },
  ]);
});

test("commands do not mutate the input project", () => {
  const original = fixture();
  const next = applyCoProCommand(original, {
    type: "clip.move",
    payload: { clipId: "clip:1", startUs: 2_000_000 },
  });
  assert.equal(original.tracks[0].clips[0].startUs, 0);
  assert.equal(next.tracks[0].clips[0].startUs, 2_000_000);
});

test("session supports deterministic undo and redo", () => {
  const session = new CoProEditorSession(fixture());
  session.execute({
    type: "clip.move",
    payload: { clipId: "clip:1", startUs: 2_000_000 },
  });
  assert.equal(session.project.tracks[0].clips[0].startUs, 2_000_000);
  session.undo();
  assert.equal(session.project.tracks[0].clips[0].startUs, 0);
  session.redo();
  assert.equal(session.project.tracks[0].clips[0].startUs, 2_000_000);
});


test("speed, volume and track state are canonical commands", () => {
  let project = fixture();
  project = applyCoProCommand(project, {
    type: "clip.set_speed",
    payload: { clipId: "clip:1", playbackRate: 1.5 },
  });
  project = applyCoProCommand(project, {
    type: "clip.set_volume",
    payload: { clipId: "clip:1", volume: 0.65 },
  });
  project = applyCoProCommand(project, {
    type: "track.set_state",
    payload: { trackId: "track:1", muted: true, locked: true },
  });

  assert.equal(project.tracks[0].clips[0].playbackRate, 1.5);
  assert.equal(project.tracks[0].clips[0].durationUs, 6_666_667);
  assert.equal(project.tracks[0].clips[0].volume, 0.65);
  assert.equal(project.tracks[0].muted, true);
  assert.equal(project.tracks[0].locked, true);
});


test("effects and transitions are canonical clip commands", () => {
  let project = fixture();
  project = applyCoProCommand(project, {
    type: "clip.set_effect",
    payload: { clipId: "clip:1", effect: "warm" },
  });
  project = applyCoProCommand(project, {
    type: "clip.set_transition",
    payload: { clipId: "clip:1", transition: "crossfade", durationUs: 420_000 },
  });

  assert.equal(project.tracks[0].clips[0].metadata.effect, "warm");
  assert.deepEqual(project.tracks[0].clips[0].metadata.transitionOut, {
    type: "crossfade",
    durationUs: 420_000,
  });
});

test('GUI transform is a canonical undoable command with exact numeric state', () => {
  const session = new CoProEditorSession(fixture());
  const original = session.project.tracks[0].clips[0];
  session.execute({type:'clip.set_transform', payload:{clipId:'clip:1',scale:1.25,x:12,y:-8,rotation:90,opacity:.7}});
  const transformed = session.project.tracks[0].clips[0];
  assert.deepEqual(transformed.metadata.transform, {scale:1.25,x:12,y:-8,rotation:90,opacity:.7});
  assert.equal(original.metadata.transform,undefined);
  session.execute({type:'clip.set_transform',payload:{clipId:'clip:1',x:20}});
  assert.equal(session.project.tracks[0].clips[0].metadata.transform.x,20);
  assert.equal(session.project.tracks[0].clips[0].metadata.transform.scale,1.25);
  session.undo();
  assert.equal(session.project.tracks[0].clips[0].metadata.transform.x,12);
  session.redo();
  assert.equal(session.project.tracks[0].clips[0].metadata.transform.x,20);
  assert.throws(()=>applyCoProCommand(session.project,{type:'clip.set_transform',payload:{clipId:'clip:1',opacity:1.7}}),/copro_clip_opacity_invalid/);
});


test('motion preset metadata is a canonical undoable clip command', () => {
  const session = new CoProEditorSession(fixture());
  session.execute({type:"clip.set_motion",payload:{clipId:"clip:1",motion:"rise-in",durationUs:800_000,amplitude:64}});
  assert.deepEqual(session.project.tracks[0].clips[0].metadata.motion,{id:"rise-in",durationUs:800_000,delayUs:0,amplitude:64});
  session.undo();
  assert.equal(session.project.tracks[0].clips[0].metadata.motion,undefined);
  session.redo();
  assert.equal(session.project.tracks[0].clips[0].metadata.motion.id,"rise-in");
  assert.throws(()=>applyCoProCommand(session.project,{type:"clip.set_motion",payload:{clipId:"clip:1",motion:"rise-in",amplitude:20_000}}),/copro_motion_amplitude_invalid/);
});


test('creative composition parameters are validated and undoable', () => {
  const project = fixture();
  const clip = project.tracks[0].clips[0];
  clip.metadata.creative = {schema:"copro.creative-clip.v1",scene:"chapter-divider",parameters:{title:"Original",subtitle:"A subtitle",accent:"#68dfc0"}};
  project.metadata = {templateSlots:{title:"Original",accent:"#68dfc0"}};
  const session = new CoProEditorSession(project);
  session.execute({type:"clip.set_creative_parameters",payload:{clipId:"clip:1",patch:{title:"New title",accent:"#ff7619"}}});
  assert.deepEqual(session.project.tracks[0].clips[0].metadata.creative.parameters,{title:"New title",subtitle:"A subtitle",accent:"#ff7619"});
  assert.deepEqual(session.project.metadata.templateSlots,{title:"New title",accent:"#ff7619"});
  session.undo();
  assert.equal(session.project.tracks[0].clips[0].metadata.creative.parameters.title,"Original");
  session.redo();
  assert.equal(session.project.tracks[0].clips[0].metadata.creative.parameters.title,"New title");
  assert.throws(()=>applyCoProCommand(session.project,{type:"clip.set_creative_parameters",payload:{clipId:"clip:1",patch:{accent:"red"}}}),/copro_creative_color_parameter_invalid/);
});


test('typewriter and counter graphics are stored as undoable, validated clip metadata', () => {
  const session = new CoProEditorSession(fixture());
  const sequence = {events:[{timeUs:0,text:""},{timeUs:80_000,text:"Hi"}],durationUs:80_000,loop:false};
  session.execute({type:"clip.set_graphic",payload:{clipId:"clip:1",graphic:{id:"typewriter",text:"Hi",durationUs:80_000,sequence}}});
  assert.equal(session.project.tracks[0].clips[0].metadata.graphic.id,"typewriter");
  assert.equal(session.project.tracks[0].clips[0].metadata.graphic.text,"Hi");
  session.execute({type:"clip.set_graphic",payload:{clipId:"clip:1",graphic:{id:"counter",durationUs:2_000_000,values:[0,100],decimals:0}}});
  assert.deepEqual(session.project.tracks[0].clips[0].metadata.graphic.values,[0,100]);
  session.undo();
  assert.equal(session.project.tracks[0].clips[0].metadata.graphic.id,"typewriter");
  session.execute({type:"clip.set_graphic",payload:{clipId:"clip:1",graphic:null}});
  assert.equal(session.project.tracks[0].clips[0].metadata.graphic,undefined);
  assert.throws(()=>applyCoProCommand(session.project,{type:"clip.set_graphic",payload:{clipId:"clip:1",graphic:{id:"counter",values:[1]}}}),/copro_counter_values_invalid/);
});

test("project canvas ratio is an undoable validated editor command", () => {
  const session = new CoProEditorSession(fixture());
  session.execute({type:"project.set_canvas",payload:{width:1080,height:1920,frameRate:30}});
  assert.deepEqual(session.project.canvas,{width:1080,height:1920,frameRate:30});
  session.undo();
  assert.deepEqual(session.project.canvas,{width:1920,height:1080,frameRate:30});
  session.redo();
  assert.deepEqual(session.project.canvas,{width:1080,height:1920,frameRate:30});
  assert.throws(()=>applyCoProCommand(session.project,{type:"project.set_canvas",payload:{width:0,height:1920}}),/copro_canvas_width_invalid/);
  assert.throws(()=>applyCoProCommand(session.project,{type:"project.set_canvas",payload:{width:1080,height:1920,frameRate:300}}),/copro_canvas_frame_rate_invalid/);
});

test("splitting a selected fast clip preserves both source portions and every other clip",()=>{
 const project=fixture();
 project.tracks[0].clips[0].playbackRate=2;
 project.tracks[0].clips[0].inUs=1000000;
 const other=createTrack({id:"track:other",kind:"audio"});
 other.clips.push(createClip({id:"audio:unselected",assetId:"audio:1",startUs:0,durationUs:10000000}));
 project.tracks.push(other);
 const session=new CoProEditorSession(project);
 const next=session.execute({type:"clip.split",payload:{clipId:"clip:1",atUs:4000000,rightClipId:"clip:right"}});
 assert.equal(next.tracks[0].clips[1].inUs,9000000);
 assert.equal(next.tracks[0].clips.reduce((sum,clip)=>sum+clip.durationUs,0),10000000);
 assert.deepEqual(next.tracks[1],project.tracks[1]);
 assert.deepEqual(session.undo(),project);
 assert.deepEqual(session.redo(),next);
});

test("locked tracks reject clip edits and insertion before history changes",()=>{
 const project=fixture();project.tracks[0].locked=true;
 const session=new CoProEditorSession(project);
 for(const command of [
  {type:"clip.split",payload:{clipId:"clip:1",atUs:1000000,rightClipId:"right"}},
  {type:"clip.move",payload:{clipId:"clip:1",startUs:3000000}},
  {type:"clip.delete",payload:{clipId:"clip:1"}},
  {type:"clip.insert",payload:{trackId:"track:1",clip:createClip({id:"new",assetId:"new",startUs:0,durationUs:1000000})}},
 ])assert.throws(()=>session.execute(command),/copro_track_locked/);
 assert.deepEqual(session.project,project);
 assert.equal(session.canUndo,false);
});

test("template layers apply as one undoable edit without replacing existing footage",()=>{
 const project=fixture(),session=new CoProEditorSession(project);
 const track=createTrack({id:"template:track",kind:"overlay"});
 track.clips.push(createClip({id:"template:clip",assetId:"graphic:1",startUs:0,durationUs:4000000}));
 const next=session.execute({type:"project.apply_template",payload:{tracks:[track],canvas:{width:1080,height:1920,frameRate:30}}});
 assert.deepEqual(next.tracks[0],project.tracks[0]);
 assert.deepEqual(next.canvas,project.canvas);
 assert.deepEqual(session.undo(),project);
 assert.deepEqual(session.redo(),next);
 track.clips[0].durationUs=1;
 assert.equal(session.project.tracks[1].clips[0].durationUs,4000000);
});

test("project cover is isolated from templates and persists through undo and redo",()=>{
 const project=fixture(),session=new CoProEditorSession(project);
 const cover={kind:"frame",url:"data:image/jpeg;base64,aGVsbG8=",timeUs:1000000};
 session.execute({type:"project.set_cover",payload:{cover}});
 const track=createTrack({id:"template:track",kind:"overlay"});
 const next=session.execute({type:"project.apply_template",payload:{tracks:[track]}});
 assert.deepEqual(next.metadata.cover,cover);
 assert.deepEqual(session.undo().metadata.cover,cover);
 assert.equal(session.undo().metadata?.cover,undefined);
 assert.deepEqual(session.redo().metadata.cover,cover);
 assert.equal(project.metadata?.cover,undefined);
});
