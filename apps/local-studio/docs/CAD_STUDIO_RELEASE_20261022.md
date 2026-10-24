# CAD + SamSketch unified shell release receipt — 2026-10-22

## Source and scope

Continue on the existing CAD Studio integration branch. Avoid creating a duplicate checkout.

Code commit: `a8c494e640115e3d500c2d5997fdb813f473d487`.

The integrated Local Studio contains CAD Creator, SamSketch, Ecommerce CMS, and MovieMode as independently built included applications. SamSketch bundles a source-backed 3D model inventory (47 component parts, 20 scene compositions, 64 authored previews), CAD modeling with the retained OpenCascade WASM engine, a scoped embedded page, and the host-owned AgentSam navigation and conversation. The dashboard shell refinements are in the same source commit. `agentsam-3d-studio` is the separate original standalone Sculpt Studio project and retains the `:4340` review surface; do not replace its originals or overwrite its WIP.

## Verification already executed

- SamSketch `npm test` — 3/3 passed; production `npm run build` passed.
- `node --test apps/local-studio/scripts/build-included-apps.test.mjs apps/local-studio/scripts/included-wasm-assets.test.mjs` — 13/13 passed.
- `node apps/local-studio/scripts/build-included-apps.mjs --only cad-creator` — built and staged.
- Scoped SamSketch, Ecommerce, and MovieMode included-app builds all passed.
- `npm --prefix apps/local-studio run build` — passed; staged all four apps in `.output/public`.
- `npm --prefix apps/local-studio run cf:verify-output` — passed.
- `npm --prefix apps/local-studio run build:desktop` — passed; desktop copies preserve the original WASM.
- `(cd apps/local-studio && node_modules/.bin/wrangler deploy -c backend/wrangler.jsonc --dry-run)` — passed after adding hosted-only gzip delivery for the OpenCascade WASM asset, which exceeds Cloudflare's 25 MiB raw asset limit.
- Official Vite desktop/static preview is running under PM2 as `iam-cad-desktop-preview-8080`; GET `/`, `/samsketch`, `/cad`, `/samsketch/index.html`, `/cad-creator/index.html`, and critical bundled model-engine assets returned HTTP 200.

Open `http://127.0.0.1:8080/`, `/samsketch`, and `/cad` for the actual integrated local review. Original `:4340` Sculpt preview and `:4184` Ecommerce dashboard remain unchanged.

## NOT yet a public deployment

- The Cloudflare **live** Worker deploy failed before upload: the Mac's Wrangler OAuth token expired and could not refresh because Cloudflare's auth endpoint could not be reached. The local token was not modified.
- Mac `git push`/`git ls-remote` failed to resolve `github.com`, so commit `a8c494e` is **local only**; it has not been merged to main.
- Headless Chrome/Playwright aborts with SIGABRT on the machine. The HTML/assets/build gates passed; end-to-end browser interaction and layout review are still unverified. Do not call this a visual QA pass.
- The checked-in `apps/cad-creator/backend/worker/index.js` is a scaffold for multiple routes, despite the existing live CAD service. Do not replace the live `cad.inneranimalmedia.com/studio` Worker with the scaffold or claim the CAD domain was updated.
- The unrelated native desktop pet and its Rust/Tauri code remain uncommitted and intact. Do not absorb them into this CAD release without native verification.

## Remaining release closure

1. Restore DNS/connectivity and usable GitHub/Cloudflare auth on the authorized Mac or an appropriately configured remote terminal. Preserve credentials; do not regenerate the vault encryption key as a workaround.
2. Push `feat/local-studio-home-v1-20261022`, open/merge a reviewed PR to `main` after CI; do not force-push or merge unrelated uncommitted pet changes.
3. Verify production-grade visual and interaction behavior for the host-owned top bar, one AgentSam drawer, responsive navigation, scene selection and modeling, asset loading, CAD workspace, and desktop integration using a working browser/WebView.
4. Rebuild and verify Studio's `backend/wrangler.jsonc`, then deploy the actual `agentsam-sdk` Worker using the existing release mechanism; verify `/samsketch` and `/cad` on `agentsam.inneranimalmedia.com` afterward.
5. Resolve and test the separate production owner of `cad.inneranimalmedia.com/studio` before promoting the shared shell there. Preserve its existing functional BIM/CAM/model/robotics applications and source data.
