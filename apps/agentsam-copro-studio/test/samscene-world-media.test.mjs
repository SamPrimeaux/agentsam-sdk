import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCoProProject, createTrack, createClip, serializeCoProProject, parseCoProProject } from '@inneranimalmedia/copro-project';
import { CoProEditorSession } from '@inneranimalmedia/copro-editor';
import { evaluateWorld3DFrame } from '@inneranimalmedia/copro-render/world3d';

function sceneSession() {
  const project=createCoProProject({id:'test:scene',title:'Editable SamScene scene'});
  project.tracks.push(createTrack({id:'visual',kind:'video',name:'Scene & footage'}));
  return new CoProEditorSession(project);
}

test('GLB scene clip uses CoPro world evaluator with editable transform and timeline motion',()=>{
  const session=sceneSession();
  const clip=createClip({id:'model',assetId:'asset:real-geometry.glb:1:20480',startUs:1_000_000,durationUs:4_000_000,
    metadata:{sourceKind:'samscene-timeline-cue',sceneCue:{kind:'scene-object',objectId:'real-geometry'},world3d:{visible:true}}});
  session.execute({type:'clip.insert',payload:{trackId:'visual',clip}});
  session.execute({type:'clip.set_transform',payload:{clipId:'model',scale:1.35,x:12,rotation:35}});
  assert.equal(evaluateWorld3DFrame(session.project,500_000).objects.length,0);
  const frame=evaluateWorld3DFrame(session.project,2_000_000);
  assert.equal(frame.objects.length,1);
  assert.equal(frame.objects[0].assetId,clip.assetId);
  assert.equal(frame.objects[0].sourceTimeUs,1_000_000);
  assert.equal(frame.objects[0].transform.scale,1.35);
  assert.equal(frame.objects[0].transform.rotation,35);
  assert.equal(evaluateWorld3DFrame(session.project,5_000_000).objects.length,0);
  session.undo();
  assert.equal(evaluateWorld3DFrame(session.project,2_000_000).objects[0].transform.scale,undefined);
  session.redo();
  assert.equal(evaluateWorld3DFrame(session.project,2_000_000).objects[0].transform.scale,1.35);
});

test('Sky video source can be selected as 3D background plate and survives project roundtrip',()=>{
  const session=sceneSession();
  session.execute({type:'project.set_environment',payload:{patch:{skyPreset:'cloudbank',finish:'gold'}}});
  session.execute({type:'project.set_environment',payload:{patch:{skyVideoAssetId:'asset:sky-reference.mp4:123:25655255'}}});
  const source=createClip({id:'sky',assetId:'asset:sky-reference.mp4:123:25655255',startUs:0,durationUs:12_600_000,
    metadata:{mimeType:'video/mp4',fileName:'sky-reference.mp4'}});
  session.execute({type:'clip.insert',payload:{trackId:'visual',clip:source}});
  const saved=parseCoProProject(serializeCoProProject(session.project));
  assert.equal(saved.metadata.environment.skyVideoAssetId,source.assetId);
  assert.equal(saved.metadata.environment.skyPreset,'cloudbank');
  assert.equal(saved.metadata.environment.finish,'gold');
  assert.equal(saved.tracks[0].clips[0].assetId,source.assetId);
  session.undo();
  session.undo();
  assert.equal(session.project.metadata.environment.skyVideoAssetId,undefined);
});

test('Environment sky media field rejects invalid external URLs and allows resetting to procedural',()=>{
  const session=sceneSession();
  assert.throws(()=>session.execute({type:'project.set_environment',payload:{patch:{skyVideoAssetId:'https://external.example/unsafe.mp4'}}}),/copro_environment_sky_video_invalid/);
  session.execute({type:'project.set_environment',payload:{patch:{skyVideoAssetId:'asset:source:1:2'}}});
  session.execute({type:'project.set_environment',payload:{patch:{skyVideoAssetId:''}}});
  assert.equal(session.project.metadata.environment.skyVideoAssetId,'');
});

test('3D world transform is an undoable spatial edit, separate from video compositing transform',()=>{
  const session=sceneSession();
  const clip=createClip({id:'spatial',assetId:'asset:real-geometry.glb',startUs:0,durationUs:3_000_000,
    metadata:{sourceKind:'samscene-timeline-cue',sceneCue:{kind:'scene-object',objectId:'mesh'},world3d:{visible:true}}});
  session.execute({type:'clip.insert',payload:{trackId:'visual',clip}});
  session.execute({type:'clip.set_world3d',payload:{clipId:'spatial',patch:{transform:{x:2,y:0,z:1.25,rotationYDeg:35,scale:1.5},visible:false}}});
  const [spatial]=evaluateWorld3DFrame(session.project,1_000_000).objects;
  assert.equal(spatial.transform.z,1.25);
  assert.equal(spatial.transform.rotationYDeg,35);
  assert.equal(spatial.visible,false);
  const saved=parseCoProProject(serializeCoProProject(session.project));
  assert.equal(saved.tracks[0].clips[0].metadata.world3d.transform.z,1.25);
  session.undo();
  assert.equal(evaluateWorld3DFrame(session.project,1_000_000).objects[0].transform.z,undefined);
  session.redo();
  assert.equal(evaluateWorld3DFrame(session.project,1_000_000).objects[0].transform.z,1.25);
});

test('SamScene sky layer settings are validated, saved and undoable through the project environment command',()=>{
  const session=sceneSession();
  const patch={skyPreset:'aurora',skyProgression:.35,cloudDensity:.65,galaxyIntensity:.72,
    auroraIntensity:.8,starIntensity:.4,stars:true,finish:'original'};
  session.execute({type:'project.set_environment',payload:{patch}});
  assert.deepEqual(parseCoProProject(serializeCoProProject(session.project)).metadata.environment,patch);
  session.undo();
  assert.equal(session.project.metadata.environment,undefined);
  session.redo();
  assert.equal(session.project.metadata.environment.galaxyIntensity,.72);
  assert.throws(()=>session.execute({type:'project.set_environment',payload:{patch:{auroraIntensity:3}}}),/copro_environment_value_invalid/);
});
