import test from 'node:test';
import assert from 'node:assert/strict';
import { STUDIO_FINISH_PRESETS, STUDIO_FINISH_MAP, ATMOSPHERE_PRESETS, ATMOSPHERE_MAP, createStrokeTubeGeometry } from '../src/index.js';

test('shared studio catalogs have stable ids and immutable entries',()=>{
  assert.deepEqual(STUDIO_FINISH_PRESETS.map(p=>p.id),['gold','titanium','obsidian','copper','iridescent']);
  for(const [presets,map] of [[STUDIO_FINISH_PRESETS,STUDIO_FINISH_MAP],[ATMOSPHERE_PRESETS,ATMOSPHERE_MAP]]){
    assert.ok(Object.isFrozen(presets)); assert.ok(Object.isFrozen(map));
    for(const preset of presets){assert.equal(map[preset.id],preset);assert.ok(Object.isFrozen(preset));}
  }
  assert.equal(STUDIO_FINISH_MAP.gold.color,0xe8b954);
  assert.equal(STUDIO_FINISH_MAP.iridescent.iridescence,1);
});
test('brush tube preserves host points, radius and tessellation',()=>{
  class CatmullRomCurve3 { constructor(points){this.points=points;} }
  class TubeGeometry { constructor(...args){this.args=args;} }
  const THREE={CatmullRomCurve3,TubeGeometry};
  const points=[{},{}];
  const tube=createStrokeTubeGeometry(THREE,points,{radius:.011,segments:220});
  assert.equal(tube.args[0].points,points);
  assert.deepEqual(tube.args.slice(1),[220,.011,8,false]);
  assert.deepEqual(createStrokeTubeGeometry(THREE,points,{radius:.036,segments:12,radialSegments:10}).args.slice(1),[12,.036,10,false]);
});
