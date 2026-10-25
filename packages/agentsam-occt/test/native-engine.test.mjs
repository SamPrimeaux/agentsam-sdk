import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createOcctSession } from '../src/native-session.mjs';
const binary = process.env.AGENTSAM_OCCT_BIN;
const approx = (a,b) => assert.ok(Math.abs(a-b) < Math.max(1e-4,Math.abs(b)*1e-7), `${a} != ${b}`);
const wall = { id:'wall-001', type:'wall', start:[100,200], end:[5100,200], thickness:200, height:3000 };
const door = { id:'door-001', type:'opening', host:'wall-001', offset:1000, width:900, height:2100 };
test('native BRep wall, void, deterministic replay, undo, atomic failure and exact exports', {skip:!binary}, async () => {
 const s=createOcctSession({binary}), root=fs.mkdtempSync(path.join(os.tmpdir(),'agentsam-native-test-'));
 try {
 await s.request({action:'open',projectId:'project-proof'});
 await s.request({action:'apply',operation:wall});await s.request({action:'apply',operation:door});
 let m=await s.request({action:'mesh',id:wall.id});approx(m.volume_mm3,2622000000);assert.equal(m.units,'mm');assert.equal(m.axes,'z-up');assert.ok(m.indices.length>36);
 // Signed tetrahedral mesh volume verifies triangles represent the measured solid.
 let v=0;const p=m.positions;for(let i=0;i<m.indices.length;i+=3){const [a,b,c]=m.indices.slice(i,i+3).map(n=>n*3);v+=(p[a]*(p[b+1]*p[c+2]-p[b+2]*p[c+1])+p[a+1]*(p[b+2]*p[c]-p[b]*p[c+2])+p[a+2]*(p[b]*p[c+1]-p[b+1]*p[c]))/6;}approx(v,m.volume_mm3);
 const log=await s.request({action:'state'});const initialMesh=JSON.stringify(m.positions);
 await s.request({action:'undo'});approx((await s.request({action:'mesh',id:wall.id})).volume_mm3,3000000000);
 await s.request({action:'redo'});assert.equal(JSON.stringify((await s.request({action:'mesh',id:wall.id})).positions),initialMesh);
 await s.request({action:'open',projectId:'project-proof',operations:log.operations,cursor:log.cursor});assert.equal(JSON.stringify((await s.request({action:'mesh',id:wall.id})).positions),initialMesh);
 await assert.rejects(s.request({action:'apply',operation:{...door,id:'bad-opening',offset:4800}}),/opening_outside_wall/);
 assert.equal((await s.request({action:'state'})).cursor,2);
 await assert.rejects(s.request({action:'undo',expectedRevision:0}),/revision_conflict/);
 for(const format of ['step','brep','gltf','ifc']) {const file=path.join(root,'wall.'+format);const receipt=await s.request({action:'export',format,id:wall.id,path:file});approx(receipt.volume_mm3,2622000000);assert.ok(fs.statSync(file).size>100);if(format==='gltf'){const gltf=JSON.parse(fs.readFileSync(file));assert.equal(gltf.asset.version,'2.0');assert.equal(gltf.nodes[0].extras.DesignId,wall.id);assert.equal(gltf.accessors[2].count,m.indices.length);}if(format==='ifc'){const text=fs.readFileSync(file,'utf8');assert.match(text,/IFCWALL\(/);assert.match(text,/IFCRELVOIDSELEMENT\(/);assert.match(text,/IFCTRIANGULATEDFACESET\(/);}}
 for(const mode of ['projection','section']) {const file=path.join(root,mode+'.svg');await s.request({action:'export',format:'svg',id:wall.id,path:file,mode,direction:[0,1,0],origin:[0,200,0]});assert.match(fs.readFileSync(file,'utf8'),/<path d="M/);}
 // Parameter edits keep element IDs and replay downstream opening features.
 await s.request({action:'replace',operation:{...wall,height:3200}});approx((await s.request({action:'mesh',id:wall.id})).volume_mm3,2822000000);
 await s.request({action:'undo'});approx((await s.request({action:'mesh',id:wall.id})).volume_mm3,2622000000);
 await s.request({action:'redo'});approx((await s.request({action:'mesh',id:wall.id})).volume_mm3,2822000000);
 } finally {s.close();fs.rmSync(root,{recursive:true,force:true});}
});
test('separate 2D solver reports constraints, degrees of freedom and inconsistent input', {skip:!binary}, async () => {
 const s=createOcctSession({binary});try {
 const points=[{id:'a',x:0,y:0},{id:'b',x:98,y:2}];
 const constraints=[{type:'fixed',a:'a',x:0,y:0},{type:'horizontal',a:'a',b:'b'},{type:'distance',a:'a',b:'b',value:100}];
 const r=await s.request({action:'solveSketch',points,constraints});assert.equal(r.converged,true);assert.equal(r.status,'constrained');approx(r.points[1].x,100);approx(r.points[1].y,0);
 const free=await s.request({action:'solveSketch',points,constraints:[]});assert.equal(free.degreesOfFreedom,4);assert.equal(free.status,'underconstrained');
 const conflict=await s.request({action:'solveSketch',points,constraints:[...constraints,{type:'distance',a:'a',b:'b',value:80}]});assert.equal(conflict.converged,false);assert.equal(conflict.status,'inconsistent');
 }finally{s.close();}
});
test('profile extrusion, revolution, sweep, booleans, fillet, chamfer, shell, offset and transform create real solids', {skip:!binary}, async () => {
 const s=createOcctSession({binary});try {await s.request({action:'open',projectId:'feature-proof'});
 const ops=[{id:'profile',type:'profile',points:[[0,0,0],[100,0,0],[100,100,0],[0,100,0]]},{id:'extrude',type:'extrude',profile:'profile',vector:[0,0,100]},{id:'profile-revolve',type:'profile',points:[[10,0,0],[20,0,0],[20,0,30],[10,0,30]]},{id:'revolve',type:'revolve',profile:'profile-revolve',origin:[0,0,0],axis:[0,0,1]},{id:'sweep',type:'sweep',profile:'profile',path:[[0,0,0],[0,0,100]]},{id:'box',type:'box',width:100,depth:100,height:100},{id:'tool',type:'box',width:20,depth:30,height:40},{id:'cut',type:'cut',base:'box',tool:'tool'},{id:'common',type:'common',base:'box',tool:'tool'},{id:'fuse',type:'fuse',base:'box',tool:'tool'},{id:'fillet',type:'fillet',base:'box',radius:5,edges:[0]},{id:'chamfer',type:'chamfer',base:'box',radius:5,edges:[0]},{id:'shell',type:'shell',base:'box',distance:-5,faces:[5]},{id:'offset',type:'offset',base:'box',distance:5},{id:'moved',type:'transform',base:'extrude',translation:[1000,2000,3000],axis:[0,0,1],angle:30}];
 for(const operation of ops){await s.request({action:'apply',operation});if(operation.type!=='profile'){const m=await s.request({action:'mesh',id:operation.id});assert.ok(m.volume_mm3>0);assert.ok(m.indices.length>0);if(['extrude','sweep','box','moved','fuse'].includes(operation.id))approx(m.volume_mm3,1e6);if(operation.id==='cut')approx(m.volume_mm3,976000);if(operation.id==='common')approx(m.volume_mm3,24000);if(operation.id==='revolve')approx(m.volume_mm3,Math.PI*9000);}}
 await assert.rejects(s.request({action:'replace',operation:{id:'box',type:'box',width:120,depth:100,height:100}}),/subshape_selection_stale_reselect_required/);
 }finally{s.close();}
});
