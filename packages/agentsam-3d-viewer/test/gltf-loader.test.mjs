import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfiguredGLTFLoader,DEFAULT_DRACO_DECODER_PATH} from '../src/gltf-loader.js';

function fakeRuntime(){
  const events={dracoCreated:0,preloaded:0};
  class FakeDracoLoader{
    constructor(){events.dracoCreated++;}
    setDecoderPath(path){this.decoderPath=path;}
    preload(){events.preloaded++;}
  }
  class FakeGLTFLoader{
    setDRACOLoader(loader){this.draco=loader;}
    setWithCredentials(value){this.withCredentials=value;}
    setCrossOrigin(value){this.crossOrigin=value;}
  }
  return {runtime:{GLTFLoader:FakeGLTFLoader,DRACOLoader:FakeDracoLoader},events};
}

test('configured GLTF loaders share one versioned Draco decoder per constructor and path',()=>{
  const {runtime,events}=fakeRuntime();
  const first=createConfiguredGLTFLoader(runtime);
  const second=createConfiguredGLTFLoader(runtime);
  assert.ok(first instanceof runtime.GLTFLoader);
  assert.ok(second instanceof runtime.GLTFLoader);
  assert.notEqual(first,second);
  assert.equal(first.draco,second.draco);
  assert.equal(first.draco.decoderPath,DEFAULT_DRACO_DECODER_PATH);
  assert.deepEqual(events,{dracoCreated:1,preloaded:1});
});

test('configured loader preserves host credentials and cross-origin settings',()=>{
  const {runtime}=fakeRuntime();
  const loader=createConfiguredGLTFLoader(runtime,{withCredentials:true,crossOrigin:'use-credentials'});
  assert.equal(loader.withCredentials,true);
  assert.equal(loader.crossOrigin,'use-credentials');
});

test('Draco can be disabled explicitly for an intentionally uncompressed asset path',()=>{
  const {runtime}=fakeRuntime();
  const loader=createConfiguredGLTFLoader(runtime,{draco:false,withCredentials:false});
  assert.equal(loader.draco,undefined);
  assert.equal(loader.withCredentials,false);
});

test('required Draco fails explicitly when the host did not supply a decoder constructor',()=>{
  class FakeGLTFLoader{}
  assert.throws(()=>createConfiguredGLTFLoader({GLTFLoader:FakeGLTFLoader},{requireDraco:true}),/agentsam_3d_draco_loader_required/);
});
