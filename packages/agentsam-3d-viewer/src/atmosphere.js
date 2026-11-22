/**
 * Shared studio atmosphere presets (lighting moods).
 *
 * Mined verbatim from the SamSpeaks studio so every AgentSam 3D surface
 * (showcase, CAD viewports, SamSketch scenes) lights from one source of
 * truth instead of maintaining private mood tables. Values are renderer
 * units: 0-0xffffff hex colors, densities, intensities and an exposure.
 * Pure data: no Three.js import, no framework coupling.
 */
export const ATMOSPHERE_PRESETS = Object.freeze([
  {
    id: 'studio',
    label: 'Studio',
    swatchHex: '#0a84ff',
    fogColor: 0x131314,
    fogDensity: 0.05,
    keyColor: 0xfff0da,
    keyIntensity: 2.6,
    hemiSky: 0xd0e2ff,
    hemiGround: 0x171719,
    hemiIntensity: 1.15,
    rimColor: 0x409cff,
    rimIntensity: 1.35,
    exposure: 1.12,
  },
  {
    id: 'sunset',
    label: 'Golden',
    swatchHex: '#e69951',
    fogColor: 0x211415,
    fogDensity: 0.06,
    keyColor: 0xffb36b,
    keyIntensity: 3.1,
    hemiSky: 0xffcda3,
    hemiGround: 0x26161b,
    hemiIntensity: 1.05,
    rimColor: 0xff6e54,
    rimIntensity: 1.5,
    exposure: 1.18,
  },
  {
    id: 'twilight',
    label: 'Twilight',
    swatchHex: '#6e76d6',
    fogColor: 0x0e1026,
    fogDensity: 0.075,
    keyColor: 0xb7c6ff,
    keyIntensity: 2.1,
    hemiSky: 0x7d8be8,
    hemiGround: 0x0e1020,
    hemiIntensity: 1.0,
    rimColor: 0x9c7aff,
    rimIntensity: 1.9,
    exposure: 1.08,
  },
  {
    id: 'noir',
    label: 'Noir',
    swatchHex: '#434b5c',
    fogColor: 0x06080d,
    fogDensity: 0.085,
    keyColor: 0xf4f7ff,
    keyIntensity: 3.2,
    hemiSky: 0x5c6882,
    hemiGround: 0x080a0f,
    hemiIntensity: 0.65,
    rimColor: 0x4cc9f0,
    rimIntensity: 2.1,
    exposure: 1.04,
  },
  {
    id: 'dawn',
    label: 'Dawn',
    swatchHex: '#5fc29c',
    fogColor: 0x101c1c,
    fogDensity: 0.052,
    keyColor: 0xffe8cc,
    keyIntensity: 2.5,
    hemiSky: 0xa6ebd6,
    hemiGround: 0x16241f,
    hemiIntensity: 1.25,
    rimColor: 0x5be3b7,
    rimIntensity: 1.4,
    exposure: 1.16,
  },
].map(Object.freeze));

export const ATMOSPHERE_MAP = Object.freeze(
  Object.fromEntries(ATMOSPHERE_PRESETS.map((preset) => [preset.id, preset]))
);
