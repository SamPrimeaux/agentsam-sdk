# I.AM Scene runtime snapshot

This is a pinned browser-runtime snapshot from `@inneranimalmedia/iamscene` in `SamPrimeaux/agentsam-sdk`, PR [#650](https://github.com/SamPrimeaux/agentsam-sdk/pull/650), commit `6ccbd416305969f0f023442adab45c6baa6ed6f6`. It is used by the PrimeTech original-circuit showcase.

The currently published npm release `0.1.1` does not yet include the `radialReveal` material/runtime support authored by PR #650. Keep this snapshot until a published I.AM Scene release includes that feature, then replace it with the released package and remove this folder. The runtime source remains the canonical I.AM Scene implementation; PrimeTech only supplies the interaction timing and presentation container.

The original four GLTF meshes and `original-4341.iamscene.json` are copied unchanged to `public/scenes/original-4341/`. Their hashes are declared in the scene document and checked by `npm test`.
