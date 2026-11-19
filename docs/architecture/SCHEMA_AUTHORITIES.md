# Schema authorities — AgentSam apps, CAD, scenes and production

**Status:** Source/R2 reconciliation audit, November 18, 2026. This document describes authorities and observed drift, not a claim that every published endpoint has been repaired.

## The critical distinction

The question "what is the schema for an app?" has more than one answer because an installable product, its settings, its user-created documents and its schema pack are **different artifacts**.

| Artifact | Authority | Scope |
| --- | --- | --- |
| Installable APP definition | `protocol/apps/agentsam.app.v1.schema.json` and each app's `agentsam.app.json` | Immutable APP identity, version, capabilities, runtime, entrypoints and mounts |
| Host installation | Existing `agentsam.host-install.v1` and installed-app database | Tenant/account-specific installation, permissions, bindings and enabled state |
| App settings | App-owned `settings.schema.json` (as applicable) | Configurable parameters; not APP identity |
| App save-state/document | App-owned `save-state.schema.json` or other domain document | User/project state, ownership and revision |
| Schema pack | App- or package-owned manifest (as applicable) | Versioned URLs, integrity of schema modules, compatibility |
| 3D scene | `packages/iamscene/schema/iamscene.v1.schema.json` | Portable `.iamscene.json` content and runtime-facing scene graph |
| CAD project | Existing `cad.project.v2.schema.json` | Native project/revision, geometry and engineering authority |
| CAD v2 modules | `protocol/cad/v2/schema-pack.manifest.json` and its 22 schema modules | Optional strict validation of domain-specific structures; not a new project root |
| CoPro project | Existing CoPro project/timeline contracts | Media timeline, edit history and synchronized assets |
| Merch profiles | Existing `agentsam.manufacturing-profile.v1` contract | Verified process constraints, provider selection, preflight and derivatives |

An APP may reference several independently versioned document schemas. A game such as Wizard Chess can therefore have one app manifest plus separately owned settings/save-state schemas without introducing a duplicate APP identity.

## IAMScene — observed publication drift

Current SDK source:
`packages/iamscene/schema/iamscene.v1.schema.json`

Package export:
`@inneranimalmedia/iamscene/schema`

Source-declared `$id` and README reference:
`https://schemas.inneranimalmedia.com/packages/iamscene/v1/scene.schema.json`

Observed published R2 object:
`inneranimalmedia-schemas/packages/iamscene/v1/scene.schema.json`

At audit time the `iamscene/v1/scene.schema.json` object was not found through connected R2. The existing `packages/...` object contains a 16,350-character older schema, while SDK source contains a 19,998-character schema. The source includes a perspective/orthographic camera union and additional material definitions absent from the older published copy.

**Correct release rule:** The npm package schema is the source of truth. Publish its exact bytes, with a verified SHA-256 receipt, under the canonical `$id` key. If the `packages/...` legacy URL is still referenced, preserve it as an exact-byte mirror or an explicit redirect—not as a second independently maintained schema. Validate representative old and new scene fixtures before replacing any same-version public schema. Do not overwrite a breaking schema at the same semantic version; publish a migrated version instead. Verify HTTP content type, cache, publicly retrievable response and SHA after uploading.

A URL resolving and JSON parsing is **not** sufficient: published bytes must match the source, and the runtime must support all schema-accepted features.

## CAD v2 — two layers, not necessarily two competing project models

Observed old root:
`apps/cad-creator/schemas/cad.project.v2.schema.json`

Observed additive module snapshot:
`apps/cad-creator/schemas/v2/schema-pack.manifest.json`

Source authority for the modular strict pack:
`protocol/cad/v2/`, with 22 modules at the inspected revision.

The current `scripts/cad/schema_pack_release.py` is already designed to publish **immutable release paths** with a mutable `registry.v1.json` pointer. That is materially different from changing the older unversioned `/v2/` snapshot in place. Source script release declaration is `2.6.13-modules.2` while the inspected unversioned R2 module manifest reports `2.6.13-modules.1`.

The root `cad.project.v2` is the project envelope and source identity. Modules add strict validation for capabilities such as architecture, parametrics, geometry relationships, revision evidence and presentation. **Do not replace the root project with a pack manifest.** Instead, formally bind module version/digest to a project revision, validate cross-references and avoid silently accepting unknown modules.

Before any registry pointer is updated: verify 22 module bytes/hash/$id/$ref, strict JSON Schema compilation, representative native project fixtures, immutable release publication, then the public registry and downstream consumer acceptance. An absent release pointer must be reported as absent; never pretend an old `/v2/` snapshot is the new release.

## Scene interoperability without destroying native sources

All spatial products should be **compatible with** IAMScene, not forcibly serialized into it as their only durable source.

- CAD, BIM, OCCT feature histories, STEP/BREP/IFC and parametric constraints remain under engineering project authority.
- SamScene, SamSketch, SamSculpt and authored world assets may export/consume `.iamscene.json` with provenance and documented supported extensions.
- MovieMode and CoPro timelines remain domain-owned; use scene references, render requests, camera paths and source revision links.
- CMS page/section scrolling belongs to `theme-scenes`; IAMScene owns time-addressable animation but not an arbitrary site's scroll behavior.
- Provider-neutral merch preflight references master artwork; it does not use scene or storefront derivatives as manufacturing masters.

When connecting documents, record `sourceUri`, `sourceRevision`, `format`, `sha256`, `units`/coordinate transform when needed, `scope` and `rendererKey`/consumer capability. Missing adapters must fail visibly, not silently down-convert or render a different scene.

## Schema publication acceptance tests

1. **Identity:** Every `$id` resolves to exact intended published bytes; no two conflicting bodies share one `$id`.
2. **Integrity:** Source hashes match manifest hashes, R2 object bytes and public HTTP bytes.
3. **Compatibility:** Representative fixtures pass; breaking changes require an explicit migration and version.
4. **Validation:** Draft 2020-12 schemas compile with all local and cross-file `$ref` targets resolved; source-specific semantic checks run separately.
5. **Runtime:** A validating document can load, render or be rejected with an intelligible unsupported-capability error.
6. **Authority:** Account-owned save-state, assets and projects remain tenant-isolated; published schema documents contain no customer identity or secrets.
7. **Distribution:** PyPI/npm/app releases and deployed R2 schema versions align through recorded package/source revisions.
8. **Evidence:** Publish receipt records Git SHA, schema URI, object key, version, SHA-256, timestamp, response status and consumer smoke results.

Keep one source owner per schema, and use redirects/mirrors only for compatibility. New URLs should be created because of meaningful domain distinctions—not merely because another feature needed a schema file.
