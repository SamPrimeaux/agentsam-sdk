# `@inneranimalmedia/agentsam-occt`

The canonical reusable AgentSam OCCT capability package. It owns the shared provider contract, the browser Boolean/export adapter, and the native C++ engine source. Consumers do not maintain their own copies of OCCT operation code.

## Ownership and runtime boundaries

- `native/` is the single C++ source of truth for the `agentsam-occt` executable.
- `services/cad/occt/` is a compatibility build entrypoint that delegates to this package; it contains no second engine implementation.
- `src/native-provider.mjs` adapts the installed native executable to the existing `cad.project.v1` provider contract. The older SDK path `src/lib/cad/occt-native-provider.mjs` is a compatibility re-export only.
- `src/browser.ts` owns the browser Boolean-to-GLB operation. The host injects an OpenCascade.js loader so each site can resolve its own WASM asset and defer loading until modeling is requested.
- `@inneranimalmedia/agentsam-3d-viewer` is the presentation-only viewer package. It reads GLB/GLTF/STL; it is not a second geometry kernel.

The browser and native adapters are separate builds of the same OpenCascade kernel family because WebAssembly must run in the browser while the C++ executable runs on a native host. They share one operation contract and do not duplicate application-level geometry algorithms.

## Native build

The existing build entrypoint is preserved:

```sh
cmake -S services/cad/occt -B /tmp/agentsam-occt-build -G Ninja \
  -DAGENTSAM_OCCT_PREFIX="$(brew --prefix opencascade)"
cmake --build /tmp/agentsam-occt-build
/tmp/agentsam-occt-build/agentsam-occt --doctor
```

A supported OCCT development prefix and C++20 toolchain are required. The package does not silently install a kernel or fall back to approximate geometry. Native consumers set `AGENTSAM_OCCT_BIN` to the absolute path of the verified executable; the default is `~/.agentsam/bin/agentsam-occt`.

The current SDK native provider maps `design_model_build` for box solids and `design_model_inspect`. The raw executable also supports box-cut and STEP inspection, but new project operations must be registered through the existing CAD project contract before the provider advertises them.

## Browser use

A host supplies its OpenCascade.js initializer and WASM URL once, then calls the shared provider's `createBooleanGLB(parameters)`. The kernel is not initialized merely by importing the package. Export filenames are unique per provider instance and temporary WASM filesystem files are removed after export.

## Workflow execution

PrimeTech remains the versioned procedure/orchestration layer. Python procedures run through the existing authorized `sam.superbash` operation and produce evidence receipts; neither PrimeTech nor SuperBash is a second CAD engine or a second terminal daemon.

## Release status

This package is an SDK workspace package and remains private pending native packaging/portability review. Do not publish or claim a standalone native installer until the platform-specific executable build and install path are validated.
