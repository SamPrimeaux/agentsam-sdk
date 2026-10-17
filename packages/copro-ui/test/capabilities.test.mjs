import test from 'node:test';
import assert from 'node:assert/strict';
import {CAPABILITIES,SURFACE_CAPABILITIES,resolveCapabilities,canDo,EDITOR_ACTION_CAPABILITIES} from '../dist/capabilities.js';

test('MovieMode uses one structured canonical capability registry across all ten surfaces',()=>{
  const ids=Object.keys(CAPABILITIES);
  assert.ok(ids.length >= 35);
  for(const id of ids){
    assert.match(id,/^[a-z]+\.[a-z_]+\.[a-z_]+$/);
    const c=CAPABILITIES[id];
    assert.ok(c.help && c.handler && c.scope && c.approval && c.actors.length,id);
    assert.ok(SURFACE_CAPABILITIES[c.surface].includes(id),id);
    for(const dep of c.requires??[])assert.ok(CAPABILITIES[dep],`${id} depends on missing ${dep}`);
  }
  for(const id of Object.values(EDITOR_ACTION_CAPABILITIES)) assert.ok(CAPABILITIES[id],id);
});

test('agentic edits require registered handlers and explicit grants even when the GUI works',()=>{
  const runtime={handlers:new Set(['inspector.video.transform','timeline.clip.split']),granted:new Set()};
  assert.equal(canDo(runtime,'inspector.video.transform','agent').reason,'approval');
  assert.equal(canDo(runtime,'timeline.clip.split','user').enabled,true);
  assert.equal(canDo(runtime,'generation.video.create','agent').reason,'handler');
  const granted={...runtime,granted:new Set(['inspector.video.transform'])};
  assert.equal(canDo(granted,'inspector.video.transform','agent').enabled,true);
  assert.equal(canDo(granted,'timeline.clip.split','agent').enabled,false);
});

test('verified remote operations, authorization and dependencies are independent gates',()=>{
  const runtime={
    handlers:new Set(['generation.video.create','agent.proposal.create','agent.proposal.apply']),
    verified:new Set(['generation.video.create','agent.proposal.create','agent.proposal.apply']),
    granted:new Set(['generation.video.create','agent.proposal.apply']),
  };
  assert.equal(canDo(runtime,'generation.video.create','agent').enabled,true);
  assert.equal(canDo({...runtime,verified:new Set()},'generation.video.create','agent').reason,'verification');
  assert.equal(canDo(runtime,'agent.proposal.apply','agent').enabled,true);
  assert.equal(canDo({...runtime,handlers:new Set(['agent.proposal.apply'])},'agent.proposal.apply','agent').reason,'dependency');
  assert.equal(canDo(runtime,'generation.video.create','system').reason,'actor');
});
