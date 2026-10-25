import type {CadSceneElement, CadSceneSource, ProjectState} from '@inneranimalmedia/agentsam-cad-shared';

/** Reconcile actual imported element IDs without replacing saved edits or the source binding. */
export function reconcileSceneElements(project:ProjectState, source:CadSceneSource, actual:CadSceneElement[]):ProjectState {
  if(project.sceneSource && (project.sceneSource.assetId!==source.assetId || project.sceneSource.contentHash!==source.contentHash))
    throw new Error('The scene source changed. Reconcile the saved edit with that model before editing.');
  const saved=new Map((project.sceneElements||[]).map(element=>[element.id,element]));
  const next=actual.map(element=>{
    const previous=saved.get(element.id);
    return previous ? {...element,offset:previous.offset,rotation:previous.rotation,visible:previous.visible,
      ...(previous.color?{color:previous.color}:{}),...(previous.note?{note:previous.note}:{}),name:previous.name} : element;
  });
  if(project.sceneSource && JSON.stringify(next)===JSON.stringify(project.sceneElements))return project;
  return {...project,sceneSource:source,sceneElements:next};
}

export function patchSceneElement(project:ProjectState,id:string,updates:Partial<CadSceneElement>):ProjectState {
  const element=project.sceneElements?.find(row=>row.id===id);
  if(!element)throw new Error('Select an element from the current registered scene.');
  const next={...element,...updates,id:element.id,bounds:element.bounds,category:element.category,source:element.source};
  if(!next.offset.every(n=>Number.isFinite(n)&&Math.abs(n)<=100000)||!Number.isFinite(next.rotation))throw new Error('Enter finite scene coordinates.');
  if(next.color && !/^#[0-9a-f]{6}$/i.test(next.color))throw new Error('Choose a valid finish color.');
  return {...project,sceneElements:project.sceneElements!.map(row=>row.id===id?next:row),updatedAt:Date.now()};
}

export function sceneReviewContext(project:ProjectState,id?:string) {
  const element=project.sceneElements?.find(row=>row.id===id);
  return {source:project.sceneSource||null,element:element||null,review:project.sketchDocument?.review||null,
    strokes:project.sketchDocument?.nativeStrokes||[],coordinateSystem:'Sketch XY is Blender plan XY in inches; scene XYZ is glTF world metres, Y up.',
    status:'Descriptive project context; native geometry changes require the authorized modeling operation.'};
}
