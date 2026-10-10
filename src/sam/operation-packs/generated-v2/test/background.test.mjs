import test from 'node:test';
import assert from 'node:assert/strict';
import { removeConnectedBackgroundPixels } from '../background.js';

test('flat-connected removes edge background while preserving non-background island and original', () => {
  const width=7,height=7,pixels=new Uint8ClampedArray(width*height*4);
  for(let i=0;i<width*height;i++) pixels.set([255,255,255,255],i*4);
  for(let y=2;y<5;y++) for(let x=2;x<5;x++) pixels.set([0,0,0,255],(y*width+x)*4);
  const before=Uint8ClampedArray.from(pixels);
  const result=removeConnectedBackgroundPixels(pixels,width,height,{tolerance:20});
  assert.equal(result.removedPixels,40);
  assert.equal(result.pixels[(3*width+3)*4+3],255);
  assert.equal(result.pixels[3],0);
  assert.deepEqual(pixels,before);
});
test('dimensions and RGBA buffers are validated',()=>{
  assert.throws(()=>removeConnectedBackgroundPixels(new Uint8Array(4),2,2),/expected_rgba/);
  assert.throws(()=>removeConnectedBackgroundPixels(new Uint8Array(4),100_000,100_000),/oversized/);
});
