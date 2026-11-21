/** PrimeTech UI integration: the SamScene sky presets, vendored unchanged under ./samscene (origin: samscenev2). */
import { SKY_PRESET_MAP } from './samscene/constants.ts';
import type { CoProStageEnvironment } from '@inneranimalmedia/copro-ui';
import type { SkyPresetId } from './samscene/types.ts';

export const SAMSCENE_SKY_IDS = {
  studio: 'studio-void',
  night: 'diurnal-cloudscape',
  spiral: 'andromeda-nebula',
  aurora: 'aurora-borealis',
  exoplanet: 'exoplanet-rings',
  supernova: 'supernova-remnant',
  eclipse: 'orbital-eclipse',
  cloudbank: 'pastel-anime-sky',
} as const;

/** A saved `skyPreset` is either a CoPro key (legacy) or any SamScene preset id from the registry. */
export const resolveSamSceneSkyId=(key?:string):SkyPresetId=>
  (SAMSCENE_SKY_IDS as Record<string,SkyPresetId>)[key??'']??(key&&key in SKY_PRESET_MAP?key as SkyPresetId:SAMSCENE_SKY_IDS.studio);

export type SamSceneSkyDefaults = Record<string,Pick<CoProStageEnvironment,
  'skyProgression'|'cloudDensity'|'starIntensity'|'galaxyIntensity'|'auroraIntensity'|'stars'>>;

const defaultsFor=(preset:keyof typeof SKY_PRESET_MAP)=>{
  const v=SKY_PRESET_MAP[preset].config;
  return {
    skyProgression:v.progression,cloudDensity:v.cloudDensity,starIntensity:v.starIntensity,
    galaxyIntensity:v.galaxyIntensity,auroraIntensity:v.auroraIntensity,stars:v.starIntensity > 0.01,
  };
};
export const SAMSCENE_SKY_DEFAULTS:SamSceneSkyDefaults={
  ...Object.fromEntries(Object.keys(SKY_PRESET_MAP).map(id=>[id,defaultsFor(id as keyof typeof SKY_PRESET_MAP)])),
  ...Object.fromEntries(Object.entries(SAMSCENE_SKY_IDS).map(([key,preset])=>[key,defaultsFor(preset)])),
};
