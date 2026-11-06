---
name: agentsam-cms-ready-creation
description: >
  Prepare an independent web, UI or commerce Canvas for optional conversion
  to a real CMS theme or website while preserving its original editable
  document and using the authorized CMS source and revision owners.
metadata:
  short-description: "Full-stack CMS-capable design without automatically creating a theme"
  aliases:
    - cms-ready-canvas
    - canvas-to-theme
user-invocable: true
---

# AgentSam CMS-Ready Creation

## The boundary that must never be blurred

**Canvas ≠ CMS theme ≠ installed website ≠ published site.** A Canvas can be
an independent editable creative project while using structures that later map
cleanly into a CMS theme. Converting it is an explicit, authenticated,
validated operation, never a side effect of + New or choosing a creative vibe.

Load this skill **after** the user chooses one of the four creative directions
and the selected medium is web/app UI/commerce or the user explicitly wants
CMS conversion. Do not require it for CAD, SamSketch, SamSculpt or MovieMode.

## Build the real experience first

1. Audit the consuming host's CMS owner, project storage, permissions, page
   model, section/block settings, revisions, assets and publication workflow.
   Inspect current source and schemas; do not guess entity names from a guide.
2. Define source-backed structure: sitemap or routes, reusable components,
   blocks/sections, design tokens, editable rich content, typography,
   responsive behavior and appropriate data slots.
3. Define actual frontend states and interactions; map each required dynamic
   behavior to existing or newly authorized backend operations. No mock fetches,
   hardcoded prices/customer identities, or pretend inventory.
4. Preserve source layers, component IDs, assets and portable design
   metadata. Separate visual design intent from a particular site/theme ID.
5. Track CMS compatibility as a **mapping/validation result**, not a claim
   that the current Canvas is already deployed, bound or installed.
6. Keep preview rendering against the Canvas's current working revision
   until explicit handoff. Preview is not publication.
7. On request to convert: validate page and component mappings, required
   bindings, access, authoring restrictions, assets and draft revisions.
   Then invoke the **existing** CMS project/draft owner; never write straight
   to published R2 paths or invent a parallel theme table.
8. Publish only through the owning CMS's verified publishing workflow and
   explicit user approval. A valid draft is not a live website.

## Existing integration guidance (inspect current code before using)

The host has CMS site authority, theme-project storage and revision
functions; the SDK's `studio-website-theme-install.js` and
`studio-theme-drafts.js` coordinate theme install and drafts.
`cms-source.js` writes private R2 HTML draft revisions with version
checks. Theme-projects use canonical CMS storage, not legacy
`cms_themes` appearance presets. The actual adapter/route may evolve;
always verify current runtime capabilities and ownership.

Read on demand:
- `references/cms-handoff-map.md` for independent Canvas → CMS draft mapping.
- `references/web-fullstack-readiness.md` for real CMS-capable web behaviors.

Read `agentsam-canvas-creation` for the shared + New/choice/progressive
creation sequence. These skills guide implementation; they grant no site,
store, customer or deployment permissions.
