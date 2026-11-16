import * as xb from 'xrblocks';
import { StudioApp } from './StudioApp.ts';

document.addEventListener('DOMContentLoaded', () => {
  const options = new xb.Options();
  options.setAppTitle('Atelier XR — Creative Studio');
  options.setAppDescription(
    '3D Spatial Sculpting, PBR Lighting & Gemini 3.8 Flash TTS Voice Studio.'
  );
  options.enableReticles();
  options.enableControllers();
  options.xrButton.enabled = false;
  options.enableSimulator = false;

  xb.add(new StudioApp());
  void xb.init(options);
});
