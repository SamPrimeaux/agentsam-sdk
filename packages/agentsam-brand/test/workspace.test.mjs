import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeBrandWorkspace,
  brandColors,
  brandContrast,
  renderBrandCoverSvg,
  renderCreationTileSvg,
} from '../src/workspace.js';

const tokens = [
  {name:'surface', value:'#101214', usage:'base canvas'},
  {name:'ink', value:'#f4f4f4', usage:'primary text'},
  {name:'accent', value:'#2e8e54', usage:'primary actions'},
  {name:'rule', value:'{ink}', usage:'high contrast rule'},
];

test('workspace does not fabricate brands or approvals', () => {
  assert.deepEqual(normalizeBrandWorkspace({}).brands, []);
  const data = normalizeBrandWorkspace({latestContract:{id:'inneranimalmedia',status:'draft',name:'Inner Animal Media'}});
  assert.equal(data.brands.length, 1);
  assert.equal(data.brands[0].status, 'draft');
  assert.equal(data.activeBrandId, null);
});

test('workspace lists multiple independently named brands without merging identities', () => {
  const data = normalizeBrandWorkspace({
    workspaceId:'a',activeBrandId:'two',
    brands:[
      {id:'one',name:'First brand',colors:tokens,status:'approved'},
      {id:'two',name:'Second brand',colors:tokens,status:'draft'},
      {id:'one',name:'Duplicate',colors:tokens},
    ],
  });
  assert.deepEqual(data.brands.map(brand=>brand.id), ['one','two']);
  assert.deepEqual(data.brands.map(brand=>brand.status), ['approved','draft']);
  assert.equal(data.activeBrandId, 'two');
});

test('a list of saved contracts keeps each real resolved palette', () => {
  const data = normalizeBrandWorkspace({brandContracts:[{
    id:'realbrand',name:'Real brand',status:'approved',
    visual_system:{colors:{resolved:{ink:{value:'#fff'},surface:{value:'#111'},accent:{value:'#080'}}}},
  }]});
  assert.deepEqual(brandColors(data.brands[0].colors).map(c=>c.name), ['ink','surface','accent']);
});

test('colors preserve exact source values and reject unsupported CSS expression', () => {
  const out=brandColors([...tokens,{name:'unknown',value:'color-mix(in srgb, red, blue)',usage:'never'}]);
  assert.deepEqual(out.map(c=>c.name),['surface','ink','accent','rule']);
  assert.equal(out[3].value,'#f4f4f4');
  assert.equal(out[0].usage,'base canvas');
});

test('theme variants never overwrite the default source palette', () => {
  const palette=[{name:'accent',value:'#228833',usage:'action',themes:{night:'#4dd777'}}];
  assert.equal(brandColors(palette)[0].value,'#228833');
  assert.equal(brandColors(palette,'night')[0].value,'#4dd777');
  assert.equal(brandColors(palette)[0].value,'#228833');
});

test('invalid and cyclic aliases cannot turn into CSS or SVG output', () => {
  assert.deepEqual(brandColors([
    {name:'first',value:'{second}'}, {name:'second',value:'{first}'},
    {name:'evil',value:'url(javascript:alert(1))'},
  ]),[]);
});

test('brand cover is deterministic, escaped and source-bound', () => {
  const options={id:'real-brand',name:'Real & Better',tagline:'A <verified> value',colors:tokens};
  const cover=renderBrandCoverSvg(options);
  assert.equal(cover,renderBrandCoverSvg(options));
  assert.match(cover,/Real &amp; Better/);
  assert.match(cover,/A &lt;verified&gt; value/);
  assert.match(cover,/<svg /);
  assert.doesNotMatch(cover,/gradient|foreignObject|<script/);
});

test('brand cover refuses insufficient or unverified contrast', () => {
  assert.equal(renderBrandCoverSvg({name:'Brand',colors:[{name:'ink',value:'#fff'}]}),null);
  assert.equal(renderBrandCoverSvg({name:'Brand',colors:[
    {name:'surface',value:'#eeeeee'}, {name:'ink',value:'#dddddd'}, {name:'accent',value:'#cccccc'},
  ]}),null);
  assert.ok((brandContrast('#111111','#ffffff')||0)>4.5);
});

test('creation tiles are deterministic vector shapes without baked brand colors', () => {
  for(const type of ['slides','design','code','system','whiteboard']){
    const tile=renderCreationTileSvg({type,tint:'#292929',ink:'#fefefe'});
    assert.equal(tile,renderCreationTileSvg({type,tint:'#292929',ink:'#fefefe'}));
    assert.match(tile,/fill="#292929"/);
    assert.match(tile,/aria-label=/);
  }
  assert.equal(renderCreationTileSvg({type:'design',tint:'url(javascript:bad)',ink:'#fff'}),null);
});
