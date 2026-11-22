import test from 'node:test';
import assert from 'node:assert/strict';
import {PROCEDURAL_PBR_MATERIALS,PROCEDURAL_PBR_MATERIAL_MAP,CAD_MATERIAL_PRESET_MAP} from '../src/pbr-materials.js';
import {createProceduralPbrMaterial} from '../src/procedural-material.js';

class FakeColor { constructor(value){this.value=value;} }
class FakePhysicalMaterial {
  constructor(options){this.options=options;this.userData={};}
}
const THREE={Color:FakeColor,MeshPhysicalMaterial:FakePhysicalMaterial};
const textures={brushedRoughness:{id:'brush'},hammeredBump:{id:'hammer'},hexDeckBump:{id:'hex'},marbleVeinMap:{id:'marble'},stoneBump:{id:'stone'},walnutGrainMap:{id:'walnut'},lavaFissureMap:{id:'lava'},waterRippleBump:{id:'ripple'}};

test('SamScene procedural PBR catalog is shared, unique and range-valid',()=>{
  assert.ok(PROCEDURAL_PBR_MATERIALS.length>=10);
  assert.equal(new Set(PROCEDURAL_PBR_MATERIALS.map(item=>item.id)).size,PROCEDURAL_PBR_MATERIALS.length);
  for(const preset of PROCEDURAL_PBR_MATERIALS){
    assert.equal(PROCEDURAL_PBR_MATERIAL_MAP[preset.id],preset);
    for(const key of ['metalness','roughness','clearcoat','clearcoatRoughness','iridescence','transmission'])
      assert.ok(preset[key]>=0&&preset[key]<=1,`${preset.id}.${key}`);
  }
});

test('procedural PBR material factory applies physical parameters and shared texture maps',()=>{
  const preset=PROCEDURAL_PBR_MATERIAL_MAP['pbr-brushed-gold'];
  const material=createProceduralPbrMaterial(THREE,preset,textures,false);
  assert.ok(material instanceof FakePhysicalMaterial);
  assert.equal(material.options.bumpMap,textures.brushedRoughness);
  assert.equal(material.options.roughnessMap,textures.brushedRoughness);
  assert.equal(material.options.metalness,preset.metalness);
  assert.equal(material.options.roughness,preset.roughness);
  assert.equal(material.options.clearcoat,preset.clearcoat);
  assert.equal(material.options.color.value,preset.colorHex);
  assert.equal(material.userData.pbrPresetId,preset.id);
});

test('transmission is disabled for software rendering but keeps a safe opacity fallback',()=>{
  const preset=PROCEDURAL_PBR_MATERIALS.find(item=>item.transmission>0);
  const material=createProceduralPbrMaterial(THREE,preset,textures,true);
  assert.equal(material.options.transmission,0);
  assert.equal(material.options.opacity,0.56);
  assert.equal(material.options.transparent,true);
});

test('legacy CAD material names resolve to the shared PBR catalog',()=>{
  for(const key of ['brick','concrete','wood_panel','hardwood','glass','marble','tile','polished_concrete','steel','door_wood','window_frame']){
    assert.ok(PROCEDURAL_PBR_MATERIAL_MAP[CAD_MATERIAL_PRESET_MAP[key]],`missing preset for ${key}`);
  }
});

test('clear architectural glass retains its source transmission, opacity and thickness values',()=>{
  const preset=PROCEDURAL_PBR_MATERIAL_MAP[CAD_MATERIAL_PRESET_MAP.glass];
  const material=createProceduralPbrMaterial(THREE,preset,textures,false);
  assert.equal(material.options.transmission,0.8);
  assert.equal(material.options.opacity,0.35);
  assert.equal(material.options.thickness,0.5);
});
