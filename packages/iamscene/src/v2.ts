/**
 * IAMScene v2: multi-scene, independently addressable authoring data.
 *
 * Deliberately separate from the v1 runtime. A valid v2 document is editable
 * data; it is NOT a claim that the current renderer, simulation engine, or
 * host inspector supports the full object/behavior vocabulary.
 */
import { Ajv2020, type ErrorObject } from 'ajv/dist/2020.js';
import v1Schema from '../schema/iamscene.v1.schema.json' with { type: 'json' };
import v2Schema from '../schema/iamscene.v2.schema.json' with { type: 'json' };
import { assertValidSceneDocument } from './validate.js';
import type {
  SceneDocument, SceneMetadata, SceneCoordinateSystem, SceneAsset, SceneMaterial,
  SceneAnimation, SceneTransform, Vec3, SceneValidationIssue, SceneValidationResult,
} from './types.js';
import type { IAMSceneV2ObjectKind } from './object-catalog.js';

export const IAMSCENE_V2_SCHEMA_URI = 'https://schemas.inneranimalmedia.com/packages/iamscene/v2/scene.canonical.schema.json';
export const IAMSCENE_V2_FORMAT_VERSION = '2.0.0' as const;

export interface SceneV2Object {
  id: string; sceneId: string; name: string; kind: IAMSceneV2ObjectKind;
  parentId?: string; transform: SceneTransform; visible: boolean; locked?: boolean;
  geometryRef?: string; materialRef?: string; cameraRef?: string; lightRef?: string; pathRef?: string;
  renderOrder?: number;
  text?: { content: string; fontAssetRef?: string; size?: number; fontSize?: number; lineHeight?: number; spacing?: number; weight?: string; horizontal?: 'left'|'center'|'right'|'justify'; vertical?: 'top'|'middle'|'bottom'; case?: 'original'|'upper'|'lower'; extrusion?: number; bevel?: number };
  emitter?: {shape:'sphere'|'plane'|'box'|'mesh';size?:Vec3;autoPlay?:boolean;emitTime?:number;forceRefs?:string[];noise?:Record<string,unknown>;randomness?:Record<string,unknown>};
  stateIds?: string[]; eventIds?: string[]; userData?: Record<string,unknown>;
}
export interface SceneV2Scene {
  id:string;name:string;rootObjectIds:string[];
  frameRef?:string;environmentRef?:string;simulationRef?:string;
  playCameraRef?:string;pipelineRef?:string;effectIds?:string[];
}
export interface SceneV2Geometry {
  id:string;kind:'primitive'|'vector'|'mesh'|'cad'|'text'|'occt'|'polyline'|'sphere';
  primitiveType?:string;assetRef?:string;sourceUri?:string;
  parameters?:Record<string,unknown>;
  /** Explicitly version-bound legacy geometry, never a replacement for CAD v2's feature history. */
  legacyDefinition?:Record<string,unknown>;
}
export interface SceneV2Systems {
  frames:Array<{id:string;mode:'responsive'|'custom'|'preset';preset?:string;width?:number;height?:number;autoZoom?:boolean}>;
  cameras:Array<{id:string;projection:'perspective'|'orthographic';position:Vec3;target:Vec3;near:number;far:number;fov?:number;frustumHeight?:number;zoom?:number}>;
  lights:Array<{id:string;kind:'directional'|'point'|'spot'|'area';color:string;intensity:number;position:Vec3;unit?:'relative'|'lux'|'lumens'|'watts';castShadow?:boolean;angle?:number}>;
  environments:Array<{id:string;background:string;ambientIntensity:number;ambientColor?:string;skyRef?:string;fogRef?:string;shadowRef?:string;lightIds:string[]}>;
  skies:Array<{id:string;mode:'physical'|'hdri';assetRef?:string;rotation?:number;blur?:number;showBackground?:boolean;lightingInfluence?:number;intensity?:number}>;
  fogs:Array<{id:string;mode:'linear'|'height'|'both';color:string;near?:number;far?:number;heightDensity?:number;useBackground?:boolean}>;
  shadows:Array<{id:string;enabled:boolean;quality?:'low'|'medium'|'high';intensity?:number}>;
  simulations:Array<{id:string;enabled:boolean;gravity:Vec3;solver?:string}>;
  effects:Array<{id:string;kind:'depth-of-field'|'pixelation'|'aberration'|'bloom'|'hue'|'brightness'|'vignette'|'noise';enabled:boolean;intensity?:number}>;
  pipelines:Array<{id:string;mode:'classic'|'linear'|'aces';exposure?:number}>;
  modifiers:Array<{id:string;targetObjectId:string;kind:string;parameters?:Record<string,unknown>}>;
}
export interface SceneV2Behaviors {
  animations:SceneAnimation[];
  states:Array<{id:string;name:string;targetObjectId:string;overrides:Array<{path:string;value:unknown}>}>;
  events:Array<{id:string;targetObjectId?:string;trigger:'start'|'pointerenter'|'pointerleave'|'click'|'custom';actions:Array<{type:string;targetObjectId?:string;animationId?:string;variableId?:string;dataSourceId?:string;parameters?:Record<string,unknown>}>}>;
  variables:Array<{id:string;name:string;type:'number'|'boolean'|'string'|'time'|'counter'|'random';value?:unknown}>;
  dataSources:Array<{id:string;kind:'webhook'|'api'|'ai-text'|'ai-voice';uri?:string;scope?:string}>;
}
export interface SceneV2Document {
  $schema:typeof IAMSCENE_V2_SCHEMA_URI;
  format:'iamscene';formatVersion:typeof IAMSCENE_V2_FORMAT_VERSION;
  metadata:SceneMetadata;coordinateSystem:SceneCoordinateSystem;
  scenes:SceneV2Scene[];objects:SceneV2Object[];
  resources:{
    assets:SceneAsset[];materials:SceneMaterial[];geometry:SceneV2Geometry[];
    materialTextures:Array<{id:string;materialRef:string;assetRef:string;slot:'baseColor'|'normal'|'roughness'|'metalness'|'emissive'|'opacity'|'environment';uvSet?:number}>;
  };
  systems:SceneV2Systems;behaviors:SceneV2Behaviors;
  views:{activeSceneId?:string;personalCamera?:Record<string,unknown>;gridPlane?:'XZ'|'XY'|'YZ';snapping?:'object'|'grid'|'off'};
  extensionsUsed:string[];extensionsRequired:string[];
}

const ajv = new Ajv2020({allErrors:true,strict:false,validateFormats:false});
ajv.addSchema(v1Schema);
const validateSchema = ajv.compile(v2Schema);
const clone = <T>(value:T):T => structuredClone(value);
const issue = (path:string,message:string,keyword='reference'):SceneValidationIssue=>({path,message,keyword});

const collections = (doc:SceneV2Document):Array<[string,Array<{id:string}>]> => [
  ['scenes',doc.scenes],['objects',doc.objects],
  ['resources/assets',doc.resources.assets],['resources/materials',doc.resources.materials],
  ['resources/geometry',doc.resources.geometry],['resources/materialTextures',doc.resources.materialTextures],
  ...Object.entries(doc.systems).map(([kind,rows])=>['systems/'+kind,rows] as [string,Array<{id:string}>]),
  ...Object.entries(doc.behaviors).map(([kind,rows])=>['behaviors/'+kind,rows] as [string,Array<{id:string}>]),
];

export function validateSceneV2Document(value:unknown):SceneValidationResult {
  const errors:SceneValidationIssue[]=[];
  if (!validateSchema(value)) {
    return {valid:false,errors:(validateSchema.errors??[] as ErrorObject[]).map(error=>({
      path:error.instancePath || '/',message:error.message??'schema_validation_failed',keyword:error.keyword,
    }))};
  }
  const doc=value as unknown as SceneV2Document;
  const table = new Map(collections(doc).map(([collection,rows])=>[collection,new Map(rows.map(r=>[r.id,r]))]));
  for(const [collection,rows] of collections(doc)){
    const ids=new Set<string>();
    for(const row of rows){
      if(ids.has(row.id))errors.push(issue('/'+collection+'/'+row.id,'duplicate_id:'+row.id,'uniqueId'));
      ids.add(row.id);
    }
  }
  const exists=(key:string,id:string|undefined,path:string)=>{
    if(id&&!table.get(key)?.has(id))errors.push(issue(path,'unknown_reference:'+key+':'+id));
  };
  const existsMany=(key:string,ids:readonly string[]|undefined,path:string)=>ids?.forEach((ref,i)=>exists(key,ref,path+'/'+i));
  const nodes=new Map(doc.objects.map(n=>[n.id,n]));
  for(const scene of doc.scenes){
    existsMany('objects',scene.rootObjectIds,'/scenes/'+scene.id+'/rootObjectIds');
    for(const id of scene.rootObjectIds){
      const node=nodes.get(id);
      if(node&&(node.parentId||node.sceneId!==scene.id))errors.push(issue('/scenes/'+scene.id+'/rootObjectIds','root_must_be_parentless_and_belong_to_scene:'+id));
    }
    for(const [key,refKey] of [['frameRef','frames'],['environmentRef','environments'],['simulationRef','simulations'],['playCameraRef','cameras'],['pipelineRef','pipelines']] as const)exists('systems/'+refKey,scene[key],'/scenes/'+scene.id+'/'+key);
    existsMany('systems/effects',scene.effectIds,'/scenes/'+scene.id+'/effectIds');
  }
  for(const object of doc.objects){
    exists('scenes',object.sceneId,'/objects/'+object.id+'/sceneId');
    for(const [key,col] of [['geometryRef','resources/geometry'],['materialRef','resources/materials'],['cameraRef','systems/cameras'],['lightRef','systems/lights'],['pathRef','objects']] as const)exists(col,object[key],'/objects/'+object.id+'/'+key);
    exists('resources/assets',object.text?.fontAssetRef,'/objects/'+object.id+'/text/fontAssetRef');
    existsMany('behaviors/states',object.stateIds,'/objects/'+object.id+'/stateIds');
    existsMany('behaviors/events',object.eventIds,'/objects/'+object.id+'/eventIds');
    existsMany('objects',object.emitter?.forceRefs,'/objects/'+object.id+'/emitter/forceRefs');
    const parent=object.parentId?nodes.get(object.parentId):undefined;
    if(object.parentId && !parent)errors.push(issue('/objects/'+object.id+'/parentId','unknown_parent:'+object.parentId));
    if(parent && parent.sceneId!==object.sceneId)errors.push(issue('/objects/'+object.id+'/parentId','cross_scene_parent'));
    if(!object.parentId&&!doc.scenes.some(scene=>scene.id===object.sceneId&&scene.rootObjectIds.includes(object.id)))
      errors.push(issue('/objects/'+object.id+'/parentId','unlisted_scene_root'));
    const visited=new Set<string>();
    let cursor:SceneV2Object|undefined=object;
    while(cursor){
      if(visited.has(cursor.id)){errors.push(issue('/objects/'+object.id+'/parentId','scene_graph_cycle'));break;}
      visited.add(cursor.id);
      cursor=cursor.parentId?nodes.get(cursor.parentId):undefined;
    }
  }
  for(const geometry of doc.resources.geometry)exists('resources/assets',geometry.assetRef,'/resources/geometry/'+geometry.id+'/assetRef');
  for(const texture of doc.resources.materialTextures){
    exists('resources/materials',texture.materialRef,'/resources/materialTextures/'+texture.id+'/materialRef');
    exists('resources/assets',texture.assetRef,'/resources/materialTextures/'+texture.id+'/assetRef');
  }
  for(const environment of doc.systems.environments){
    exists('systems/skies',environment.skyRef,'/systems/environments/'+environment.id+'/skyRef');
    exists('systems/fogs',environment.fogRef,'/systems/environments/'+environment.id+'/fogRef');
    exists('systems/shadows',environment.shadowRef,'/systems/environments/'+environment.id+'/shadowRef');
    existsMany('systems/lights',environment.lightIds,'/systems/environments/'+environment.id+'/lightIds');
  }
  for(const sky of doc.systems.skies)exists('resources/assets',sky.assetRef,'/systems/skies/'+sky.id+'/assetRef');
  for(const modifier of doc.systems.modifiers)exists('objects',modifier.targetObjectId,'/systems/modifiers/'+modifier.id+'/targetObjectId');
  for(const state of doc.behaviors.states)exists('objects',state.targetObjectId,'/behaviors/states/'+state.id+'/targetObjectId');
  for(const event of doc.behaviors.events){
    exists('objects',event.targetObjectId,'/behaviors/events/'+event.id+'/targetObjectId');
    for(const [i,action] of event.actions.entries()){
      const path='/behaviors/events/'+event.id+'/actions/'+i;
      exists('objects',action.targetObjectId,path+'/targetObjectId');
      exists('behaviors/animations',action.animationId,path+'/animationId');
      exists('behaviors/variables',action.variableId,path+'/variableId');
      exists('behaviors/dataSources',action.dataSourceId,path+'/dataSourceId');
    }
  }
  for(const animation of doc.behaviors.animations)
    for(const track of animation.tracks)exists('objects',track.targetId,'/behaviors/animations/'+animation.id+'/tracks/'+track.id+'/targetId');
  exists('scenes',doc.views.activeSceneId,'/views/activeSceneId');
  return {valid:errors.length===0,errors};
}
export function assertValidSceneV2Document(value:unknown):asserts value is SceneV2Document {
  const result=validateSceneV2Document(value);
  if(!result.valid)throw new Error('iamscene_v2_invalid:'+JSON.stringify(result.errors));
}
export function parseSceneV2Document(input:string|Uint8Array|ArrayBuffer):SceneV2Document {
  let value:unknown;
  try{
    const text=typeof input==='string'?input:new TextDecoder('utf-8',{fatal:true}).decode(input instanceof Uint8Array?input:new Uint8Array(input));
    value=JSON.parse(text);
  }catch{throw new Error('iamscene_v2_json_invalid');}
  assertValidSceneV2Document(value);
  return clone(value);
}
export function serializeSceneV2Document(document:SceneV2Document):string {
  assertValidSceneV2Document(document);
  return JSON.stringify(document,null,2)+'\n';
}
export function createSceneV2Document(options:{id:string;name:string;description?:string;author?:string;now?:string}):SceneV2Document {
  const now=options.now??new Date().toISOString();
  const doc:SceneV2Document={
    $schema:IAMSCENE_V2_SCHEMA_URI,format:'iamscene',formatVersion:IAMSCENE_V2_FORMAT_VERSION,
    metadata:{id:options.id,name:options.name,...(options.description?{description:options.description}:{}),...(options.author?{author:options.author}:{}),createdAt:now,modifiedAt:now},
    coordinateSystem:{handedness:'right',upAxis:'Y',distanceUnit:'m'},
    scenes:[{id:'scene-main',name:'Scene 1',rootObjectIds:['scene-root'],environmentRef:'environment-main',playCameraRef:'camera-main'}],
    objects:[{id:'scene-root',sceneId:'scene-main',name:'Scene',kind:'group',transform:{position:[0,0,0],rotation:[0,0,0,1],scale:[1,1,1]},visible:true}],
    resources:{assets:[],materials:[],geometry:[],materialTextures:[]},
    systems:{
      frames:[],cameras:[{id:'camera-main',projection:'perspective',position:[0,2.5,6],target:[0,0,0],fov:40,near:.01,far:1000}],
      lights:[],environments:[{id:'environment-main',background:'#05080d',ambientIntensity:.3,lightIds:[]}],
      skies:[],fogs:[],shadows:[],simulations:[],effects:[],pipelines:[],modifiers:[],
    },
    behaviors:{animations:[],states:[],events:[],variables:[],dataSources:[]},
    views:{activeSceneId:'scene-main',gridPlane:'XZ',snapping:'off'},
    extensionsUsed:[],extensionsRequired:[],
  };
  assertValidSceneV2Document(doc);
  return doc;
}
/** Loss-aware, forward-only import. Does not modify or reinterpret the v1 source. */
export function migrateSceneV1ToV2(source:SceneDocument):SceneV2Document {
  assertValidSceneDocument(source);
  const doc=createSceneV2Document({id:source.metadata.id,name:source.metadata.name});
  doc.metadata=clone(source.metadata);
  doc.coordinateSystem=clone(source.coordinateSystem);
  doc.scenes=[{id:'scene-main',name:source.metadata.name,rootObjectIds:[...source.scene.rootNodeIds],environmentRef:'environment-main',playCameraRef:'camera-main'}];
  doc.resources.assets=clone(source.assets);
  doc.resources.materials=clone(source.materials);
  doc.objects=source.scene.nodes.map(node=>{
    const geometryRef=node.geometry||node.assetRef?'geometry:'+node.id:undefined;
    if(geometryRef)doc.resources.geometry.push({
      id:geometryRef,kind:node.geometry?.type==='occt'?'occt':node.geometry?.type==='polyline'?'polyline':node.geometry?.type==='sphere'?'sphere':'mesh',
      ...(node.assetRef?{assetRef:node.assetRef}:{}),
      ...(node.geometry?{legacyDefinition:clone(node.geometry) as unknown as Record<string,unknown>}:{}),
    });
    return {id:node.id,sceneId:'scene-main',name:node.name,kind:node.kind,...(node.parentId?{parentId:node.parentId}:{}),transform:clone(node.transform),visible:node.visible,
      ...(geometryRef?{geometryRef}:{}),...(node.materialRef?{materialRef:node.materialRef}:{}),
      ...(node.pathRef?{pathRef:node.pathRef}:{}),...(node.renderOrder!==undefined?{renderOrder:node.renderOrder}:{}),
      ...(node.userData?{userData:clone(node.userData)}:{})};
  });
  const camera=source.camera;
  doc.systems.cameras=[{id:'camera-main',projection:camera.projection,position:clone(camera.position),target:clone(camera.target),
    near:camera.near,far:camera.far,...(camera.fov!==undefined?{fov:camera.fov}:{}),
    ...(camera.frustumHeight!==undefined?{frustumHeight:camera.frustumHeight}:{}),
    ...(camera.zoom!==undefined?{zoom:camera.zoom}:{})}];
  doc.systems.lights=source.environment.lights.map(light=>({id:light.id,kind:light.type,color:light.color,intensity:light.intensity,position:clone(light.position)}));
  doc.systems.environments=[{id:'environment-main',background:source.environment.background,ambientIntensity:source.environment.ambientIntensity,lightIds:doc.systems.lights.map(light=>light.id),
    ...(source.environment.fog?{fogRef:'fog-main'}:{})}];
  if(source.environment.fog)doc.systems.fogs=[{id:'fog-main',mode:'linear',...clone(source.environment.fog)}];
  doc.behaviors.animations=clone(source.animations);
  doc.behaviors.events=source.interactions.map(event=>({id:event.id,targetObjectId:event.targetId,trigger:event.event,actions:[{type:'play-animation',animationId:event.action.animationId}]}));
  doc.extensionsUsed=clone(source.extensionsUsed);
  doc.extensionsRequired=clone(source.extensionsRequired);
  assertValidSceneV2Document(doc);
  return doc;
}

export class SceneV2Editor {
  #document:SceneV2Document;
  #undo:SceneV2Document[]=[];
  #redo:SceneV2Document[]=[];
  #revision=0;
  constructor(document:SceneV2Document){assertValidSceneV2Document(document);this.#document=clone(document);}
  get document(){return clone(this.#document);}
  get revision(){return this.#revision;}
  /** Schema and all cross-collection references are checked before commit. */
  transact(mutator:(draft:SceneV2Document)=>void):SceneV2Document {
    const draft=clone(this.#document);
    mutator(draft);
    assertValidSceneV2Document(draft);
    this.#undo.push(this.#document);this.#redo=[];this.#document=draft;this.#revision++;
    return this.document;
  }
  addObject(object:SceneV2Object):SceneV2Document {
    return this.transact(draft=>{
      if(draft.objects.some(entry=>entry.id===object.id))throw new Error('iamscene_v2_object_exists:'+object.id);
      draft.objects.push(clone(object));
      if(!object.parentId){
        const scene=draft.scenes.find(entry=>entry.id===object.sceneId);
        if(!scene)throw new Error('iamscene_v2_scene_missing:'+object.sceneId);
        scene.rootObjectIds.push(object.id);
      }
    });
  }
  patchObject(id:string,patch:Partial<Omit<SceneV2Object,'id'|'sceneId'>>):SceneV2Document {
    return this.transact(draft=>{
      const object=draft.objects.find(entry=>entry.id===id);
      if(!object)throw new Error('iamscene_v2_object_missing:'+id);
      if(Object.hasOwn(patch,'id')||Object.hasOwn(patch,'sceneId'))throw new Error('iamscene_v2_entity_id_immutable');
      if('parentId' in patch && patch.parentId!==object.parentId)throw new Error('iamscene_v2_use_reparent');
      Object.assign(object,clone(patch));
    });
  }
  /** Reparent a scene node without mutating its identity, resource references, or transform. */
  reparentObject(id:string,parentId:string|null):SceneV2Document {
    return this.transact(draft=>{
      const object=draft.objects.find(entry=>entry.id===id);
      if(!object)throw new Error('iamscene_v2_object_missing:'+id);
      const scene=draft.scenes.find(entry=>entry.id===object.sceneId)!;
      scene.rootObjectIds=scene.rootObjectIds.filter(value=>value!==id);
      if(parentId===null)delete object.parentId;
      else {
        const parent=draft.objects.find(entry=>entry.id===parentId);
        if(!parent||parent.sceneId!==object.sceneId)throw new Error('iamscene_v2_parent_invalid:'+parentId);
        object.parentId=parentId;
      }
      if(parentId===null)scene.rootObjectIds.push(id);
    });
  }
  /** Edit only the selected scene's settings. Cross-references must validate. */
  patchScene(id:string,patch:Partial<Omit<SceneV2Scene,'id'>>):SceneV2Document {
    return this.transact(draft=>{
      const scene=draft.scenes.find(entry=>entry.id===id);
      if(!scene)throw new Error('iamscene_v2_scene_missing:'+id);
      if(Object.hasOwn(patch,'id'))throw new Error('iamscene_v2_entity_id_immutable');
      Object.assign(scene,clone(patch));
    });
  }
  /** Edit one independently versionable scene-system record (sky, fog, camera, etc). */
  patchSystem(collection:keyof SceneV2Systems,id:string,patch:Record<string,unknown>):SceneV2Document {
    return this.transact(draft=>{
      const records=draft.systems[collection] as Array<{id:string}>;
      const record=records.find(item=>item.id===id);
      if(!record)throw new Error('iamscene_v2_system_missing:'+collection+':'+id);
      if(Object.hasOwn(patch,'id')&&patch.id!==id)throw new Error('iamscene_v2_entity_id_immutable');
      Object.assign(record,clone(patch));
    });
  }
  /** Change a single behavior or data source without touching the remaining graph. */
  patchBehavior(collection:keyof SceneV2Behaviors,id:string,patch:Record<string,unknown>):SceneV2Document {
    return this.transact(draft=>{
      const records=draft.behaviors[collection] as Array<{id:string}>;
      const record=records.find(item=>item.id===id);
      if(!record)throw new Error('iamscene_v2_behavior_missing:'+collection+':'+id);
      if(Object.hasOwn(patch,'id')&&patch.id!==id)throw new Error('iamscene_v2_entity_id_immutable');
      Object.assign(record,clone(patch));
    });
  }
  /** Keep reuseable geometry/material sources intact. Deletion fails when still referenced. */
  removeObject(id:string):SceneV2Document {
    return this.transact(draft=>{
      const object=draft.objects.find(entry=>entry.id===id);
      if(!object)throw new Error('iamscene_v2_object_missing:'+id);
      if(draft.objects.some(entry=>entry.parentId===id))throw new Error('iamscene_v2_remove_has_children');
      draft.objects=draft.objects.filter(entry=>entry.id!==id);
      const scene=draft.scenes.find(entry=>entry.id===object.sceneId);
      if(scene)scene.rootObjectIds=scene.rootObjectIds.filter(value=>value!==id);
    });
  }
  /** One atomic command: create a parameterized editable primitive and its instance. */
  addPrimitive(options:{id:string;sceneId:string;parentId?:string;kind:IAMSceneV2ObjectKind;name?:string;parameters?:Record<string,unknown>;transform?:SceneTransform}):SceneV2Document {
    return this.transact(draft=>{
      if(draft.objects.some(entry=>entry.id===options.id))throw new Error('iamscene_v2_object_exists:'+options.id);
      const scene=draft.scenes.find(entry=>entry.id===options.sceneId);
      if(!scene)throw new Error('iamscene_v2_scene_missing:'+options.sceneId);
      const primitives=['rectangle','ellipse','triangle','pentagon','star','plane','cube','sphere','cylinder','torus','helix','cone','pyramid','icosahedron','dodecahedron','torus-knot','lathe'];
      if(!primitives.includes(options.kind))throw new Error('iamscene_v2_not_a_primitive:'+options.kind);
      const geometryRef='geometry:'+options.id;
      if(draft.resources.geometry.some(entry=>entry.id===geometryRef))throw new Error('iamscene_v2_geometry_exists:'+geometryRef);
      draft.resources.geometry.push({id:geometryRef,kind:'primitive',primitiveType:options.kind,parameters:clone(options.parameters??{})});
      draft.objects.push({id:options.id,sceneId:options.sceneId,name:options.name??options.kind,kind:options.kind,
        ...(options.parentId?{parentId:options.parentId}:{}),
        transform:clone(options.transform??{position:[0,0,0],rotation:[0,0,0,1],scale:[1,1,1]}),visible:true,geometryRef});
      if(!options.parentId)scene.rootObjectIds.push(options.id);
    });
  }
  upsertGeometry(geometry:SceneV2Geometry):SceneV2Document {
    return this.transact(draft=>{
      const index=draft.resources.geometry.findIndex(entry=>entry.id===geometry.id);
      if(index<0)draft.resources.geometry.push(clone(geometry));
      else draft.resources.geometry[index]=clone(geometry);
    });
  }
  setObjectGeometry(id:string,geometryRef:string):SceneV2Document {
    return this.patchObject(id,{geometryRef});
  }
  undo():SceneV2Document {
    const previous=this.#undo.pop();
    if(!previous)return this.document;
    this.#redo.push(this.#document);this.#document=previous;this.#revision++;return this.document;
  }
  redo():SceneV2Document {
    const next=this.#redo.pop();
    if(!next)return this.document;
    this.#undo.push(this.#document);this.#document=next;this.#revision++;return this.document;
  }
  serialize(){return serializeSceneV2Document(this.#document);}
}
export const createSceneV2Editor=(document:SceneV2Document)=>new SceneV2Editor(document);
