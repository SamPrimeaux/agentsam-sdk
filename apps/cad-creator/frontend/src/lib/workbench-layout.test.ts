import {describe,expect,it} from 'vitest';
import {resizePanelPercent} from './workbench-layout';

describe('CAD workspace panel resizing',()=>{
  it('converts pointer movement to a bounded percentage of the actual workbench container',()=>{
    expect(resizePanelPercent(20,256,2560,23)).toBe(30);
    expect(resizePanelPercent(20,-1024,2560,23)).toBe(7.03);
  });
  it('preserves a 320px flexible viewport when the opposite panel is expanded',()=>{
    const next=resizePanelPercent(20,900,900,42);
    expect(next).toBeCloseTo((900-42/100*900-320-16)/900*100,1);
    expect(next+42+320/900*100+16/900*100).toBeLessThanOrEqual(100.1);
  });
  it('does not change dimensions for a collapsed or unmeasured container',()=>{
    expect(resizePanelPercent(20,100,0,23)).toBe(20);
  });
});
