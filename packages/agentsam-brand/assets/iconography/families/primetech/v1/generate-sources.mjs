import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.join(here, 'source/p-prime-electric-original.svg');
const sourceSvg = await fs.readFile(sourcePath, 'utf8');
const pathData = [...sourceSvg.matchAll(/<path\s+d="([^"]+)"/g)].map((match) => match[1]);
if (pathData.length !== 5) throw new Error(`primetech_expected_five_facets_found_${pathData.length}`);

const facets = [
  { id: 'facet-top', name: 'Top facet' },
  { id: 'facet-right', name: 'Right facet' },
  { id: 'facet-left', name: 'Left facet' },
  { id: 'facet-lower-left', name: 'Lower-left facet' },
  { id: 'facet-bottom-right', name: 'Bottom-right facet' },
];

const colorways = [
  { id: 'core-mono', name: 'Core Mono', background: '#080A0F', fills: ['#FFFFFF','#FFFFFF','#FFFFFF','#FFFFFF','#FFFFFF'] },
  { id: 'reverse', name: 'Reverse', background: '#FFFFFF', fills: ['#101317','#101317','#101317','#101317','#101317'] },
  { id: 'prime-spectrum', name: 'Prime Spectrum', background: '#0B0D12', fills: ['#FF2D3D','#FF7A1F','#8A4FFF','#22C55E','#00B3F0'] },
  { id: 'prime-electric', name: 'Prime Electric', background: '#08152B', fills: ['#26DFFF','#1479FF','#3867F6','#6451F9','#028FEC'] },
  { id: 'alloy-blue', name: 'Alloy Blue', background: '#11161F', fills: ['#F1F5F9','#B3C0D2','#5E6D83','#317BF5','#0EA5E9'] },
  { id: 'industrial-ember', name: 'Industrial Ember', background: '#160F15', fills: ['#FFB347','#FF762A','#F04438','#D33C69','#F59E0B'] },
  { id: 'lagoon', name: 'Lagoon', background: '#061B26', fills: ['#2DD4BF','#22A4EE','#4875FF','#34D399','#00BFC5'] },
  { id: 'technical-slate', name: 'Technical Slate', background: '#101722', fills: ['#E2E8F0','#CBD5E1','#8B9BB1','#637890','#42A5F5'] },
];

const shapes = [
  { id: 'bare-p', name: 'Bare P', background: 'none', masterTransform: 'translate(53 5) scale(1.02)', microTransform: 'translate(49 1) scale(1.04)' },
  { id: 'circle', name: 'Circle', background: 'circle', masterTransform: 'translate(109 71) scale(0.81)', microTransform: 'translate(102 62) scale(0.84)' },
  { id: 'squircle', name: 'Squircle', background: 'squircle', masterTransform: 'translate(109 71) scale(0.81)', microTransform: 'translate(102 62) scale(0.84)' },
];

function backgroundMarkup(shape, fill) {
  if (shape.background === 'circle') return `<circle id="background" cx="320" cy="320" r="320" fill="${fill}"/>`;
  if (shape.background === 'squircle') return `<rect id="background" x="0" y="0" width="640" height="640" rx="132" fill="${fill}"/>`;
  return '';
}

function makeSvg({ id, label, description, shape, background, fills, transform }) {
  const backgroundSvg = backgroundMarkup(shape, background);
  const paths = pathData.map((d, index) => `<path id="${facets[index].id}" d="${d}" fill="${fills[index]}"/>`).join('\n    ');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" id="${id}" width="640" height="640" viewBox="0 0 640 640" role="img" aria-labelledby="title description">
  <title id="title">${label}</title>
  <desc id="description">${description}</desc>
  ${backgroundSvg}
  <g id="mark" transform="${transform}">
    ${paths}
  </g>
</svg>
`;
}

const sourceDir = path.join(here, 'source');
const sharedDir = path.join(sourceDir, 'shared');
await fs.mkdir(sharedDir, { recursive: true });

for (const shape of shapes) {
  for (const mode of ['light', 'dark']) {
    const fill = mode === 'light' ? '#FFFFFF' : '#101317';
    const background = mode === 'light' ? '#080A0F' : '#FFFFFF';
    const monoShape = { ...shape, background: shape.background };
    const monoSvg = makeSvg({
      id: `${shape.id}-monochrome-${mode}`,
      label: `PrimeTech ${shape.name} monochrome ${mode}`,
      description: `The approved five-facet PrimeTech P in a ${shape.name.toLowerCase()} form, monochrome ${mode}.`,
      shape: monoShape,
      background: shape.background === 'none' ? null : background,
      fills: Array(5).fill(fill),
      transform: shape.masterTransform,
    });
    await fs.writeFile(path.join(sharedDir, `${shape.id}-monochrome-${mode}.svg`), monoSvg);
  }
}

const icons = [];
for (const colorway of colorways) {
  for (const shape of shapes) {
    const id = `${colorway.id}-${shape.id}`;
    const masterSvg = makeSvg({
      id: `${id}-master`,
      label: `PrimeTech ${colorway.name} ${shape.name}`,
      description: `The verified five-facet PrimeTech P. Colorway: ${colorway.name}. Shape: ${shape.name}.`,
      shape,
      background: shape.background === 'none' ? null : colorway.background,
      fills: colorway.fills,
      transform: shape.masterTransform,
    });
    const microSvg = makeSvg({
      id: `${id}-micro`,
      label: `PrimeTech ${colorway.name} ${shape.name} micro icon`,
      description: `Optically enlarged small-size cut of the verified five-facet PrimeTech P. Colorway: ${colorway.name}. Shape: ${shape.name}.`,
      shape,
      background: shape.background === 'none' ? null : colorway.background,
      fills: colorway.fills,
      transform: shape.microTransform,
    });
    const masterFile = `source/${id}-master.svg`;
    const microFile = `source/${id}-micro.svg`;
    await fs.writeFile(path.join(here, masterFile), masterSvg);
    await fs.writeFile(path.join(here, microFile), microSvg);
    const layers = [
      ...(shape.background === 'none' ? [] : [{ id: 'background', name: `${shape.name} background`, role: 'background', fill: colorway.background }]),
      ...facets.map((facet, index) => ({ ...facet, role: 'mark-facet', fill: colorway.fills[index] })),
    ];
    icons.push({
      id,
      name: `PrimeTech ${colorway.name} ${shape.name}`,
      semantic: `primetech.brand.icon.${colorway.id}.${shape.id}`,
      description: `Approved five-facet P / ${colorway.name} / ${shape.name}.`,
      metadata: {
        brand_slug: 'primetech',
        colorway: colorway.id,
        colorway_name: colorway.name,
        shape: shape.id,
        shape_name: shape.name,
        background: shape.background === 'none' ? 'transparent' : colorway.background,
        facet_fills: colorway.fills,
        approved_geometry: 'five-facet-p-v1',
        reference: 'PrimeTech_Brand_Icon_Families_Master_Reference_v1.png',
      },
      layers,
      variants: {
        master: masterFile,
        micro: microFile,
        monochrome_light: `source/shared/${shape.id}-monochrome-light.svg`,
        monochrome_dark: `source/shared/${shape.id}-monochrome-dark.svg`,
      },
    });
  }
}

const manifest = {
  schema: 'agentsam.brand-icon-family.v1',
  family_id: 'primetech-shared-brand-icon-families',
  revision: 'v1',
  name: 'PrimeTech Shared Brand Icon Families',
  metadata: {
    brand_slug: 'primetech',
    brand_name: 'PrimeTech',
    geometry: 'verified-five-facet-p',
    colorway_count: colorways.length,
    shape_count: shapes.length,
    icon_count: icons.length,
    default_favicon: 'prime-spectrum-squircle',
    colorways: colorways.map(({ id, name, background, fills }) => ({ id, name, background, fills })),
    shapes: shapes.map(({ id, name, background }) => ({ id, name, background })),
    geometry_source: 'source/p-prime-electric-original.svg',
    visual_reference: 'PrimeTech_Brand_Icon_Families_Master_Reference_v1.png',
    source_reference_library_path: '/PrimeTech/Brand References/PrimeTech',
  },
  source_policy: {
    original_only: true,
    allow_external_icon_libraries: false,
    allow_third_party_marks: false,
  },
  size_sets: {
    menu: [16, 20, 24, 32],
    standard: [48, 64],
    app: [128, 180, 192, 256, 512, 1024, 1200],
    favicon: [16, 24, 32, 48, 64, 128, 256],
    webp: [64, 128, 192, 512],
  },
  icons,
};
await fs.writeFile(path.join(here, 'family.manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ family_id: manifest.family_id, icon_count: icons.length, source_variants: icons.length * 2 + shapes.length * 2, colorways: colorways.length, shapes: shapes.length }, null, 2));
