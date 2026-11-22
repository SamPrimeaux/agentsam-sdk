import {describe,expect,it} from 'vitest';
import {resolveCadLighting,updateCadLightingProject,cadTimeOfDayLighting} from './lighting';
import type {ProjectState} from './types';

const project={id:'p',name:'Project',scale:1,gridSize:12,snapToGrid:true,walls:[],doors:[],windows:[],furniture:[],rooms:[],annotations:[],lighting:{sunAltitude:40,sunAzimuth:130,intensity:1.2,timeOfDay:'morning',shadows:true,ambientColor:'#eeeeee'},roofType:'none',ceilingHeight:108,updatedAt:1,version:1} as ProjectState;

describe('canonical CAD lighting',()=>{
  it('resolves old world-renderer settings over the legacy plan-view settings during migration',()=>{
    const legacy={...project,sceneSettings:{sunAltitude:12,sunAzimuth:240,sun:.9,ambient:.42,daylight:false,sky:false,sunColor:'#ffb36b',shadowBias:-.001,projection:'orthographic' as const,clipNear:.1,clipFar:900}};
    expect(resolveCadLighting(legacy)).toMatchObject({sunAltitude:12,sunAzimuth:240,intensity:.9,ambientIntensity:.42,timeOfDay:'sunset',skyVisible:false,sunColor:'#ffb36b',shadowBias:-.001});
  });
  it('uses canonical project lighting after the first edit and removes only legacy lighting keys',()=>{
    const legacy={...project,sceneSettings:{sunAltitude:12,sunAzimuth:240,sun:.9,ambient:.42,daylight:false,sky:false,shadowBias:-.001,projection:'orthographic' as const,clipNear:.1,clipFar:900,terrain:{schema:'terrain'},lights:[{id:'key',name:'Key',kind:'point' as const,color:'#ffffff',intensity:1,position:[0,2,0] as [number,number,number],target:[0,0,0] as [number,number,number],range:10,cone:30,shadows:true}]}};
    const next=updateCadLightingProject(legacy,{sunAltitude:62,ambientIntensity:.7});
    expect(next.lighting).toMatchObject({sunAltitude:62,ambientIntensity:.7});
    expect(next.sceneSettings).toMatchObject({projection:'orthographic',clipNear:.1,clipFar:900,terrain:{schema:'terrain'},lights:[{id:'key',name:'Key',kind:'point' as const,color:'#ffffff',intensity:1,position:[0,2,0] as [number,number,number],target:[0,0,0] as [number,number,number],range:10,cone:30,shadows:true}]});
    expect(next.sceneSettings).not.toHaveProperty('sunAltitude');
    expect(next.sceneSettings).not.toHaveProperty('sun');
    expect(resolveCadLighting(next)).toMatchObject({sunAltitude:62,ambientIntensity:.7,skyVisible:false});
    expect(legacy.sceneSettings).toHaveProperty('sunAltitude',12);
  });
  it('provides stable defaults for documents without either legacy configuration',()=>{
    expect(resolveCadLighting()).toMatchObject({sunAltitude:54,sunAzimuth:55,intensity:1,ambientIntensity:.55,skyVisible:true,toneMapping:'aces'});
  });
});

it('applies a selected time of day as physical lighting and preserves an explicit later edit',()=>{
  const sunset=updateCadLightingProject(project,cadTimeOfDayLighting('sunset'));
  expect(resolveCadLighting(sunset)).toMatchObject({timeOfDay:'sunset',sunAltitude:12,sunColor:'#ffb36b',ambientIntensity:.42});
  const edited=updateCadLightingProject(sunset,{sunAltitude:25});
  expect(resolveCadLighting(edited)).toMatchObject({timeOfDay:'sunset',sunAltitude:25});
});
