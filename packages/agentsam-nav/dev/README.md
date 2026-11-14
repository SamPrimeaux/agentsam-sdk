# AgentSam Component Atlas + independent Theme Canvas (development only)

The existing preview:components entry now opens a source-backed Component Atlas.
The previous interactive Nav and Workbench lab remains available from its toolbar.
This adds no public route, app registry, plugin install, or database table.

## Open on the Mac

Run these two commands from the SDK checkout in separate terminal sessions:

    npm --prefix packages/agentsam-nav run preview:components
    python3 -m http.server 4176 --directory packages/agentsam-nav

Then open http://localhost:4176/dev/ .

Rebuild only the source inventory:

    npm --prefix packages/agentsam-nav run inventory:components

## What is actual, what is inferred

- The source scanner walks first-party apps and packages, reads React export
  declarations, app manifests, storefront embed contracts, bundled integration
  manifests, and Canvas/theme entrypoints. Every item retains its source path,
  owner, evidence, and known route. A source record is NOT proof that its app
  is installed, plugin is connected, or UX is acceptable.
- The spatial editor renders the actual Local Studio CanvasStage, CanvasLayers,
  CanvasInspector and CanvasDocument implementation. The artboard records are
  real implementation evidence, not simulated app screenshots.
- The canvas background comes at build time from the Commerce CMS theme editor
  stage CSS via build-cms-stage.mjs. No duplicate CMS editor implementation is
  mounted or maintained.
- Design verdicts (Keep, Refine, Repair, Retire), notes, favorites and modified
  review artboards persist in local browser storage; review JSON export/import
  is available.
- New Theme Canvas starts an independent native CanvasDocument with four blank
  artboards: desktop, mobile, reusable sections and components. The Canvas can
  insert native text/frame/image/button/input/link nodes, edit via inspector,
  and import/export native Canvas JSON. It does not need a CMS website, does
  not alter production storefronts and does not publish themes.
- Existing authenticated Canvas and the CMS Theme Editor remain separate
  application surfaces. Site-specific editing and publishing are optional.

## Verify

    npm --prefix packages/agentsam-nav run test:preview

This exercises source inventory, persistence, Theme Canvas, element insertion,
desktop and mobile layout, the source-derived CMS stage background and the
original real packaged Nav/Workbench interactions. It stores screenshots
under ignored dev/.generated/ as local evidence, not production screenshots.

## Growth / Campaigns

The canonical campaign experience is the existing Commerce CMS Growth SPA:

    /apps/ecommerce-cms-agentsam?page=%2Fadmin%2Fgrowth

The former /campaigns frontend route redirects there; the old standalone
CampaignStudio component remains in source for deliberate future disposition.

## Important boundary

The local editor is a development review surface. A Canvas JSON export is
structured editable source, not proof that it was imported into authenticated
Canvas storage or published as a site theme.
