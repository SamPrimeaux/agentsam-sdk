/** CoPro stage/look metadata. This is a composited 2D stage backdrop, not a 3D PBR material. */
export type CoProStageEnvironment = {
  background?: string;
  ambient?: number;
  fogColor?: string;
  fogOpacity?: number;
  showGrid?: boolean;
  skyPreset?: string;
  finish?: string;
  cloudDensity?: number;
  stars?: boolean;
  glow?: boolean;
  lightHue?: number;
  shadowSoftness?: number;
  keyAngle?: number;
};
export const STAGE_ENVIRONMENT_DEFAULTS = Object.freeze({
  background: '#191919', ambient: 1, fogColor: '#999999', fogOpacity: 0, showGrid: false,
  skyPreset: 'studio', finish: 'cryo-titanium', cloudDensity: .26,
  stars: false, glow: true, lightHue: 37, shadowSoftness: 2.5, keyAngle: 35,
});
export const STAGE_SKIES = [
  {id:'studio',name:'Studio',note:'Controlled neutral backdrop',top:'#303948',bottom:'#171b25',glow:'#d2dbec'},
  {id:'night',name:'Diurnal Cirrus',note:'Starry night · rose dawn',top:'#202755',bottom:'#b37b99',glow:'#f7aace'},
  {id:'spiral',name:'Spiral Galaxy',note:'Deep-space nebula',top:'#151334',bottom:'#5c4188',glow:'#9f80ed'},
  {id:'aurora',name:'Polar Aurora',note:'Emerald ribbons',top:'#081f30',bottom:'#2e5366',glow:'#53e1b7'},
  {id:'exoplanet',name:'Ringed Exoplanet',note:'Golden space haze',top:'#271e42',bottom:'#ad724d',glow:'#f9b76a'},
  {id:'supernova',name:'Supernova Lens',note:'Plasma glow',top:'#28162c',bottom:'#913653',glow:'#f96a88'},
  {id:'eclipse',name:'Solar Eclipse',note:'Twilight corona',top:'#131925',bottom:'#515977',glow:'#ecd6a8'},
  {id:'cloudbank',name:'Cinema Cloudbank',note:'Cobalt & peach cumulus',top:'#354b80',bottom:'#f4a481',glow:'#fbd9bf'},
] as const;
export const STAGE_FINISHES = [
  {id:'gold',name:'24K Brushed Gold',note:'Warm metallic stage',swatch:'linear-gradient(135deg,#fff1b3,#ab752c 50%,#e9ba59)',color:'#c59b50'},
  {id:'cryo-titanium',name:'Cryo Titanium',note:'Cool satin metal',swatch:'linear-gradient(135deg,#e6edf4,#657586 52%,#c4d0e1)',color:'#798899'},
  {id:'copper',name:'Hammered Copper',note:'Warm copper finish',swatch:'linear-gradient(135deg,#f1c1a1,#844532 55%,#df9671)',color:'#aa674e'},
  {id:'carbon',name:'Hex Carbon Weave',note:'Graphite texture',swatch:'repeating-linear-gradient(45deg,#1d2733 0 3px,#384759 3px 6px)',color:'#2b3544'},
  {id:'calacatta',name:'Calacatta Gold',note:'Light stone',swatch:'linear-gradient(135deg,#f7f5e9,#bcb9ad 48%,#f6e0ae)',color:'#d9d6ca'},
  {id:'marquina',name:'Nero Marquina',note:'Dark mineral',swatch:'linear-gradient(135deg,#131823,#3b4151 50%,#121723)',color:'#222833'},
  {id:'basalt',name:'Magma Basalt',note:'Volcanic charcoal',swatch:'linear-gradient(135deg,#711c24,#1a1c25 54%,#ae503c)',color:'#34232a'},
] as const;
export const STAGE_MOODS = [
  {id:'studio',name:'Studio',skyPreset:'studio',finish:'cryo-titanium',ambient:1,cloudDensity:.26,glow:true,stars:false,lightHue:37},
  {id:'golden',name:'Golden',skyPreset:'exoplanet',finish:'gold',ambient:1.2,cloudDensity:.32,glow:true,stars:false,lightHue:37},
  {id:'twilight',name:'Twilight',skyPreset:'night',finish:'marquina',ambient:.85,cloudDensity:.55,glow:true,stars:true,lightHue:285},
  {id:'noir',name:'Noir',skyPreset:'eclipse',finish:'carbon',ambient:.7,cloudDensity:.12,glow:false,stars:false,lightHue:210},
  {id:'dawn',name:'Dawn',skyPreset:'cloudbank',finish:'calacatta',ambient:1.1,cloudDensity:.64,glow:true,stars:false,lightHue:20},
] as const;
export function stageLookBackground(env:CoProStageEnvironment|undefined): string | undefined {
  if (!env?.skyPreset && !env?.finish) return undefined;
  const sky = STAGE_SKIES.find(item=>item.id===(env.skyPreset??'studio')) ?? STAGE_SKIES[0];
  const finish = STAGE_FINISHES.find(item=>item.id===env.finish) ?? STAGE_FINISHES[1];
  const clouds = Math.max(0,Math.min(1,env.cloudDensity??.26));
  const glow = env.glow !== false;
  const angle = Math.max(-90,Math.min(180,env.keyAngle??35));
  const x = Math.round(45+angle*.18);
  const lightColor=`hsl(${Math.round(Math.max(0,Math.min(360,env.lightHue??37)))} 85% 74% / .40)`;
  return [
    ...(env.stars ? ['radial-gradient(circle at 16% 12%,#ffffff8c 0 1px,transparent 1.8px),radial-gradient(circle at 81% 32%,#ffffff8c 0 1px,transparent 1.8px),radial-gradient(circle at 56% 52%,#ffffff9a 0 1px,transparent 1.8px)'] : []),
    ...(glow ? [`radial-gradient(ellipse at ${x}% 23%,${lightColor},transparent 58%)`,`radial-gradient(ellipse at 62% 45%,color-mix(in srgb,${sky.glow} 27%,transparent),transparent 66%)`] : []),
    `radial-gradient(ellipse at 40% 85%,color-mix(in srgb,${finish.color} ${Math.round(clouds*42)}%,transparent),transparent 70%)`,
    `linear-gradient(165deg,${sky.top} 8%,${sky.bottom} 75%,${finish.color} 125%)`,
  ].join(',');
}
