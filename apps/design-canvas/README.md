# AgentSam Design Canvas — installable app source

The primary authored source is apps/design-canvas/src/DesignCanvasApp.tsx. AgentSam Design provides eight creative destinations: Page, Document, Spreadsheet, Slides, Design, Create in Code, Design System, and Whiteboard. Code hands off to the existing AgentSam Work IDE and shared composer; it does not mount a second code editor. The app includes an eight-slide Brand Guidelines presentation, native editable slide/design objects, selection-driven properties, comments, and clean empty states for newly created design systems. The original source-backed interactive HTML artboards remain available through the Reference Library; they are preserved as original source documents and are not flattened screenshots.

The shared resizable workspace frame is reused from @inneranimalmedia/agentsam-workbench. The app accepts host-owned artifact and assistant callbacks (initialArtifacts, onArtifactsChange, onAskAgentSam, onShareArtifact, and onSaveToLibrary). When embedded without a host artifact callback, it uses the existing authenticated Work Canvas API and agentsam_artifacts registry with revision-aware saves; standalone preview drafts remain browser-local only. It does not create a second creative artifact registry.

## Local

    npm --prefix apps/design-canvas run build
    npm --prefix apps/design-canvas run doctor
    npm --prefix apps/design-canvas run preview
    # http://127.0.0.1:4178/


## Creative workspaces

- **Page** provides native editable blocks, paragraphs, callouts, bullet lists and persistent task checklists. The To-do List starter includes an AgentSam instruction for gathering tasks from relevant conversations and connected apps without inventing deadlines or overwriting user edits.
- **Document** provides a structured writing surface with editable headings, paragraphs, bullet lists and callouts. The first starter is a Project Brief.
- **Spreadsheet** provides editable sheets, typed status/priority/date cells, row and column creation, and basic SUM, AVERAGE, COUNT, COUNTA, MIN and MAX formulas. The first starter is a blank Project Tracker.
- **Slides** creates a blank presentation or an eight-slide Brand Guidelines starter. Slides, text, shapes, images, charts, and tables are structured editable objects.
- **Design** opens an empty artboard workspace. Users add artboards, layers, text, shapes, images, and sanitized editable SVGs; the Reference Library keeps the original interactive HTML source documents intact.
- **Design System** starts with zero user tokens and a complete editor: Overview, Colors, Typography, Spacing, Corner radius, Shadows, Components, Assets, and Files. Platform UI and section structure are present without fabricating user-owned values.
- The editor uses the shared DesignWorkspaceFrame for resizable explorer/stage/inspector panes. The tool surface includes insert menus, slide and object layers, position/size/appearance controls, undo/redo, zoom, grid/snap/safe guides, JSON source inspection, comments, and presentation mode with optional speaker notes. AgentSam is invoked through the host-supplied onAskAgentSam callback rather than a second embedded assistant runtime.
- Document actions support rename, duplicate, pin, delete, editable JSON export, and type conversion where supported. Share, Save to Library, and Code handoff appear only when the host supplies real callbacks. Unsupported move, permission, feedback, and refresh actions stay hidden rather than appearing as disabled promises.
- The standalone preview stores drafts in browser local storage under agentsam.design-canvas.creative-workspace.v1. Hosted Local Studio use reads and writes Page, Document, Spreadsheet, Slides, Design and Design System artifacts through the existing authenticated Work Canvas API with revision-aware saves.

The same app component is mounted as the first view in packages/agentsam-nav/dev/ComponentPreview.tsx, on port 4176, with the existing native Canvas retained via the Native Canvas action.

## Install and distribute

The agentsam.app.v1 manifest is compatible with the Local Studio included-app build contract (embed.stage=design-canvas). Publishing the npm package distributes the built app; it does NOT automatically deploy the hosted route, register the app in the canonical apps catalog, or install it for existing accounts. Hosted web availability still requires the generated dist on an HTTPS route, canonical app registration, and explicit account installation. Side Stage's existing renderer accepts only a catalog-validated same-origin HTTPS embed or a builtin host-rendered stage. The external plugin catalog additionally requires a real OAuth MCP endpoint, which this static app does not pretend to provide. Prefer a first-party native app registry contribution and account-scoped install. Do not create a fake connection or hardcode a localhost URL into the hosted catalog.

## Source boundaries

- All 78 HTML documents (62 existing artboards plus 16 versioned platform stock sources) are packaged as app-owned data and rendered inside sandboxed iframes without allow-same-origin. A narrowly allowlisted postMessage document bridge resolves only filenames in the packaged source manifest, so imported dc-import compositions work when the Side Stage host itself runs the app in an opaque origin. The bridge grants no host API, authentication, or network access.
- Original scripts may request public static assets such as CSS, support.js, reference image, GLB, and video. The app intentionally does not treat those assets as authentication or live business data.
- Source-backed artboards and onboarding screens are interactive imported design documents, not proof that checkout, billing, or user signup are wired to the live backend.
- The theme tokens are preserved under design-system/.
- Design Canvas is a dedicated creative workspace using the shared DesignWorkspaceFrame; it is not a replacement for the separate Local Studio native CanvasStage/CanvasInspector. The Native Canvas entry remains available for that existing editor.
- Standalone drafts persist in localStorage and export as portable JSON. Hosted Local Studio documents use the existing authenticated Work Canvas API and artifact registry for account-level persistence.
- npm publication and hosted installation are separate release steps. Publishing the package does not deploy first-party HTTPS assets or install the app for an account; those remain explicit host/catalog operations.

## Platform stock and route ownership

The original 13 user-provided ZIP exports and two further onboarding collection boards are preserved under
`public/sources/stock/<slug>/` with their HTML, dependency scripts, original
README files, provenance, SHA-256 object checksums and R2 keys in
`public/sources/stock/catalog.json`. Four baseline onboarding documents are
byte-identical to older sources; the additional stock variants do not
overwrite those originals. Design Canvas offers them under **Platform stock**
with local interactive source/inspector support.

**CMS stock source storage v2** now uses stable component references such as
`cms-component:platform/start-trial-checkout@1.0.0`, stored separately from
object paths. The existing `theme-store` bucket contains:

- `packages/platform/start-trial-checkout/1.0.0/manifest.json` — immutable
  version metadata, renderer identity, source file names and blob checksums
- `blobs/sha256/7c/7c2175...` — immutable deduplicated file bytes
- `catalogs/cms-components/releases/<index-sha256>.json` — content-addressed
  snapshot of the platform's stock component release inventory

`node apps/design-canvas/scripts/publish-stock-assets.mjs` performs a dry-run
by default; `--execute` uploads and verifies each missing blob before publishing
its version manifest, then the index last. It fails if a published version's
manifest contents change; bump `release_version` to publish a new release.
The original `catalog.json` is source provenance, not an additional runtime
registry. CMS identity/version assignment remains in `cms_components.package_ref`
and its existing artifact fields. Customer installations still use site-scoped
CMS drafts, not executable copies of these authoring exports.

The original `cms/design-stock/v1/` URLs remain readable. The old publisher
is preserved as `publish-stock-assets-legacy-v1.mjs` for compatibility only;
new releases use v2. No source preview URLs, site themes, or dashboard
appearance presets (`cms_themes`) are changed by packaging.

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

## Production integration boundary

- The existing `agentsam_artifacts` registry remains the artifact authority. The current `work-canvas` API persists creative documents in its `creativeWorkspace` envelope and records the creative type/schema in existing artifact metadata. The storage row still uses `artifact_type='design-canvas'`; this is not a separate Slides or Design System artifact family. The API validates the envelope and collection bounds, but does not yet deeply validate every nested slide/object/property shape. Harden that validation on the existing API path; do not create a creative-app registry.
- The live `studio_templates` catalog currently has CAD, SamSketch, shared scene/model/BIM resources, and other existing resource kinds, but no Slides, Brand Guidelines, Portfolio, or Design System starter records. The Brand Guidelines and generic slide layouts in this localhost review are local preview starters, not production stock-template records. Before hosted distribution, register the approved Brand Guidelines and Portfolio decks in the existing `studio_templates` + R2 lifecycle and load them through the host template adapter. Do not make the package's TypeScript constants the production stock-template authority.
- The hosted `CreativeWorkspaceStage` supplies the existing artifact persistence, outputs/files handoff, and AgentSam chat-draft context handoff. It does not yet supply real artifact-sharing or Save to Library callbacks. Those controls must remain absent until connected to the existing artifact/share and Library authorities; do not simulate sharing with a copied private URL or add a parallel registry.
- The standalone localhost preview does not write to production D1 or R2. Embedded Local Studio uses the existing authenticated artifact API; template publication and catalog changes remain separate, explicit operations.
