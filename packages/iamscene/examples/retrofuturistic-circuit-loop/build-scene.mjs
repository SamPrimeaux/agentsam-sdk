#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { createSceneDocument, serializeSceneDocument } from '../../dist/src/index.js';
import { createOcctSceneAsset } from '../../dist/src/node.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.join(here, 'assets');
const binaryArg = process.argv.find((value, index, all) => all[index - 1] === '--binary');
const binary = binaryArg ?? process.env.AGENTSAM_OCCT_BIN;
if (!binary) throw new Error('Set AGENTSAM_OCCT_BIN or pass --binary /absolute/path/to/agentsam-occt');
await mkdir(assetsDir, { recursive: true });

const transform = (position = [0, 0, 0]) => ({ position, rotation: [0, 0, 0, 1], scale: [1, 1, 1] });
const roundedRect = (width, height, radius, z, segments = 10) => {
  const points = [];
  const corners = [
    [width / 2 - radius, height / 2 - radius, 0],
    [-width / 2 + radius, height / 2 - radius, 90],
    [-width / 2 + radius, -height / 2 + radius, 180],
    [width / 2 - radius, -height / 2 + radius, 270],
  ];
  for (const [cx, cy, start] of corners) {
    for (let index = 0; index <= segments; index += 1) {
      const angle = (start + index * 90 / segments) * Math.PI / 180;
      points.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle), z]);
    }
  }
  return points;
};

const document = createSceneDocument({
  id: 'retrofuturistic-circuit-loop',
  name: 'Retrofuturistic Circuit Loop',
  description: 'A luminous battery core with synchronized radial circuit traces and traveling energy pulses.',
  author: 'InnerAnimalMedia',
  assetBaseUri: './',
  tags: ['circuit', 'energy', 'technology', 'showcase', 'animated'],
  metadata: {
    provenance: {
      sourceReference: 'retrofuturistic-circuit-loop-reference',
      reconstruction: 'native-occt-feature-history-and-declarative-animation',
    },
  },
});

const materials = [
  { id: 'battery-shell', baseColor: '#07141d', emissive: '#003e50', emissiveIntensity: 0.42, metalness: 0.92, roughness: 0.24 },
  { id: 'battery-face', baseColor: '#02080d', emissive: '#002a39', emissiveIntensity: 0.34, metalness: 0.74, roughness: 0.28 },
  { id: 'lightning-material', baseColor: '#d9fbff', emissive: '#00cfff', emissiveIntensity: 1.45, metalness: 0.15, roughness: 0.18 },
  { id: 'chip-edge', baseColor: '#00dfff', emissive: '#00cfff', emissiveIntensity: 1.55, metalness: 0.1, roughness: 0.2, transparent: true, opacity: 0.95, additive: true, depthWrite: false },
  { id: 'circuit-core', baseColor: '#23dfff', emissive: '#00bfe9', emissiveIntensity: 1.7, metalness: 0.05, roughness: 0.24, transparent: true, opacity: 0.82, additive: true, depthWrite: false },
  { id: 'circuit-halo', baseColor: '#008fb9', emissive: '#007ba6', emissiveIntensity: 0.9, metalness: 0, roughness: 1, transparent: true, opacity: 0.2, additive: true, depthWrite: false },
  { id: 'circuit-pulse', baseColor: '#d9fcff', emissive: '#00dfff', emissiveIntensity: 2.5, metalness: 0, roughness: 0.1, additive: true, depthWrite: false },
];
document.materials = materials;

const nodes = document.scene.nodes;
const addNode = node => nodes.push(node);
addNode({ id: 'battery-group', name: 'Battery', kind: 'group', parentId: 'scene-root', transform: transform(), visible: true });

const bodyOperations = [
  { id: 'battery-body-profile', type: 'profile', points: roundedRect(56, 42, 5.5, 0) },
  { id: 'battery-body', type: 'extrude', profile: 'battery-body-profile', vector: [0, 0, 4.2] },
];
const faceOperations = [
  { id: 'battery-face-profile', type: 'profile', points: roundedRect(51, 37, 4.3, 4.18) },
  { id: 'battery-face', type: 'extrude', profile: 'battery-face-profile', vector: [0, 0, 0.45] },
];
const lightningPoints = [
  [2.2, 9, 4.64], [-3.6, 0.6, 4.64], [-0.25, 0.6, 4.64],
  [-2.0, -9, 4.64], [4.0, 0.5, 4.64], [0.65, 0.5, 4.64],
];
const lightningOperations = [
  { id: 'lightning-profile', type: 'profile', points: lightningPoints },
  { id: 'lightning', type: 'extrude', profile: 'lightning-profile', vector: [0, 0, 0.24] },
];

async function buildSolid(elementId, operations) {
  const result = await createOcctSceneAsset({
    binary: path.resolve(binary),
    projectId: document.metadata.id,
    elementId,
    operations,
    outputDir: assetsDir,
    fileStem: elementId,
    deflection: 0.12,
  });
  for (const asset of result.assets) {
    document.assets.push({
      id: asset.id,
      uri: `./assets/${path.basename(asset.uri)}`,
      mediaType: asset.mediaType,
      sha256: asset.sha256,
      role: asset.role,
      sourceNodeId: elementId,
      units: asset.units,
    });
  }
  process.stdout.write(`${elementId}: OCCT 7.9.3 · ${result.volumeMm3.toFixed(2)} mm³ · ${result.assets.length} exports\n`);
  return result;
}

await buildSolid('battery-body', bodyOperations);
await buildSolid('battery-face', faceOperations);
await buildSolid('lightning', lightningOperations);

addNode({ id: 'battery-body', name: 'Battery Shell', kind: 'mesh', parentId: 'battery-group', transform: transform(), visible: true, assetRef: 'battery-body-gltf', materialRef: 'battery-shell', geometry: { type: 'occt', units: 'mm', operations: bodyOperations } });
addNode({ id: 'battery-face', name: 'Battery Face', kind: 'mesh', parentId: 'battery-group', transform: transform(), visible: true, assetRef: 'battery-face-gltf', materialRef: 'battery-face', geometry: { type: 'occt', units: 'mm', operations: faceOperations } });
addNode({ id: 'lightning', name: 'Lightning', kind: 'mesh', parentId: 'battery-group', transform: transform(), visible: true, assetRef: 'lightning-gltf', materialRef: 'lightning-material', geometry: { type: 'occt', units: 'mm', operations: lightningOperations } });

const outline = roundedRect(57.2, 43.2, 6.1, 4.72, 12).map(([x, y]) => [x / 1000, 0.00475, -y / 1000]);
addNode({ id: 'battery-edge-glow', name: 'Battery Edge Glow', kind: 'path', parentId: 'battery-group', transform: transform(), visible: true, materialRef: 'chip-edge', geometry: { type: 'polyline', points: outline, radius: 0.00052, closed: true, segments: 120, radialSegments: 7 }, renderOrder: 4 });

const circuitY = 0.0054;
const halfWidth = 0.029;
const halfDepth = 0.022;
const traces = [];
for (let sector = 0; sector < 8; sector += 1) {
  for (let lane = 0; lane < 4; lane += 1) {
    const angle = sector * Math.PI / 4 + (lane - 1.5) * 0.055;
    const dx = Math.cos(angle);
    const dz = Math.sin(angle);
    const px = -dz;
    const pz = dx;
    const edgeDistance = Math.min(halfWidth / Math.max(Math.abs(dx), 0.0001), halfDepth / Math.max(Math.abs(dz), 0.0001));
    const startDistance = edgeDistance * 0.99;
    const firstDistance = 0.073 + (lane % 3) * 0.013;
    const lastDistance = 0.145 + (lane % 4) * 0.022;
    const offset = (lane % 2 === 0 ? -1 : 1) * (0.009 + (lane % 3) * 0.0035);
    const start = [dx * startDistance, dz * startDistance];
    const elbowA = [dx * firstDistance, dz * firstDistance];
    const elbowB = [dx * firstDistance + px * offset, dz * firstDistance + pz * offset];
    const end = [dx * lastDistance + px * offset, dz * lastDistance + pz * offset];
    const endCap = [end[0] + px * (offset > 0 ? 0.012 : -0.012), end[1] + pz * (offset > 0 ? 0.012 : -0.012)];
    const points = [start, elbowA, elbowB, end, endCap].map(([x, z]) => [x, circuitY, z]);
    const id = `circuit-trace-${String(sector * 4 + lane + 1).padStart(2, '0')}`;
    const coreId = `${id}-core`;
    const haloId = `${id}-halo`;
    const pulseId = `${id}-pulse`;
    addNode({ id: haloId, name: `${id} Halo`, kind: 'path', parentId: 'scene-root', transform: transform(), visible: true, materialRef: 'circuit-halo', geometry: { type: 'polyline', points, radius: 0.0021, segments: 44, radialSegments: 6 }, renderOrder: 1 });
    addNode({ id: coreId, name: `${id} Core`, kind: 'path', parentId: 'scene-root', transform: transform(), visible: true, materialRef: 'circuit-core', geometry: { type: 'polyline', points, radius: 0.00058, segments: 44, radialSegments: 5 }, renderOrder: 3 });
    addNode({ id: pulseId, name: `${id} Energy Pulse`, kind: 'pulse', parentId: 'scene-root', transform: transform(), visible: true, materialRef: 'circuit-pulse', pathRef: coreId, geometry: { type: 'sphere', radius: 0.00145 }, renderOrder: 5 });
    traces.push({ id, coreId, haloId, pulseId, phase: sector * 0.035 + lane * 0.045 });
  }
}

// Secondary branch traces keep the radial network asymmetrical, as in the reference.
for (let index = 0; index < 12; index += 1) {
  const angle = (index * 2 * Math.PI / 12) + 0.13;
  const dx = Math.cos(angle), dz = Math.sin(angle), px = -dz, pz = dx;
  const start = [dx * 0.105, dz * 0.105];
  const elbow = [start[0] + px * 0.018, start[1] + pz * 0.018];
  const end = [elbow[0] + dx * 0.045, elbow[1] + dz * 0.045];
  const id = `circuit-branch-${String(index + 1).padStart(2, '0')}`;
  const points = [start, elbow, end].map(([x, z]) => [x, circuitY - 0.0001, z]);
  addNode({ id, name: id, kind: 'path', parentId: 'scene-root', transform: transform(), visible: true, materialRef: 'circuit-core', geometry: { type: 'polyline', points, radius: 0.00048, segments: 28, radialSegments: 5 }, renderOrder: 3 });
  traces.push({ id, coreId: id, haloId: id, pulseId: null, phase: index * 0.025 });
}

const tracks = [];
const keyframes = values => values.map(([time, value, easing]) => ({ time, value, ...(easing ? { easing } : {}) }));
for (const [targetId, values] of [
  ['battery-body', [[0, 0.48], [1.15, 0.9], [2.25, 0.62], [4.7, 0.48], [5.8, 1.02], [7.0, 0.74], [8, 0.48]]],
  ['battery-face', [[0, 0.32], [1.1, 0.7], [2.2, 0.46], [4.7, 0.32], [5.8, 0.82], [7.0, 0.56], [8, 0.32]]],
  ['lightning', [[0, 1.35], [1.0, 2.0], [2.2, 1.25], [4.7, 1.35], [5.8, 2.25], [7.0, 1.55], [8, 1.35]]],
  ['battery-edge-glow', [[0, 0.56], [1.2, 1], [2.3, 0.72], [4.7, 0.56], [5.9, 1], [7.0, 0.74], [8, 0.56]]],
]) {
  tracks.push({ id: `${targetId}-emission`, targetId, property: 'emissiveIntensity', interpolation: 'linear', keyframes: keyframes(values) });
}

for (const trace of traces) {
  const phase = trace.phase;
  const opacityFrames = [[0, 0], [0.65 + phase, 0], [1.38 + phase, 0.84, 'sineInOut'], [2.15 + phase, 0.72], [3.0 + phase, 0], [5.05 + phase, 0], [5.78 + phase, 0.84, 'sineInOut'], [6.55 + phase, 0.72], [7.5 + phase, 0], [8, 0]];
  for (const targetId of new Set([trace.coreId, trace.haloId])) {
    tracks.push({ id: `${targetId}-opacity`, targetId, property: 'opacity', interpolation: 'linear', keyframes: keyframes(targetId === trace.haloId ? opacityFrames.map(([time, value, easing]) => [time, Number(value) * 0.28, easing]) : opacityFrames) });
  }
  if (trace.pulseId) {
    const pulseFrames = [[0, 0], [0.8 + phase, 0], [2.35 + phase, 1, 'sineInOut'], [3.25 + phase, 0], [5.1 + phase, 0], [6.0 + phase, 0], [7.45 + phase, 1, 'sineInOut'], [8, 0]];
    tracks.push({ id: `${trace.pulseId}-travel`, targetId: trace.pulseId, property: 'pathProgress', interpolation: 'linear', keyframes: keyframes(pulseFrames) });
    tracks.push({ id: `${trace.pulseId}-opacity`, targetId: trace.pulseId, property: 'opacity', interpolation: 'linear', keyframes: keyframes([[0, 0], [1.25 + phase, 1], [2.8 + phase, 0], [5.4 + phase, 0], [6.4 + phase, 1], [7.35 + phase, 0], [8, 0]]) });
  }
}

document.animations = [
  { id: 'circuit-loop', name: 'Circuit Energy Loop', duration: 8, loop: true, tracks },
  { id: 'core-response', name: 'Core Response', duration: 0.85, loop: false, tracks: [
    { id: 'response-battery', targetId: 'battery-body', property: 'emissiveIntensity', interpolation: 'linear', keyframes: keyframes([[0, 0.48], [0.3, 1.4, 'sineInOut'], [0.85, 0.48]]) },
    { id: 'response-lightning', targetId: 'lightning', property: 'emissiveIntensity', interpolation: 'linear', keyframes: keyframes([[0, 1.35], [0.34, 3.1, 'sineInOut'], [0.85, 1.35]]) },
    { id: 'response-edge', targetId: 'battery-edge-glow', property: 'emissiveIntensity', interpolation: 'linear', keyframes: keyframes([[0, 0.56], [0.34, 2.0, 'sineInOut'], [0.85, 0.56]]) },
  ] },
];
document.interactions = [
  { id: 'battery-hover-response', targetId: 'battery-body', event: 'pointerenter', action: { type: 'playAnimation', animationId: 'core-response' } },
  { id: 'battery-click-response', targetId: 'battery-body', event: 'click', action: { type: 'playAnimation', animationId: 'core-response' } },
];

document.camera = { projection: 'perspective', position: [0, 0.29, 0.66], target: [0, 0.002, 0], fov: 34, near: 0.001, far: 8 };
document.environment = {
  background: '#01050a',
  fog: { color: '#01050a', near: 0.5, far: 1.8 },
  ambientIntensity: 0.14,
  lights: [
    { id: 'key-light', type: 'directional', color: '#b8f6ff', intensity: 1.35, position: [0.2, 0.55, 0.35] },
    { id: 'cyan-fill', type: 'point', color: '#00cfff', intensity: 0.75, position: [0, 0.055, 0] },
    { id: 'blue-rim', type: 'point', color: '#176bff', intensity: 0.28, position: [-0.2, 0.1, -0.16] },
  ],
};

document.metadata.modifiedAt = new Date().toISOString();
const scenePath = path.join(here, 'retrofuturistic-circuit-loop.iamscene.json');
await writeFile(scenePath, serializeSceneDocument(document), 'utf8');
process.stdout.write(`Wrote ${scenePath}\n`);
process.stdout.write(`Nodes: ${document.scene.nodes.length} · Assets: ${document.assets.length} · Animation tracks: ${tracks.length + 3}\n`);
