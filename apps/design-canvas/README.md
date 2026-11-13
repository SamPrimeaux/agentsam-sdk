# AgentSam Design Canvas — installable app source

The primary authored source is apps/design-canvas/src/DesignCanvasApp.tsx. It consumes source-backed interactive HTML artboards in public/sources. Those are the original user-provided .dc.html exports (39 AgentSam and 13 baseline onboarding screens, five separate onboarding versions and one collected onboarding artifact, plus a browser reference and three real media output views), not flattened screenshots. A custom Canvas UI lets you navigate, focus, interact with, edit, persist and export them. Source editing is not automatically applied to the Git checkout or customer storefront; edits remain local to the browser until exported.

## Local

    npm --prefix apps/design-canvas run build
    npm --prefix apps/design-canvas run doctor
    npm --prefix apps/design-canvas run preview
    # http://127.0.0.1:4178/

The same app component is mounted as the first view in packages/agentsam-nav/dev/ComponentPreview.tsx, on port 4176, with the existing native Canvas retained via the Native Canvas action.

## Install and distribute

The agentsam.app.v1 manifest is compatible with the Local Studio included-app build contract (embed.stage=design-canvas). This does NOT automatically install the app for existing accounts. For web, the generated dist must first be published to an HTTPS route, the app must be registered in the platform's canonical apps/plugin catalog, and an account must explicitly install it. Side Stage's existing renderer accepts only a catalog-validated same-origin HTTPS embed or a builtin host-rendered stage. The external plugin catalog additionally requires a real OAuth MCP endpoint, which this static app does not pretend to provide. Prefer a first-party native app registry contribution and account-scoped install. Do not create a fake connection or hardcode a localhost URL into the hosted catalog.

## Source boundaries

- All 75 HTML documents (62 existing artboards plus 13 additional versioned platform stock sources) are packaged as app-owned data and rendered inside sandboxed iframes without allow-same-origin. A narrowly allowlisted postMessage document bridge resolves only filenames in the packaged source manifest, so imported dc-import compositions work when the Side Stage host itself runs the app in an opaque origin. The bridge grants no host API, authentication, or network access.
- Original scripts may request public static assets such as CSS, support.js, reference image, GLB, and video. The app intentionally does not treat those assets as authentication or live business data.
- Source-backed artboards and onboarding screens are interactive imported design documents, not proof that checkout, billing, or user signup are wired to the live backend.
- The theme tokens are preserved under design-system/.
- The existing Local Studio native CanvasStage/CanvasInspector remain the separate canonical editor; they are not reimplemented inside this app. The localhost 4176 Native Canvas action opens the existing component while the hosted app is readied for an explicit host bridge.
- Drafts persist in localStorage and export as portable JSON. This is not server-side, multi-device persistence; the existing authenticated Canvas API is a separate authority.
- The app remains unpublished until the first-party HTTPS assets are deployed and the account explicitly installs it. Running the local build or including its registration migration does not establish a production installation.

## Platform stock and route ownership

The original 13 user-provided ZIP exports are preserved under
`public/sources/stock/<slug>/` with their HTML, dependency scripts, original
README files, provenance, SHA-256 object checksums and R2 keys in
`public/sources/stock/catalog.json`. Four baseline onboarding documents are
byte-identical to older sources; the additional stock variants do not
overwrite those originals. Design Canvas offers them under **Platform stock**
with local interactive source/inspector support.

The immutable source objects and a content-addressed catalog are stored in
the existing **`theme-store` R2 bucket** under `cms/design-stock/v1/`.
`node apps/design-canvas/scripts/publish-stock-assets.mjs` checks every file
without uploading by default; `--execute --verify` uploads to R2 and
downloads every object again for checksum verification. A catalog snapshot
publishes only after the object verification succeeds. This is separate from
both account appearance presets (`cms_themes`) and installable storefront
theme packages/site-scoped CMS drafts.

The canonical authenticated Studio entry is `/admin/design-canvas/`.
`/design-canvas/` remains the app's published static asset distribution URL
and compatibility path, not a second editor. The installed app registry
migration updates navigation and Side Stage pointers after the new mount
ships. Source document edits still require explicit export: the platform stock
catalog does not pretend to save browser-local changes into a customer's
site, inject executable source into a storefront, or bypass the installed
CMS definition/revision flow.

## Distribution and asset rights

The independently versioned AgentSam application source follows the repository's FSL-1.1-MIT licensing policy. Original imported design exports, user-provided screenshots, and upstream vendored React files remain subject to their original owners' applicable rights and licenses. Their inclusion as source-backed examples is not a claim that they are authored by AgentSam, nor that an external browser product is installed.
