# ADR: CoPro Clean-Room Product Architecture

Status: Accepted

CoPro is a real visual creation product built from portable packages. MovieMode is donor evidence, not an upstream dependency.

A saved copro.project.v1 document contains creative intent and uses one integer microsecond timebase. Clips reference assetId. Renderer identity, storage-provider fields, provider IDs, credentials, machine lanes, PTYs, Workers, and VM topology are forbidden from the creative project model.

Editing is exposed through a polished GUI. Canonical mutations are implemented once as deterministic headless commands so drag, trim, split, keyboard shortcuts, touch gestures, AgentSam, undo, and redo all share the same semantics.

## Creator UI law

CoPro is not a command-line video editor.

Mobile is a first-class editing surface, not a reduced viewer. It must support preview, play/pause and seeking, horizontal timeline, selecting and dragging clips, visible trim handles, split/duplicate/delete, speed and volume tools, text/audio/captions/effects/templates, undo/redo, and export.

Desktop may expose more simultaneous panels, but ordinary edits cannot require a terminal.

## Infrastructure law

Creators see Import, Edit, Generate, Preview, Render, and Export. Runtime/provider selection happens underneath according to capabilities and policy.

## Package boundaries

copro-project owns persisted creative intent.
copro-editor owns deterministic mutation and history.
copro-timeline owns timeline math/projection.
copro-media owns portable media identity/provenance.
copro-render owns RenderPlan and backend selection.
copro-templates owns structured creative templates.
copro-provider-contracts owns provider-neutral capabilities.
copro-ui owns direct visual editing surfaces.
copro-proof owns cross-package acceptance proof.
agentsam-copro-studio composes the product.

## Media Production product-family classification (2026-10-16)

The IAM product registry groups CoPro and MovieMode into the **Media Production** family. This is a *portfolio, discovery and cross-product workflow relationship*, not a revision to the accepted dependency law. CoPro remains the independent provider-neutral creative contract and editor product. MovieMode remains an independently hosted product and a donor of proven production operations, never an upstream CoPro import or required runtime.

The hosted MovieMode D1/R2/Stream/Remotion authority is unchanged. Translating existing MovieMode timeline documents into CoPro project/asset commands requires a versioned, lossless, bidirectional compatibility adapter, authorization tests and save/reload/export evidence before changing any canonical writer. See [Media Production Family](../product/MEDIA-PRODUCTION-FAMILY.md).
