import { createSceneRuntime, parseSceneDocument } from '../../dist/src/index.js';

const container = document.querySelector('#scene');
const status = document.querySelector('#scene-status');
let runtime;

try {
  const response = await fetch('./retrofuturistic-circuit-loop.iamscene.json', { cache: 'no-store' });
  if (!response.ok) throw new Error(`scene_document_http_${response.status}`);
  const document = parseSceneDocument(await response.text());
  runtime = await createSceneRuntime({
    container,
    document,
    assetBaseUrl: new URL('./', import.meta.url),
    controls: true,
    autoPlay: 'circuit-loop',
    onNodeEvent(nodeId, event) {
      if (nodeId === 'battery-body' && event === 'pointerenter') status.textContent = 'INNERANIMALMEDIA · ENERGY CORE';
      if (nodeId === 'battery-body' && event === 'pointerleave') status.textContent = 'INNERANIMALMEDIA · SCENE RUNTIME';
    },
  });
  window.iamSceneRuntime = runtime;
  status.textContent = 'INNERANIMALMEDIA · NATIVE SCENE';
} catch (error) {
  status.dataset.state = 'error';
  status.textContent = `SCENE LOAD FAILED · ${error instanceof Error ? error.message : String(error)}`;
  console.error(error);
}

window.addEventListener('pagehide', () => runtime?.dispose(), { once: true });
