# AgentSam OCCT Native Engine — first kernel slice

This is the C++ OCCT engine fixture for the existing SDK-owned `cad.project.v1` capability pack. It **does not** replace the project contract, the FreeCAD adapter, or the existing tool registry. The first bounded operations are a precision box solid, STEP export, STEP import, and solid volume/validity inspection. It is local-only until the SDK provider is connected through canonical runtime routing, capability permissions, artifact persistence, and hosted validation are complete.

## Build

Install a supported OCCT development package and a C++20 compiler/CMake (Ninja optional). Supply the actual developer prefix, for example `$(brew --prefix opencascade)` after a successful Homebrew installation. FreeCAD's bundled libraries are not a development SDK.

```sh
cmake -S services/cad/occt -B /tmp/agentsam-occt-build -G Ninja \
  -DAGENTSAM_OCCT_PREFIX=/path/to/occt/developer/prefix
cmake --build /tmp/agentsam-occt-build
/tmp/agentsam-occt-build/agentsam-occt --doctor
/tmp/agentsam-occt-build/agentsam-occt --box 100 60 20 /tmp/agentsam-bracket.step
/tmp/agentsam-occt-build/agentsam-occt --inspect /tmp/agentsam-bracket.step
```

For an isolated TBB runtime, also pass `-DAGENTSAM_OCCT_TBB_PREFIX=...`. For normal Homebrew installs, Homebrew handles library relocation. Locally extracted bottles are **not** automatically relocated or code-signed; do not redistribute or promote staged libraries as an official install.

## Machine contract

Output receipts begin with `AGENTSAM_RESULT=` and report the engine version, verified operation, and volume in cubic millimeters; other engine stdout is not a success receipt. Dimensions are millimeters at this native boundary (the existing DesignProject currently stores inches and needs explicit conversion). The caller owns output paths, artifact security, revisions, provenance, and authorization. Unsupported operations fail, never silently fall back to an approximate geometry generator.

Target provider interface: `discover(ctx)`, `doctor(ctx)`, `execute(operation, input, ctx)`, `inspect(artifact, ctx)`. Existing normalized `design_model_build`/`design_model_inspect` tools remain the canonical AgentSam surface; do not register a duplicate `occt_create_box` agent tool.

Relocated offline OCCT builds may reference FreeType outside the packaged OCCT prefix. For that environment, supply `-DAGENTSAM_OCCT_FREETYPE_PREFIX=/opt/homebrew/opt/freetype` together with the explicit OCCT/TBB prefixes. The resulting executable carries the dependency search path; do not copy dylibs into the source tree. Native receipts use `max_digits10` precision so STEP re-import volume comparisons are based on complete values.

## SDK-owned provider (not yet registered in hosted execution)

`src/lib/cad/occt-native-provider.mjs` exports `createOcctNativeProvider`. Set `AGENTSAM_OCCT_BIN` to an absolute path to a verified local `agentsam-occt` executable. Its `doctor()` performs a real subprocess probe; unsupported operations and unavailable engines fail closed. The initial `execute()` contract supports `design_model_build` with `{ kind: "box", width, depth, height, units: "mm" | "in" }` and `design_model_inspect`. It requires an existing **absolute, authorized artifactRoot**, generates its own STEP filename, re-imports the file, and hashes the resulting bytes. The caller still owns project revision checks, authorization, and artifact persistence.

```sh
AGENTSAM_OCCT_BIN=/path/to/build/agentsam-occt \
AGENTSAM_TEST_OCCT_NATIVE=1 \
node --test test/integration/cad-occt-native-provider.test.mjs
```

The locally staged, relocated OCCT bottle may additionally need library search paths; normal Homebrew installs should not. Real integration into the existing `cad.project.v1` router, Docker/container discovery, tool-capability registry, and AgentSam application UI remains a **separate acceptance gate**, not a simulated shipped feature.
