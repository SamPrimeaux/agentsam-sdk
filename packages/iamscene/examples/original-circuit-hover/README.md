# Original 4341 circuit — native, hover-driven scene

This is a native I.AM Scene conversion of the actual localhost:4341 composition, not the different scroll-controlled-circuit sample. Its four original meshes (Lightning, Battery, Bettery2, Cirquit) were extracted from the authoring scene and converted into local, self-contained, content-hashed GLTF presentation assets. The original geometry, topology, transforms and composition are retained; the source app remains unchanged.

The original plays an outward-growing circuit propagation with a returning/fading phase. The native reproduction now captures that visual sequence, not just a light pulse: a radial-reveal shader on the original circuit geometry is driven by time-addressable material.revealRadius animation tracks in the IAM document. Idle leaves the chip alone. Hover initiates the circuit expansion; leave eases back to idle; tap runs one cycle.

The native renderer also recreates the chip's dark face, bright cyan rim, lightning symbol, and glow with Three.js PBR materials and bloom. The exact Spline NodeMaterial gradient and its proprietary postprocessing shader are not retained; color, propagation and bloom are visually approximated, not pixel-identical.

## Native portable model

- original-4341.iamscene.json: references and SHA-256 hashes for the four source meshes, material/radialReveal definitions, the looping expansion timeline and pointerenter/click bindings.
- assets/*.gltf: self-contained source mesh exports; no Spline dependency.
- main.js: standalone host connecting the scene to section-level hover, touch, smooth leave and bloom.
- styles.css: responsive full-bleed stage with no extra narrative overlays.

The IAM runtime handles authored radialReveal materials and material.revealRadius tracks generically, so a CMS renderer can host the scene without copying this demo's shader.

## Local preview

Run from the repository root:

    npm run build --workspace @inneranimalmedia/iamscene
    npx vite packages/iamscene/examples --host 127.0.0.1 --port 4175

Open http://127.0.0.1:4175/original-circuit-hover/. Hover the stage; on touch, tap to launch one cycle. In reduced-motion mode, the source chip remains still. The original Spline file appears only as provenance metadata. The preview performs no requests to Spline and imports no Spline runtime.

CMS boundary: Source-faithful geometry and portable authored animation are ready, but publishing or registering this as a merchant-selectable cms_components section still requires authorized host/R2 catalog integration.
