import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { createSceneRuntime, parseSceneDocument } from '../../dist/src/index.js';

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

  const hoverOn = () => runtime.play('hover-ignite',{restart:true});
  const hoverOff = () => runtime.play('hover-release',{restart:true});
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduced) {
    stage.addEventListener('pointerenter',hoverOn);
    stage.addEventListener('pointerleave',hoverOff);
    stage.addEventListener('pointerdown',hoverOn);
    stage.addEventListener('pointerup',hoverOff);
    stage.addEventListener('pointercancel',hoverOff);
  }
  runtime.render();
  window.__iamScenePreview={runtime,document,source:'native-mesh',isSplineRuntime:false};
  window.addEventListener('pagehide',()=>{window.removeEventListener('resize',resize);runtime.dispose();bloom.dispose()},{once:true});
} catch(error) {
  console.error('[I.AM Scene] Original circuit hover clone failed',error);
  errorElement.hidden=false;
  errorElement.textContent=`Native scene could not load: ${error instanceof Error?error.message:String(error)}`;
}
