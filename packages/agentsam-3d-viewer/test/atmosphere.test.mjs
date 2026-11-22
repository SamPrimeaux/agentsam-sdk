import test from 'node:test';
import assert from 'node:assert/strict';
import {ATMOSPHERE_PRESETS,ATMOSPHERE_MAP} from '../src/atmosphere.js';

test('studio atmosphere catalog is shared, unique and range-valid',()=>{
  assert.equal(ATMOSPHERE_PRESETS.length,5);
  assert.equal(new Set(ATMOSPHERE_PRESETS.map(item=>item.id)).size,ATMOSPHERE_PRESETS.length);
  for(const preset of ATMOSPHERE_PRESETS){
    assert.equal(ATMOSPHERE_MAP[preset.id],preset);
    for(const key of ['fogColor','keyColor','hemiSky','hemiGround','rimColor'])
      assert.ok(Number.isInteger(preset[key])&&preset[key]>=0&&preset[key]<=0xffffff,`${preset.id}.${key}`);
    for(const key of ['fogDensity','keyIntensity','hemiIntensity','rimIntensity','exposure'])
      assert.ok(preset[key]>0&&preset[key]<10,`${preset.id}.${key}`);
    assert.match(preset.swatchHex,/^#[0-9a-f]{6}$/i,`${preset.id}.swatchHex`);
    assert.equal(typeof preset.label,'string');
  }
});
