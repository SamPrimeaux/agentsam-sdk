# AgentSam desktop shell

Tauri multi-brand shell. **Local Studio** is the primary product install.

## Product build and desktop artifact handoff

The existing brand manifest selects application identity, launch routes, auth,
native capabilities and platform profiles. The product owns its frontend build;
the desktop package verifies and stages that completed artifact before Tauri
packages it. Local Studio is the current production build consumer. Other
product manifests do not, by themselves, prove a standalone desktop build.

For Local Studio, the current manifest enables `desktop_spa` and
`agentsamd_sidecar`. The bundled desktop SPA is required; a hosted SSR build or
bootstrap/status page is never used as a release fallback. Mobile profiles use
mobile adapters without executable desktop sidecars.

```bash
# From packages/agentsam-desktop-shell:
npm run build:desktop-assets  # product build → verified artifact handoff → CAD smoke
npm run build                # sidecars, artifact pipeline, brand and Cargo check
npm run bundle               # app/DMG packaging after the same pipeline
```

`npm run sync:local-studio` remains a compatible command to stage an already
built `apps/local-studio/desktop-dist`. It delegates to the same reusable stage.
It does not guess among web, SSR and desktop output directories.

The generic stage accepts any existing desktop brand manifest and an explicit
completed desktop SPA; it does not build that product or assert its readiness:

```bash
npm run stage:desktop -- --manifest manifests/cad-creator.json --source /path/to/verified-cad-desktop-build
```

The pipeline validates the entry and directly referenced JavaScript/styles,
rejects hydrate-only clients, missing files, symlinks and overlapping paths,
then copies into a temporary transaction directory. A SHA-256 inventory must
match before the destination changes. Replacement uses directory renames with
rollback; validation failures keep the last good staged build intact.
`dist/agentsam-desktop-dist.json` records portable product/source identity,
entrypoints and content hashes. No machine-specific source path is embedded.

This is a reusable artifact handoff within the current build system, not a
separate app registry or a claim that every product is already available on
desktop, PWA, iOS or Android.

## Auth

`IAM_CLIENT_ID=iam_agentsam_sdk_web` (same as CLI). Identity stays on IAM; this package lives in **agentsam-sdk**.

## Brands

```bash
npm run build:brand -- local-studio
npm run build:brand -- cad-creator
```

<!-- agentsam:trademark-notice -->
> Independent project. Not affiliated with, endorsed by, or sponsored by any company whose products are named here. Names are trademarks of their respective owners. See [TRADEMARKS](https://github.com/SamPrimeaux/agentsam-sdk/blob/main/TRADEMARKS.md).
