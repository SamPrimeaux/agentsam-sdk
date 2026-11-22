import { describe, expect, it, vi } from 'vitest';
import type {ProjectState} from '@inneranimalmedia/agentsam-cad-shared';
import { cadAssetUrl, cadRegistryUrl, canEditHostedCadSelection, listHostedProjects, loadHostedProject, seedSceneProjectWithBim } from './hosted-project-source';
import {createTerrainDocument} from './world-terrain';
const id = 'proj_123';
const rev = { revision: 'v1.2', status: 'draft', updatedAt: 123, models: [{id:'model',name:'sample.glb',validationStatus:'asset-verified',status:'draft',contentHash:null}], documents:[{id:'document',name:'sample.design.json',validationStatus:'asset-verified',status:'draft',contentHash:null}],native:[] };
const project = { id:'sample-design', name:'Sample design', walls:[], rooms:[] };
describe('hosted CAD representation resolution', () => {
 it('opens a registered current scene as an editable document with the same project identity',async()=>{
   const current={...rev,revision:'current',sceneRevision:'V1.5',documents:[],models:[{...rev.models[0],contentHash:'a'.repeat(64)}]};
   const fetcher=vi.fn(async()=>({ok:true,json:async()=>({project:{id,name:'Sample'},access:{canWrite:true},revisions:[current,rev]})}));
   const result=await loadHostedProject(id,undefined,fetcher as never);
   expect(result.project?.id).toBe(id);expect(result.project?.walls).toEqual([]);
   expect(result.project?.sceneSettings?.terrain).toEqual(createTerrainDocument());
   expect(result.project?.sceneSource).toMatchObject({assetId:'model',contentHash:'a'.repeat(64),revision:'V1.5'});
   expect(fetcher).toHaveBeenCalledTimes(1);
   expect(canEditHostedCadSelection(result)).toBe(true);
 });
 it('defaults any project without stored terrain to the neutral site, including DreamHouse',async()=>{
   const current={...rev,revision:'current',sceneRevision:'V1.5',documents:[],models:[{...rev.models[0],contentHash:'a'.repeat(64)}]};
   const fetcher=vi.fn(async()=>({ok:true,json:async()=>({project:{id:'dreamhouse-v1-wip',name:'DreamHouse'},access:{canWrite:true},revisions:[current]})}));
   const result=await loadHostedProject('dreamhouse-v1-wip',undefined,fetcher as never);
   expect(result.project?.sceneSettings?.terrain).toEqual(createTerrainDocument());
 });
 it('preserves stored terrain instead of replacing it with the neutral site',async()=>{
   const terrain=createTerrainDocument();
   const fetcher=vi.fn(async (url:string)=>({ ok:true, json:async()=>url===cadRegistryUrl(id)?{project:{id,name:'Sample'},revisions:[rev]}:{...project,sceneSettings:{terrain}} }));
   const result=await loadHostedProject(id,undefined,fetcher as unknown as typeof fetch);
   expect(result.project?.sceneSettings?.terrain).toBe(terrain);
 });
 it('does not unlock an unverified scene or grant writes to a viewer',async()=>{
   const current={...rev,revision:'current',documents:[],models:[{...rev.models[0],contentHash:'b'.repeat(64),validationStatus:'untested'}]};
   const fetcher=vi.fn(async()=>({ok:true,json:async()=>({project:{id,name:'Sample'},access:{canWrite:false},revisions:[current]})}));
   const selection=await loadHostedProject(id,undefined,fetcher as never);
   expect(canEditHostedCadSelection(selection)).toBe(false);
   expect(canEditHostedCadSelection({...selection,registry:{...selection.registry,access:{canWrite:true}}})).toBe(false);
   const verified={...selection,registry:{...selection.registry,access:{canWrite:true}},revision:{...current,models:[{...current.models[0],validationStatus:'asset-verified'}]}};
   expect(canEditHostedCadSelection(verified)).toBe(true);
 });
 it('uses only the authenticated project and artifact endpoints', async () => {
   const fetcher=vi.fn(async (url:string)=>({ ok:true, json:async()=>url===cadRegistryUrl(id)?{project:{id,name:'Sample'},revisions:[rev]}:project }));
   const result=await loadHostedProject(id,undefined,fetcher as unknown as typeof fetch);
   expect(result.modelUrl).toBe(cadAssetUrl(id,'model'));
   expect(result.project).toMatchObject({...project,id});
   expect(result.project?.sceneSettings?.terrain).toEqual(createTerrainDocument());
   expect(fetcher).toHaveBeenCalledWith(cadRegistryUrl(id),{credentials:'same-origin'});
   expect(fetcher).toHaveBeenCalledWith(cadAssetUrl(id,'document'),{credentials:'same-origin'});
 });
 it('never substitutes a demo when project revision is absent', async () => {
   const fetcher=vi.fn(async ()=>({ok:true,json:async()=>({project:{id,name:'Sample'},revisions:[]})}));
   await expect(loadHostedProject(id,undefined,fetcher as unknown as typeof fetch)).rejects.toThrow('No coordinated BIM');
 });
 it('requires a matching requested revision', async () => {
   const fetcher=vi.fn(async ()=>({ok:true,json:async()=>({project:{id,name:'Sample'},revisions:[rev]})}));
   await expect(loadHostedProject(id,'v3.0',fetcher as unknown as typeof fetch)).rejects.toThrow('This revision');
 });
 it('lists only saved projects from the Work snapshot', async () => {
   const fetcher=vi.fn(async()=>({ok:true,json:async()=>({snapshot:{projects:[{id,name:'Sample'}]}})}));
   expect(await listHostedProjects(fetcher as unknown as typeof fetch)).toEqual([{id,name:'Sample'}]);
 });
});
describe('scene-only project BIM seeding', () => {
 const scene: ProjectState={id:'proj_scene',name:'My Scene',walls:[],rooms:[],doors:[],windows:[],furniture:[],
  sceneSource:{assetId:'model',contentHash:'a'.repeat(64),revision:'V1.5',units:'m',axes:'gltf-y-up'},
  sceneElements:[{id:'e1',name:'e1',category:'shell',source:'model.glb',bounds:{min:[0,0,0],max:[1,1,1]},offset:[0,0,0],rotation:0,visible:true}],sceneSettings:{terrain:createTerrainDocument()},lighting:{sunAltitude:45,sunAzimuth:135,intensity:1.1,timeOfDay:'noon',shadows:true,ambientColor:'#334155'},roofType:'none',ceilingHeight:96,scale:1,gridSize:12,snapToGrid:true,annotations:[],updatedAt:1,version:1};
 const bim: ProjectState={id:'example-bim',name:'Example BIM',walls:[{id:'w1',x1:0,y1:0,x2:10,y2:0,thickness:6,height3D:96,material:'drywall'}],rooms:[{id:'r1',name:'Room',points:[[0,0],[10,0],[10,10]],areaSqFt:100,floorMaterial:'hardwood',color:'#fff'}],doors:[],windows:[],furniture:[],
  lighting:{sunAltitude:30,sunAzimuth:90,intensity:1,timeOfDay:'morning',shadows:false,ambientColor:'#000000'},roofType:'gable',ceilingHeight:108,scale:1,gridSize:12,snapToGrid:true,annotations:[],updatedAt:2,version:3};
 it('takes BIM geometry while keeping the scene identity, binding and elements',()=>{
   const seeded=seedSceneProjectWithBim(scene,bim);
   expect(seeded.id).toBe('proj_scene');
   expect(seeded.name).toBe('My Scene');
   expect(seeded.walls).toBe(bim.walls);
   expect(seeded.rooms).toBe(bim.rooms);
   expect(seeded.sceneSource).toBe(scene.sceneSource);
   expect(seeded.sceneElements).toBe(scene.sceneElements);
 });
 it('prefers the scene settings and falls back to the BIM settings',()=>{
   const seeded=seedSceneProjectWithBim(scene,bim);
   expect(seeded.sceneSettings).toBe(scene.sceneSettings);
   expect(seeded.lighting).toBe(scene.lighting);
   const bare: ProjectState={...scene,sceneSettings:undefined};
   expect(seedSceneProjectWithBim(bare,bim).sceneSettings).toBe(bim.sceneSettings);
 });
});
