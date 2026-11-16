# Retrofuturistic Circuit Loop

The first native `.iamscene.json` showcase. The battery shell, inset face and lightning mark are real OCCT solids with retained feature history and GLTF, STEP and BREP exports. Circuit paths, traveling pulses and the synchronized eight-second loop are declared in the scene document.

## Rebuild the native geometry and document

```bash
npm run build --workspace @inneranimalmedia/iamscene
AGENTSAM_OCCT_BIN=/absolute/path/to/agentsam-occt node packages/iamscene/examples/retrofuturistic-circuit-loop/build-scene.mjs
```

## Preview

```bash
npx vite packages/iamscene/examples/retrofuturistic-circuit-loop --host 127.0.0.1 --port 4173
```

Open `http://127.0.0.1:4173`. The scene loads only `.iamscene.json` and its native assets. It does not load a Spline scene or runtime.
