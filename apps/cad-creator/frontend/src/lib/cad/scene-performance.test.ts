import {describe,it,expect} from 'vitest';
import {renderQualityPixelRatio} from './scene-performance';
describe('CAD scene renderer presets',()=>{
 it('limits the WebGL resolution without altering the model',()=>{
  expect(renderQualityPixelRatio('performance',2)).toBe(1);
  expect(renderQualityPixelRatio('balanced',2)).toBe(1.5);
  expect(renderQualityPixelRatio('quality',2)).toBe(2);
  expect(renderQualityPixelRatio('quality',1)).toBe(1);
 });
});
