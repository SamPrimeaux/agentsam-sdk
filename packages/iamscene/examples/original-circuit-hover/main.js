import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { createSceneRuntime, parseSceneDocument, sampleAnimationTrack } from '../../dist/src/index.js';

const stage = document.getElementById('hover-stage');
const root = document.getElementById('scene');
const errorElement = document.getElementById('scene-error');
let runtime;
try {
  const sceneUrl = new URL('./original-4341.iamscene.json', import.meta.url);
  const response = await fetch(sceneUrl);
  if (!response.ok) throw new Error(`Native document HTTP ${response.status}`);
  const document = parseSceneDocument(await response.text());
  runtime = await createSceneRuntime({
    container: root,
    document,
    assetBaseUrl: new URL('.', sceneUrl),
    autoPlay: false,
    controls: false,
  });
  const renderer = runtime.viewport.renderer;
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const bloom = new EffectComposer(renderer);
  bloom.addPass(new RenderPass(runtime.scene,runtime.camera));
  const glow = new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),.37,.35,.4);
  bloom.addPass(glow);
  runtime.viewport.render = () => bloom.render();
  const resize = () => bloom.setSize(innerWidth,innerHeight);
  window.addEventListener('resize',resize,{passive:true});

  // The authored timeline mirrors the original source's traveling circuit reveal.
  // The host only determines *when* it runs, leaving geometry and timing in .iamscene.
  const sweep = document.animations.find(animation => animation.id === 'circuit-expansion');
  const radiusTrack = sweep.tracks.find(track => track.property === 'material.revealRadius');
  const idleRadius = document.materials.find(material => material.id === 'circuit-traces').radialReveal.initialRadius;
  let releaseFrame = 0;
  let touchStopTimer = 0;
  const hoverOn = () => {
    if (releaseFrame) cancelAnimationFrame(releaseFrame);
    releaseFrame = 0;
    runtime.play(sweep.id, {restart: true});
  };
  const hoverOff = () => {
    if (releaseFrame) cancelAnimationFrame(releaseFrame);
    clearTimeout(touchStopTimer);
    const from = Number(sampleAnimationTrack(radiusTrack, runtime.currentTime));
    runtime.pause();
    const startedAt = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - startedAt) / 380);
      const ease = t * t * (3 - 2 * t);
      runtime.setRevealRadius('circuit-traces', from + (idleRadius - from) * ease);
      if (t < 1) releaseFrame = requestAnimationFrame(tick);
      else releaseFrame = 0;
    };
    releaseFrame = requestAnimationFrame(tick);
  };
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduced) {
    stage.addEventListener('pointerenter', (event) => {
      if (event.pointerType !== 'touch') hoverOn();
    });
    stage.addEventListener('pointerleave', (event) => {
      if (event.pointerType !== 'touch') hoverOff();
    });
    stage.addEventListener('pointerdown', (event) => {
      if (event.pointerType !== 'touch') return;
      hoverOn();
      touchStopTimer = setTimeout(hoverOff, sweep.duration * 1000);
    });
  }
  runtime.render();
  window.__iamScenePreview={runtime,document,source:'native-mesh-animated',isSplineRuntime:false, hoverOn,hoverOff};
  window.addEventListener('pagehide',()=>{
    if (releaseFrame) cancelAnimationFrame(releaseFrame);
    clearTimeout(touchStopTimer);
    window.removeEventListener('resize',resize);
    runtime.dispose();
    bloom.dispose();
  },{once:true});
} catch(error) {
  console.error('[I.AM Scene] Original circuit hover clone failed',error);
  errorElement.hidden=false;
  errorElement.textContent=`Native scene could not load: ${error instanceof Error?error.message:String(error)}`;
}
