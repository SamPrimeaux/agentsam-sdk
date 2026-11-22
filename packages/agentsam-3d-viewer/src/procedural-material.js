/** Create the same procedural PBR material used by SamScene, with host Three.js injected. */
export function createProceduralPbrMaterial(THREE, preset, textures, isSoftwareGl = false) {
  let map = null;
  let bumpMap = null;
  let roughnessMap = textures.brushedRoughness;
  let emissiveMap = null;

  switch (preset.patternType) {
    case 'brushed-metal':
      bumpMap = textures.brushedRoughness;
      roughnessMap = textures.brushedRoughness;
      break;
    case 'hammered-copper':
      bumpMap = textures.hammeredBump;
      roughnessMap = textures.hammeredBump;
      break;
    case 'hex-carbon':
      map = textures.hexDeckBump;
      bumpMap = textures.hexDeckBump;
      roughnessMap = textures.hexDeckBump;
      break;
    case 'veined-marble':
      map = textures.marbleVeinMap;
      bumpMap = textures.marbleVeinMap;
      roughnessMap = textures.stoneBump;
      break;
    case 'walnut-grain':
      map = textures.walnutGrainMap;
      bumpMap = textures.walnutGrainMap;
      roughnessMap = textures.brushedRoughness;
      break;
    case 'lava-basalt':
      bumpMap = textures.stoneBump;
      roughnessMap = textures.stoneBump;
      emissiveMap = textures.lavaFissureMap;
      break;
    case 'frosted-crystal':
      bumpMap = textures.waterRippleBump;
      roughnessMap = null;
      break;
    case 'wood-panel':
      map = textures.walnutGrainMap;
      bumpMap = textures.walnutGrainMap;
      roughnessMap = textures.brushedRoughness;
      break;
    case 'architectural-brick':
    case 'concrete':
    case 'slate':
    case 'polished-concrete':
      bumpMap = textures.stoneBump;
      roughnessMap = textures.stoneBump;
      break;
    case 'anodized-frame':
      bumpMap = textures.brushedRoughness;
      roughnessMap = textures.brushedRoughness;
      break;
    case 'clear-glass':
    case 'ceramic':
    case 'iridescent-pearl':
      bumpMap = null;
      roughnessMap = null;
      break;
  }

  const useTransmission = !isSoftwareGl && preset.transmission > 0;
  const material = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(preset.colorHex),
    map,
    bumpMap,
    bumpScale: preset.bumpScale,
    roughnessMap,
    metalness: preset.metalness,
    roughness: preset.roughness,
    clearcoat: preset.clearcoat,
    clearcoatRoughness: preset.clearcoatRoughness,
    iridescence: preset.iridescence,
    anisotropy: preset.anisotropy,
    emissive: new THREE.Color(preset.emissiveHex),
    emissiveMap,
    emissiveIntensity: preset.emissiveIntensity,
    transmission: useTransmission ? preset.transmission : 0,
    transparent: preset.transmission > 0,
    opacity: isSoftwareGl && preset.transmission > 0 ? 0.56 : (preset.opacity ?? 1),
    ior: preset.ior,
    thickness: preset.thickness ?? (preset.transmission > 0 ? 0.32 : 0),
    attenuationColor: new THREE.Color(preset.secondaryHex),
    attenuationDistance: 0.45,
  });
  material.userData.pbrPresetId = preset.id;
  material.userData.pbrLabel = preset.label;
  return material;
}
