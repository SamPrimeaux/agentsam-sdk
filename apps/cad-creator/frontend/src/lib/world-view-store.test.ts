import {describe,expect,it} from 'vitest';
import {WORLD_ENVIRONMENT_PRESETS,registerWorldView,worldView} from './world-view-store';

describe('world environment presets',()=>{
  it('provides unique presets with valid THREE.Sky shader ranges',()=>{
    expect(new Set(WORLD_ENVIRONMENT_PRESETS.map(preset=>preset.id)).size).toBe(WORLD_ENVIRONMENT_PRESETS.length);
    expect(WORLD_ENVIRONMENT_PRESETS.map(preset=>preset.id)).toEqual(['daylight','overcast','golden-hour','studio']);
    for(const preset of WORLD_ENVIRONMENT_PRESETS){
      expect(preset.skyTurbidity).toBeGreaterThanOrEqual(1);
      expect(preset.skyTurbidity).toBeLessThanOrEqual(10);
      expect(preset.skyRayleigh).toBeGreaterThanOrEqual(0);
      expect(preset.skyRayleigh).toBeLessThanOrEqual(4);
      expect(preset.skyMieCoefficient).toBeGreaterThanOrEqual(0);
      expect(preset.skyMieCoefficient).toBeLessThanOrEqual(0.1);
      expect(preset.skyMieDirectionalG).toBeGreaterThanOrEqual(0);
      expect(preset.skyMieDirectionalG).toBeLessThanOrEqual(1);
    }
  });

  it('routes environment preset and atmospheric controls to the active viewport',()=>{
    const calls:Array<[string,unknown]> = [];
    const unregister=registerWorldView(()=>({
      setEnvironmentPreset:id=>calls.push(['preset',id]),
      setCameraFov:value=>calls.push(['fov',value]),
      setSkyTurbidity:value=>calls.push(['turbidity',value]),
      setSkyRayleigh:value=>calls.push(['rayleigh',value]),
      setSkyMieCoefficient:value=>calls.push(['mie',value]),
      setSkyMieDirectionalG:value=>calls.push(['directionality',value]),
    }));
    worldView.setEnvironmentPreset('overcast');
    worldView.setCameraFov(62);
    worldView.setSkyTurbidity(8.5);
    worldView.setSkyRayleigh(1.25);
    worldView.setSkyMieCoefficient(0.018);
    worldView.setSkyMieDirectionalG(0.74);
    expect(calls).toEqual([
      ['preset','overcast'],['fov',62],['turbidity',8.5],['rayleigh',1.25],['mie',0.018],['directionality',0.74],
    ]);
    unregister();
  });
});
