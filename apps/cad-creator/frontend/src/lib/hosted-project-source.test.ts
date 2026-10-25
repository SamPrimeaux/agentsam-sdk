import { describe, expect, it, vi } from 'vitest';
import { cadAssetUrl, cadRegistryUrl, listHostedProjects, loadHostedProject } from './hosted-project-source';
const id = 'proj_123';
const rev = { revision: 'v1.2', status: 'draft', updatedAt: 123, models: [{id:'model',name:'sample.glb',validationStatus:'asset-verified',status:'draft',contentHash:null}], documents:[{id:'document',name:'sample.design.json',validationStatus:'asset-verified',status:'draft',contentHash:null}],native:[] };
const project = { id:'sample-design', name:'Sample design', walls:[], rooms:[] };
describe('hosted CAD representation resolution', () => {
 it('opens a registered current scene as an editable document with the same project identity',async()=>{
   const current={...rev,revision:'current',sceneRevision:'V1.5',documents:[],models:[{...rev.models[0],contentHash:'a'.repeat(64)}]};
   const fetcher=vi.fn(async()=>({ok:true,json:async()=>({project:{id,name:'Sample'},access:{canWrite:true},revisions:[current,rev]})}));
   const result=await loadHostedProject(id,undefined,fetcher as never);
   expect(result.project?.id).toBe(id);expect(result.project?.walls).toEqual([]);
   expect(result.project?.sceneSource).toMatchObject({assetId:'model',contentHash:'a'.repeat(64),revision:'V1.5'});
   expect(fetcher).toHaveBeenCalledTimes(1);
 });
 it('uses only the authenticated project and artifact endpoints', async () => {
   const fetcher=vi.fn(async (url:string)=>({ ok:true, json:async()=>url===cadRegistryUrl(id)?{project:{id,name:'Sample'},revisions:[rev]}:project }));
   const result=await loadHostedProject(id,undefined,fetcher as unknown as typeof fetch);
   expect(result.modelUrl).toBe(cadAssetUrl(id,'model'));
   expect(result.project).toEqual({...project,id});
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
