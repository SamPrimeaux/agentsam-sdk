/** Local PrimeTech UI integration: actual SamScene sky system, not a second copy. */
import { SKY_PRESET_MAP } from '../../../../samscenev2/src/constants.ts';
import type { CoProStageEnvironment } from '@inneranimalmedia/copro-ui';

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

export type SamSceneSkyDefaults = Record<string,Pick<CoProStageEnvironment,
  'skyProgression'|'cloudDensity'|'starIntensity'|'galaxyIntensity'|'auroraIntensity'|'stars'>>;

export const SAMSCENE_SKY_DEFAULTS:SamSceneSkyDefaults=Object.fromEntries(
  Object.entries(SAMSCENE_SKY_IDS).map(([id,preset])=>{
    const v=SKY_PRESET_MAP[preset].config;
    return [id,{
      skyProgression:v.progression,cloudDensity:v.cloudDensity,starIntensity:v.starIntensity,
      galaxyIntensity:v.galaxyIntensity,auroraIntensity:v.auroraIntensity,
      stars:v.starIntensity > 0.01,
    }];
  })
);
