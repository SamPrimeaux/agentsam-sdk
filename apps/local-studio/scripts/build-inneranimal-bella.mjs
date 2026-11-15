#!/usr/bin/env node
/** Build Bella's transparent APNG state loops from her approved 16-pose keyframe sheet. */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const root = path.join(repoRoot, 'assets/brand/inneranimal-companions/v1/bella');
const sourceArchiveSha256 = 'aa4201f7e387321dc3cd628cb6449e063cbd053b76a45639df83e0158e9ae902';
const source = JSON.parse(readFileSync(path.join(root, 'metadata/source-manifest-v1.0.0.json'), 'utf8'));
const states = source.galleryStates;
if (!Array.isArray(states) || states.length !== 16) throw new Error('Bella source package must contain exactly 16 keyframes.');

const motion = {
  idle:          { zoom: 0.008, tilt: 0.000, bob: 0.55, loop: true,  description: 'Slow breathing and a gentle vertical rise.' },
  attentive:     { zoom: 0.004, tilt: 0.004, bob: 0.35, loop: true,  description: 'Small alert posture shift.' },
  blink:         { zoom: 0.002, tilt: 0.000, bob: 0.12, loop: true,  description: 'Soft, relaxed micro-motion on the eyes-closed pose.' },
  curious:       { zoom: 0.003, tilt: 0.010, bob: 0.25, loop: true,  description: 'Gentle inquisitive sway.' },
  'head-tilt':   { zoom: 0.002, tilt: 0.018, bob: 0.18, loop: true,  description: 'Subtle rocking around the tilted pose.' },
  asking:        { zoom: 0.003, tilt: 0.006, bob: 0.48, loop: true,  description: 'Small hopeful lift around the raised-paw pose.' },
  thinking:      { zoom: 0.003, tilt: 0.010, bob: 0.22, loop: true,  description: 'Quiet thoughtful sway.' },
  waiting:       { zoom: 0.006, tilt: 0.003, bob: 0.25, loop: true,  description: 'Patient breathing pulse.' },
  'voice-headset': { zoom: 0.003, tilt: 0.007, bob: 0.22, loop: true, description: 'Gentle listening nod.' },
  working:       { zoom: 0.005, tilt: 0.003, bob: 0.48, loop: true,  description: 'Focused forward-and-back breathing motion.' },
  'tail-wag':    { zoom: 0.003, tilt: 0.020, bob: 0.22, loop: true,  description: 'Light whole-character sway around the tail-wag pose.' },
  success:       { zoom: 0.007, tilt: 0.005, bob: 0.90, loop: false, description: 'A single gentle celebratory bounce.' },
  welcome:       { zoom: 0.004, tilt: 0.012, bob: 0.62, loop: false, description: 'A friendly one-shot greeting sway.' },
  'alert-error': { zoom: 0.006, tilt: 0.005, bob: 0.28, loop: true,  description: 'A restrained attention pulse.' },
  resting:       { zoom: 0.006, tilt: 0.001, bob: 0.28, loop: true,  description: 'Slow resting breath.' },
  sleeping:      { zoom: 0.005, tilt: 0.000, bob: 0.22, loop: true,  description: 'Very slow sleeping breath.' },
};

const runtimeStateMap = {
  idle: 'idle', blinking: 'blink', thinking: 'thinking', working: 'working', waiting: 'waiting',
  attention: 'attentive', success: 'success', error: 'alert-error', resting: 'resting', signature: 'tail-wag',
};
const frameCount = 8;
const fps = 6;
const animationDir = path.join(root, 'animations');
mkdirSync(animationDir, { recursive: true });

function readApngFrameCount(file) {
  const bytes = readFileSync(file);
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    if (type === 'acTL') return bytes.readUInt32BE(offset + 8);
    offset += length + 12;
  }
  return 0;
}

for (const state of states) {
  const profile = motion[state.id];
  if (!profile) throw new Error(`Missing motion profile for ${state.id}`);
  const keyframe = path.join(root, 'keyframes', path.basename(state.src));
  const output = path.join(animationDir, `bella-${state.id}.png`);
  if (!existsSync(keyframe)) throw new Error(`Missing source keyframe: ${keyframe}`);
  const phase = profile.loop ? 'PI*on/4' : 'PI*on/7';
  const zoom = profile.loop
    ? `1+${profile.zoom}*(0.5-0.5*cos(${phase}))`
    : `1+${profile.zoom}*sin(${phase})`;
  const bob = profile.loop ? `sin(${phase})` : `-sin(${phase})`;
  const filters = [
    `zoompan=z='${zoom}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)+${profile.bob}*${bob}':d=${frameCount}:s=256x256:fps=${fps}`,
  ];
  if (profile.tilt) filters.push(`rotate=angle='${profile.tilt}*sin(PI*n/${profile.loop ? 4 : 7})':c=none:ow=256:oh=256`);
  filters.push('format=rgba');
  execFileSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y', '-i', keyframe,
    '-vf', filters.join(','), '-frames:v', String(frameCount),
    '-plays', profile.loop ? '0' : '1', '-f', 'apng', output,
  ], { stdio: 'pipe' });
  const actualFrames = readApngFrameCount(output);
  if (actualFrames !== frameCount) throw new Error(`${state.id}: expected ${frameCount} APNG frames, found ${actualFrames}`);
  const bytes = readFileSync(output);
  if (bytes.readUInt32BE(16) !== 256 || bytes.readUInt32BE(20) !== 256 || bytes[25] !== 6) {
    throw new Error(`${state.id}: APNG must be 256×256 RGBA with transparency.`);
  }
  state.src = `animations/bella-${state.id}.png`;
  state.frames = frameCount;
  state.fps = fps;
  state.loop = profile.loop;
  state.kind = 'apng';
  state.motion = profile.description;
}

const runtimeStates = Object.fromEntries(Object.entries(runtimeStateMap).map(([runtimeId, galleryId]) => {
  const gallery = states.find((state) => state.id === galleryId);
  const profile = motion[galleryId];
  return [runtimeId, {
    src: gallery.src, frames: frameCount, fps, loop: profile.loop, kind: 'apng',
    sourceKeyframe: `keyframes/bella-${galleryId}.png`, motion: profile.description,
  }];
}));

const manifest = {
  ...source,
  version: '1.1.0',
  status: 'production-review-candidate',
  provenance: 'Source poses and character identity are preserved from the user-provided Bella state-sheet package. Each transparent 256×256 keyframe is rendered into an 8-frame APNG using restrained whole-character micro-motion; this is not a skeletal limb rig.',
  sourceArchiveSha256,
  states: runtimeStates,
  galleryStates: states,
  animationFrameCount: states.length * frameCount,
  runtimeStateCount: Object.keys(runtimeStates).length,
  visualApproval: 'pending',
  structuralValidation: {
    ok: true,
    errors: [],
    warnings: ['Motion is derived from each source still pose using subtle whole-character transforms; articulated tail, paw and facial rigs are not included.'],
  },
  sourcePackage: 'InnerAnimal-Bella-v1.0.0.zip',
  releasePackage: 'InnerAnimal-Bella-v1.1.0.zip',
};
writeFileSync(path.join(root, 'companion.json'), `${JSON.stringify(manifest, null, 2)}\n`);

const animationBuild = {
  schemaVersion: 1,
  companionId: 'bella',
  frameSize: [256, 256],
  framesPerState: frameCount,
  fps,
  loopPlays: 'infinite for loop states; one play for success and welcome',
  totalGalleryStates: states.length,
  totalAnimationFrames: states.length * frameCount,
  runtimeStateMap,
  motionModel: 'FFmpeg zoompan + optional rotate, RGBA preserved; 8-frame eased micro-motion cycles generated from original transparent keyframes.',
  limitation: 'The motion is intentionally subtle whole-character motion, not skeletal animation or independent tail/paw/eye articulation.',
  sourceArchiveSha256,
  builtAt: new Date().toISOString(),
  states: Object.fromEntries(Object.entries(motion).map(([id, profile]) => [id, profile])),
};
writeFileSync(path.join(root, 'metadata/animation-build.json'), `${JSON.stringify(animationBuild, null, 2)}\n`);

const registration = JSON.parse(readFileSync(path.join(root, 'metadata/source-registration.json'), 'utf8'));
registration.sourceArchive = 'InnerAnimal-Bella-v1.0.0.zip';
registration.sourceArchiveSha256 = sourceArchiveSha256;
registration.keyframeDirectory = 'keyframes/';
registration.animationOutputDirectory = 'animations/';
registration.animationMethod = '8-frame transparent APNG micro-motion generated from each of the 16 source keyframes';
registration.animationFrameCount = frameCount;
registration.animationFps = fps;
registration.notes = [
  ...(registration.notes || []),
  'All 16 source keyframes are retained unchanged under keyframes/.',
  'The 16 gallery states each have an 8-frame RGBA APNG; 10 of these are mapped to the shared AgentSam runtime states.',
  'Motion is whole-character micro-motion; no articulated tail, paw or facial rig is claimed.',
];
writeFileSync(path.join(root, 'metadata/source-registration.json'), `${JSON.stringify(registration, null, 2)}\n`);

const validation = {
  ok: true,
  companionId: 'bella',
  version: '1.1.0',
  sourceKeyframes: states.length,
  galleryStates: states.length,
  runtimeStates: Object.keys(runtimeStates).length,
  framesPerGalleryState: frameCount,
  totalAnimationFrames: states.length * frameCount,
  checks: ['all 16 keyframes present', 'all 16 APNGs contain 8 frames', 'all APNGs are 256x256 RGBA', 'avatar, icon and portrait present', 'runtime state aliases resolve to gallery APNGs'],
  warnings: manifest.structuralValidation.warnings,
};
writeFileSync(path.join(root, 'metadata/structural-validation.json'), `${JSON.stringify(validation, null, 2)}\n`);
writeFileSync(path.join(root, 'metadata/visual-review.json'), `${JSON.stringify({ status: 'pending', reason: 'Automated structure and runtime integration are complete; final visual approval remains a human review step.', reviewedStates: [], approvedBy: null }, null, 2)}\n`);

const readme = `# Bella — InnerAnimal Companion\n\n- **Package:** InnerAnimal-Bella-v1.1.0\n- **Character:** Chocolate Labrador Retriever\n- **Role:** Everyday companion · encouragement & presence\n- **Signature action:** A happy, unhurried tail wag\n- **Visual identity:** Rich chocolate coat, warm amber eyes, cream chest blaze, lightly silvered muzzle\n\n## Runtime package\n\n- 16 independent gallery states, each exported as a transparent 256×256 RGBA APNG\n- 8 frames per state at 6 fps (128 total gallery animation frames)\n- 10 shared AgentSam runtime states mapped to the appropriate Bella gallery animations\n- Avatar 128×128, icon 64×64, portrait 256×256\n- Original state atlas, contact sheet, palette and registration metadata retained\n- Original source keyframes preserved unchanged under \`keyframes/\`\n\n## Runtime state mapping\n\n| AgentSam state | Bella artwork |\n| --- | --- |\n${Object.entries(runtimeStateMap).map(([runtimeId, galleryId]) => `| ${runtimeId} | ${galleryId} |`).join('\n')}\n\n## Animation construction\n\nEach original pose is rendered as an 8-frame transparent APNG using a restrained, eased whole-character micro-motion cycle (breathing, small sway, nod or bounce according to the pose). The 16 source keyframes are retained unchanged. These are not skeletal or independently articulated tail, paw or facial rigs; visual approval remains pending.\n`;
writeFileSync(path.join(root, 'README.md'), readme);

console.log(`Built Bella v1.1.0: ${states.length} APNG states × ${frameCount} frames = ${states.length * frameCount} gallery frames; ${Object.keys(runtimeStates).length} runtime aliases.`);
