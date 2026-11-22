import type {CadSceneSettings,LightingConfig,ProjectState} from './types';

export interface ResolvedCadLighting extends LightingConfig {
  ambientIntensity:number;
  sunColor:string;
  skyColor:string;
  groundColor:string;
  skyVisible:boolean;
  environmentPresetId:string;
  skyTurbidity:number;
  skyRayleigh:number;
  skyMieCoefficient:number;
  skyMieDirectionalG:number;
  exposure:number;
  shading:'lit'|'color';
  shadowQuality:'low'|'medium'|'high';
  toneMapping:'aces'|'reinhard'|'neutral'|'none';
  shadowBias:number;
}

export const DEFAULT_CAD_LIGHTING:ResolvedCadLighting={
  sunAltitude:54,sunAzimuth:55,intensity:1,timeOfDay:'noon',shadows:true,ambientColor:'#ffffff',
  ambientIntensity:.55,sunColor:'#fff0d7',skyColor:'#dceeff',groundColor:'#53644d',skyVisible:true,
  environmentPresetId:'daylight',skyTurbidity:3.5,skyRayleigh:2.1,skyMieCoefficient:.005,skyMieDirectionalG:.78,
  exposure:.72,shading:'lit',shadowQuality:'high',toneMapping:'aces',shadowBias:-.0002,
};

/**
 * Read adapter for pre-unification documents. CadSceneSettings historically owned
 * the world renderer's values while LightingConfig owned Viewport3D's values.
 * Scene values win only during legacy resolution; all new writes use LightingConfig.
 */
export function resolveCadLighting(project?:Pick<ProjectState,'lighting'|'sceneSettings'>|null):ResolvedCadLighting{
  const base={...DEFAULT_CAD_LIGHTING,...(project?.lighting??{})};
  const legacy=project?.sceneSettings??{};
  return {
    ...base,
    sunAltitude:legacy.sunAltitude??base.sunAltitude,
    sunAzimuth:legacy.sunAzimuth??base.sunAzimuth,
    intensity:legacy.sun??base.intensity,
    timeOfDay:legacy.daylight===undefined?base.timeOfDay:(legacy.daylight?'noon':'sunset'),
    shadows:legacy.shadows??base.shadows,
    ambientIntensity:legacy.ambient??base.ambientIntensity,
    sunColor:legacy.sunColor??base.sunColor,
    skyColor:legacy.skyColor??base.skyColor,
    groundColor:legacy.groundColor??base.groundColor,
    skyVisible:legacy.sky??base.skyVisible,
    environmentPresetId:legacy.environmentPresetId??base.environmentPresetId,
    skyTurbidity:legacy.skyTurbidity??base.skyTurbidity,
    skyRayleigh:legacy.skyRayleigh??base.skyRayleigh,
    skyMieCoefficient:legacy.skyMieCoefficient??base.skyMieCoefficient,
    skyMieDirectionalG:legacy.skyMieDirectionalG??base.skyMieDirectionalG,
    exposure:legacy.exposure??base.exposure,
    shading:legacy.shading??base.shading,
    shadowQuality:legacy.shadowQuality??base.shadowQuality,
    toneMapping:legacy.toneMapping??base.toneMapping,
    shadowBias:legacy.shadowBias??base.shadowBias,
  };
}

const LEGACY_LIGHTING_KEYS=new Set<keyof CadSceneSettings>([
  'shadowBias','shading','exposure','sun','ambient','sky','daylight','sunAltitude','sunAzimuth',
  'sunColor','skyColor','groundColor','environmentPresetId','skyTurbidity','skyRayleigh',
  'skyMieCoefficient','skyMieDirectionalG','shadows','shadowQuality','toneMapping',
]);

/** Canonical write path: migrate legacy scene values and keep camera/site/placed-light data intact. */
export function updateCadLightingProject(project:ProjectState,updates:Partial<ResolvedCadLighting>):ProjectState{
  const lighting:ResolvedCadLighting={...resolveCadLighting(project),...updates};
  if(!project.sceneSettings)return {...project,lighting};
  const sceneSettings=Object.fromEntries(Object.entries(project.sceneSettings).filter(([key])=>!LEGACY_LIGHTING_KEYS.has(key as keyof CadSceneSettings))) as CadSceneSettings;
  return {...project,lighting,sceneSettings:Object.keys(sceneSettings).length?sceneSettings:undefined};
}

/** Explicit time changes update the physical light recipe; reading a saved project never does. */
export function cadTimeOfDayLighting(timeOfDay:LightingConfig['timeOfDay']):Partial<ResolvedCadLighting>{
  const presets={morning:{sunAltitude:24,sunAzimuth:75,sunColor:'#ffedd5',skyColor:'#b5cbe7',ambientIntensity:.7},noon:{sunAltitude:54,sunAzimuth:55,sunColor:'#fff0d7',skyColor:'#dceeff',ambientIntensity:.55},sunset:{sunAltitude:12,sunAzimuth:240,sunColor:'#ffb36b',skyColor:'#f0a06a',ambientIntensity:.42},night:{sunAltitude:10,sunAzimuth:210,sunColor:'#38bdf8',skyColor:'#020617',ambientIntensity:.2}};
  return {timeOfDay,...presets[timeOfDay],environmentPresetId:'custom'};
}
