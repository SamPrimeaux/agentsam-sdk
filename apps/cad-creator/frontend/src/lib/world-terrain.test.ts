import {describe,expect,it} from 'vitest';
import {addLandform,addSculptStroke,createDreamHouseTerrainDocument,createTerrainDocument,terrainHeight,validateTerrainDocument} from './world-terrain';
import {createTerrainProjection} from './world-terrain-three';

describe('metric editable landscape',()=>{
  it('creates a project-neutral blank site without DreamHouse content',()=>{
    const document=createTerrainDocument();
    expect(document).toMatchObject({width:100,depth:100,resolution:64,protectedRadius:0,cover:'meadow',treeCount:0,rockCount:0});
    expect(document.landforms).toEqual([]);
    expect(document.strokes).toEqual([]);
    expect(terrainHeight(document,0,0)).toBe(0);
  });
  it('keeps the historical DreamHouse terrain in an explicit project preset',()=>{
    const document=createDreamHouseTerrainDocument();
    expect(document).toMatchObject({width:420,depth:420,resolution:96,protectedRadius:73,cover:'woodland',seed:12571,treeCount:110,rockCount:80});
    expect(document.landforms.map(form=>form.id)).toEqual(['north-ridge','west-foothills','east-ridge']);
  });
  it('protects the architectural site while elevating terrain outside the property',()=>{
    const document=createDreamHouseTerrainDocument();
    expect(terrainHeight(document,0,0)).toBe(0);
    expect(terrainHeight(document,-132,-145)).toBeGreaterThan(20);
    expect(terrainHeight(document,141,128)).toBeGreaterThan(20);
    expect(terrainHeight(document,20,20)).toBe(0);
  });
  it('mountain height and footprint respond to numeric edits',()=>{
    const document=createDreamHouseTerrainDocument();
    const mountain=document.landforms[0];
    const original=terrainHeight(document,mountain.x,mountain.z);
    const raised={...document,landforms:[{...mountain,elevation:mountain.elevation*2}]};
    expect(terrainHeight(raised,mountain.x,mountain.z)).toBeGreaterThan(original);
    const moved={...document,landforms:[{...mountain,x:1000,z:1000}]};
    expect(terrainHeight(moved,mountain.x,mountain.z)).toBeCloseTo(0);
  });
  it('adds and reverses sculpt strokes without modifying BIM object geometry',()=>{
    const document=createDreamHouseTerrainDocument();
    const mountain=document.landforms[0];
    const height=terrainHeight(document,mountain.x,mountain.z);
    const next=addSculptStroke(document,mountain.x,mountain.z,10,4,'raise');
    expect(terrainHeight(next,mountain.x,mountain.z)).toBeCloseTo(height+4);
    expect(document.strokes).toHaveLength(0);
    expect(terrainHeight({...next,strokes:next.strokes.slice(0,-1)},mountain.x,mountain.z)).toBeCloseTo(height);
    const flatter=addSculptStroke(next,mountain.x,mountain.z,10,1,'flatten');
    expect(terrainHeight(flatter,mountain.x,mountain.z)).toBeCloseTo(document.baseElevation);
  });
  it('validates native terrain artifacts and imports elevation grids',()=>{
    const document=createTerrainDocument();
    const json=JSON.stringify({...document,imported:{columns:2,rows:2,heights:[0,2,4,6]}});
    const imported=validateTerrainDocument(JSON.parse(json));
    expect(imported.imported?.heights).toEqual([0,2,4,6]);
    expect(terrainHeight({...imported,protectedRadius:0,landforms:[]},-210,-210)).toBeCloseTo(0);
    expect(terrainHeight({...imported,protectedRadius:0,landforms:[]},209,209)).toBeGreaterThan(5);
    expect(()=>validateTerrainDocument({...document,resolution:1000000})).toThrow();
    expect(()=>validateTerrainDocument({...document,landforms:[{...document.landforms[0],radiusX:-1}]})).toThrow();
    expect(()=>validateTerrainDocument({...document,imported:{columns:1024,rows:1024,heights:[]}})).toThrow();
  });
  it('creates real vertex geometry, normals, and instanced scenery',()=>{
    const document=createDreamHouseTerrainDocument();
    const projection=createTerrainProjection(document);
    const p=projection.surface.geometry.getAttribute('position');
    const y=Array.from({length:p.count},(_,i)=>p.getY(i));
    expect(Math.max(...y)).toBeGreaterThan(20);
    expect(Math.min(...y)).toBeLessThanOrEqual(0);
    expect(projection.root.children.some(c=>c.name.includes('tree'))).toBe(true);
    expect(projection.root.children.some(c=>c.name.includes('rock'))).toBe(true);
    projection.dispose();
  });
  it('supports explicit new landforms and stable serialization',()=>{
    const source=createTerrainDocument();
    const next=addLandform(source,'valley');
    const target=next.landforms.at(-1)!;
    expect(target.elevation).toBeLessThan(0);
    expect(validateTerrainDocument(JSON.parse(JSON.stringify(next)))).toEqual(next);
  });
});
