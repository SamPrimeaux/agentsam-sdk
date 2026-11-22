import test from 'node:test';
import assert from 'node:assert/strict';
import {PROCEDURAL_PBR_MATERIALS,PROCEDURAL_PBR_MATERIAL_MAP} from '../src/pbr-materials.js';
import {createProceduralPbrMaterial} from '../src/procedural-material.js';

class FakeColor { constructor(value){this.value=value;} }
class FakePhysicalMaterial {
  constructor(options){this.options=options;this.userData={};}
}
const THREE={Color:FakeColor,MeshPhysicalMaterial:FakePhysicalMaterial};
const textures={
  brushedRoughness:{id:'brush'},micGrillBump:{id:'grille'},stoneBump:{id:'stone'},
};

test('mined SamSpeaks studio recipes are shared presets',()=>{
  for(const id of ['pbr-studio-travertine','pbr-studio-perforated-mesh']){
    const preset=PROCEDURAL_PBR_MATERIAL_MAP[id];
    assert.ok(preset,`${id} registered`);
    assert.equal(PROCEDURAL_PBR_MATERIALS.filter(item=>item.id===id).length,1);
  }
});

test('travertine renders matte stone on the shared brushed map',()=>{
  const preset=PROCEDURAL_PBR_MATERIAL_MAP['pbr-studio-travertine'];
  const material=createProceduralPbrMaterial(THREE,preset,textures,false);
  assert.ok(material instanceof FakePhysicalMaterial);
  assert.equal(material.options.map,null);
  assert.equal(material.options.bumpMap,textures.brushedRoughness);
  assert.equal(material.options.roughnessMap,textures.brushedRoughness);
  assert.equal(material.options.metalness,0.02);
  assert.equal(material.options.roughness,0.82);
  assert.equal(material.options.bumpScale,0.003);
  assert.equal(material.userData.pbrPresetId,'pbr-studio-travertine');
});

test('perforated mesh renders on the shared grille bump map',()=>{
  const preset=PROCEDURAL_PBR_MATERIAL_MAP['pbr-studio-perforated-mesh'];
  for(const isSoftwareGl of [false,true]){
    const material=createProceduralPbrMaterial(THREE,preset,textures,isSoftwareGl);
    assert.equal(material.options.bumpMap,textures.micGrillBump);
    assert.equal(material.options.roughnessMap,textures.micGrillBump);
    assert.equal(material.options.metalness,0.86);
  }
});
