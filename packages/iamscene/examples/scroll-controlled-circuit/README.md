# Scroll-controlled circuit story

This page demonstrates the intended division of responsibility:

- `retrofuturistic-circuit-loop.iamscene.json` remains the portable 3D scene source.
- `@inneranimalmedia/theme-scenes` owns the page section, cinematic scroll length, and narrative stages.
- `@inneranimalmedia/iamscene` owns deterministic animation sampling and 3D rendering.

The example reuses the original scene document and its existing assets. It does not
copy the geometry, create a second animation format, or require Spline.

## Run

From the repository root:

```bash
npm run build --workspace @inneranimalmedia/iamscene
npx vite packages/iamscene/examples/scroll-controlled-circuit --host 127.0.0.1 --port 4174
```

Open `http://127.0.0.1:4174` and scroll through the pinned scene section. The
animation follows page progress and holds its final keyframe at the end. With
reduced motion enabled, the page displays a static first frame.
