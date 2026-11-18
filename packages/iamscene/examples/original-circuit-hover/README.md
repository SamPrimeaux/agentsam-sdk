# Original circuit — native hover scene

Faithful **native I.AM Scene** geometry recreation of the working `localhost:4341` Retrofuturistic Circuit Spline composition, without the Spline runtime or a `.splinecode` fetch at playback.

## Source fidelity

The four original runtime meshes (`Lightning`, `Battery`, `Bettery2`, `Cirquit`) were extracted once from the source scene, then converted into self-contained, content-hashed GLTF presentation assets. The original mesh positions, quaternions, scale, topology and scene composition are retained. The source camera's framing is matched in the portable perspective camera. Colors and bloom are recreated as native Three.js materials and postprocessing; Spline-specific NodeMaterial shaders are **not** retained, so the result is close but not pixel-identical to Spline.

The source is publicly hosted at `https://prod.spline.design/XsILZHTplRmAlDaE/scene.splinecode`. This URL appears in document provenance only; **the preview neither imports the Spline runtime nor requests that URL**. The original source project was not modified.

## Controls

- Idle: the circuit rests in the source pose and subdued glow.
- Hover / pointer press: `hover-ignite` brightens the circuit, chip rim and bolt through native animation tracks.
- Leave / release: `hover-release` returns the scene to its low-light resting state.
- Reduced motion: holds the resting state; interaction animations are disabled.

The interactions are ordinary `SceneDocument.interactions`, using `pointerenter`/`pointerleave` and `playAnimation`; merchant placement can bind the scene like any other portable `.iamscene` document. The preview additionally binds the entire stage for easy hover discovery and adds an optional bloom pass.

## Preview

From the repository root, build native runtime once and launch Vite:

```sh
npm run build --workspace @inneranimalmedia/iamscene
npx vite packages/iamscene/examples --host 127.0.0.1 --port 4175
```

Open `http://127.0.0.1:4175/original-circuit-hover/`.

The glTF meshes, scene document, materials and animation tracks are all local and content-addressed. CMS registration is a separate host-scoped step; this example does not claim to have published an installable section to `cms_components`.
