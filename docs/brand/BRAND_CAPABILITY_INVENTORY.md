# AgentSam Brand — Existing Capability Inventory

**Snapshot:** 2026-11-22 00:xx US Central  
**Scope:** `agentsam-sdk`, `agentsam-plugin-mcp`, the connected `inneranimalmedia-business` tool/workflow registry, and the existing creative application surfaces.  
**Purpose:** establish what can be reused before adding new Brand-specific engines or workflows.

## Executive finding

The platform already has substantial asset, media, typography, 3D, storage and creative-production infrastructure. The primary gap is orchestration and evidence integration: the published Brand plugin does not yet gather the user's authorized sources into one portfolio, does not connect the existing creative editors to a Brand lifecycle, and does not expose the existing tool capabilities as a coherent workflow library.

The correct approach is to make AgentSam Brand the evidence, identity, review and production-orchestration layer. It must consume existing editors and providers rather than reimplement them.

## 1. Existing domain packages and applications

| Domain | Existing implementation | Actual capability | Status / boundary |
|---|---|---|---|
| Shared asset identity | `packages/agentsam-assets-core` | Canonical `ast_*` IDs, asset kinds, machine facts, hashes, provider representations, provenance history, master/delivery representation selection | **Implemented.** This is the shared asset identity authority; Brand and Content should not invent parallel asset identities. |
| Brand compiler | `packages/agentsam-brand` | BrandPack v1/v2, semantic asset roles, tokens, provenance, derivatives, packaging, optimization, promotion, publish receipts, verification | **Implemented, partial intelligence.** Strong asset compiler and image delivery pipeline; not a complete brand-discovery or creative-production workspace by itself. |
| Content provider runtime | `packages/agentsam-content` | Provider-neutral asset/runtime contracts, machine pass, source identity, usage, permissions, routing, jobs, events and semantic enrichment hooks | **Implemented.** Reuse its provider registry and runtime rather than creating a second storage layer. |
| Content Studio UI | `packages/agentsam-content-studio` | `ContentStudio`, `ContentLibrary`, `AssetDetail`, media dropzone, image/video/model/delivery/usage inspectors and assistant rail | **Implemented UI package.** Brand should consume/filter this shared library surface where possible, not create a competing media manager. |
| Typeface Studio | `apps/samsketch/src/typeface-studio.ts`, `src/typeface/model.ts` | Glyph outline editing with `opentype.js`, seven traced source masters, editable glyph inventory, source JSON export and TTF export | **Existing authoring surface.** Reuse from SamSketch. This is not yet evidence of full WOFF/WOFF2 conversion, variable-font axis editing or automated licensing analysis. |
| SamSketch | `apps/samsketch` | Vector authoring, scene editing, geometry and integrated Typeface Studio | **Existing editor.** Brand should hand off authoring instead of embedding a second vector/font editor. |
| CoPro media | `packages/copro-media` | Provider-neutral media asset identity, provenance and repository contracts | **Implemented foundation.** Reuse for media identity and source tracking. |
| CoPro render | `packages/copro-render` | Render planning, renderer capability selection, transitions and world/3D rendering support | **Implemented render foundation.** Reuse for production rather than building a second renderer. |
| MovieMode | `/admin/moviemode` | Timeline-based video project editing and render/export surfaces | **Existing editor.** Platform tools include `veo_generate_video`, `moviemode_render` and `moviemode_export`; Brand orchestration is not yet wired end-to-end. |
| IAMScene | `packages/iamscene` v0.1.3 | Portable editable scene format, authoring API, animation runtime, Three.js presentation and OCCT geometry pipeline | **Existing scene engine.** Brand can coordinate scenes and packages; do not create another scene format. |
| CAD / spatial | `apps/cad-creator`, `packages/agentsam-occt`, `packages/agentsam-3d-viewer` | Engineering geometry, model viewing and CAD execution | **Existing engineering surfaces.** Use for technical/spatial production; do not imply it is a brand guideline editor. |
| Image delivery | `packages/agentsam-cloudflare-images`, Brand Sharp/Cloudflare processors | Raster encoding/optimization, Cloudflare Images delivery, R2 storage and receipts | **Implemented for supported formats.** Not a universal image editor or universal file converter. |

## 2. BrandPack readers, extractors and format support

### Existing readers and extractors

| Implementation | Reads / extracts | Boundary |
|---|---|---|
| `packages/agentsam-brand/src/core/v2/ingest-graph.js` | Folder and file inventory; supported BrandPack formats; archive expansion; HTML/CSS/JS/TS/JSON/Markdown/YAML source extraction | Local Node implementation. It is not a Cloudflare Worker archive service. |
| `extractArchive()` | ZIP via system `unzip`; TAR/TGZ/TAR.GZ via system `tar`; standalone GZ via Node `zlib` | Requires local system executables for ZIP/TAR. No archive mutation; extraction is to a work directory. Nested archive recursion and archive-bomb hardening need explicit acceptance tests before claiming complete large-archive support. |
| `extractFromCode()` | Regex-based extraction of hex/RGB/OKLCH colors, CSS custom properties, `font-family` declarations and image/font/media URLs | Useful deterministic evidence, not a full CSS parser, AST parser or semantic design interpreter. |
| `packages/agentsam-brand/src/scan.js` | Repository snapshot paths, style and component evidence, token extraction, conflicts and asset-path inventory | Deterministic repository scan. It does not visually understand image content or automatically read every binary asset. The asset inventory now emits structured path/format/role/hash/size/provenance records. |
| `packages/agentsam-brand/src/core/inspect.js` | File hashing, local asset metadata inspection and SVG validation | File/asset inspection; not a general PDF/Office/font/video/3D parser. |
| `packages/agentsam-repository` snapshot/Merkle APIs | Repository tree, paths, content hashes, semantic file metadata and revision/snapshot provenance | Reuse as repository evidence authority; do not substitute arbitrary `find` output for a repository snapshot. |
| Connected Files/document readers | Read and search supported uploaded/library documents; PDF/document page inspection is available through the host Files capability | Host capability, not a reusable parser implemented inside `agentsam-brand`. Do not claim every Office or archive format has a Brand-native parser. |

### Format operation contract

`packages/agentsam-brand/src/core/capabilities.js` is the format registry. It now exposes explicit operation flags for `read`, `inspect`, `edit`, `generate`, `convert`, `optimize`, `preview`, `export`, `preserve_original` and `validate_roundtrip`.

| Family | Formats | BrandPack-level support | Important limitation |
|---|---|---|---|
| Raster | PNG, JPG/JPEG, WebP, AVIF, GIF, TIFF/TIF, HEIC/HEIF, APNG | Import; metadata inspection and preview for supported raster rows; Sharp/native encoding, conversion and optimization for supported formats; preserve source | HEIC/HEIF and APNG have narrower editing support. Generation is a separate registered media tool. |
| Vector / print | SVG, PDF, EPS, AI | SVG inspection, preview, raster conversion and export; PDF/EPS/AI import and preservation | PDF/EPS/AI are not represented as editable vectors by BrandPack. |
| Platform icons | ICO, ICNS | Import, metadata inventory and preservation | Not a complete platform-icon editor or derivative generator. |
| Fonts | TTF, OTF, WOFF, WOFF2 | Import and preserve; export remains licensing-gated | BrandPack does not itself implement full font-table inspection or font editing. Typeface Studio is the existing authoring surface. |
| Video | MP4, MOV, WebM, MKV | Import and preserve; poster-frame intent is declared for selected formats | BrandPack does not edit or transcode video. Use MovieMode/CoPro and the registered video tools. |
| Motion | Lottie JSON, Rive RIV, GIF/APNG | Import and preserve; GIF is handled as raster/animated image | Lottie/Rive are not authorable by BrandPack. A unified motion authoring workflow is not connected. |
| 3D / spatial | GLB, glTF, USDZ, OBJ, FBX, KTX2 | Import and preserve; role classification | BrandPack is not the 3D editor or universal model converter. Use IAMScene, SamSketch, CAD and Meshy where supported. |
| Tokens / theme / source docs | JSON, YAML, CSS, SCSS, Markdown, HTML | Read/inspect supported text evidence, edit token/source representations and export supported compiled forms | Regex extraction is not a complete CSS/HTML/Office semantic parser. |
| Office/interchange docs | DOCX, PPTX, XLSX, ODT, ODP, ODS, RTF, TXT, CSV, XML | Inventory and preserve; simple text formats can be handed to document readers | Deep document extraction is not implemented in BrandPack for Office formats. Use a real document reader and report unsupported parsing. |
| Archives | ZIP, TAR, GZ, TGZ, TAR.GZ | Import, inspect/extract supported containers, preserve original | Existing extractor uses local system tools for ZIP/TAR. Not a Worker-safe or universal archive service. |

`validate_roundtrip` is not claimed for these formats unless a format-specific round-trip test exists. Importing a format does not imply it can be edited, converted or exported losslessly.

## 3. Storage and provider adapters

### Brand package adapters

- `FilesystemStorageAdapter` — local filesystem representation.
- `MemoryStorageAdapter` — in-memory/test storage.
- `CloudflareR2StorageAdapter` — R2 object storage.
- `CloudflareImagesDeliveryAdapter` — Cloudflare Images delivery and upload path.
- `D1BrandRegistryAdapter` — optional metadata registry hook; it is not a complete independent Brand database.

### Shared Content providers

`packages/agentsam-content/src/providers` contains:

- `local.ts`
- `r2.ts`
- `gdrv.ts`
- `cms.ts`
- `cloudflare-images.ts`
- `cloudflare-stream.ts`

The provider contract declares `list`, `head`, `upload`, `delete` and `deliveryUrl`, with capability declarations for list/upload/delete/deliver/transform/stream/sync/download/captions/metadata. Reuse this registry and provider contract for connected storage and delivery.

## 4. Registered platform tools relevant to Brand

The connected `inneranimalmedia-business` tool catalog currently contains these relevant active tool contracts:

| Area | Registered tools | Status |
|---|---|---|
| Repository / files | `agentsam_filesystem_walk`, `agentsam_filesystem_stat_many`, `agentsam_filesystem_hash_many`, `fs_list_dir`, `fs_read_file`, `fs_search_files`, `agentsam_codebase_retrieve` | Active read/evidence tools. |
| Google Drive | `agentsam_gdrive` | Active integration reader. |
| R2 | `agentsam_r2_list`, `agentsam_r2_get` | Active storage readers. |
| Published websites | `browser_run_snapshot` | Active page capture tool. |
| Image generation | `imgx_generate_image` | Active media-generation tool. |
| Video generation | `veo_generate_video` | Active asynchronous media-generation tool. |
| Video rendering | `moviemode_render`, `moviemode_export` | Active MovieMode media tools. |
| 3D generation / transform | `meshy_image_to_3d`, `meshy_animate`, `meshy_convert` and related Meshy tools | Active media tools; individual operations have their own input constraints. |
| CAD / scene | `cad_generate`, `designstudio_asset_list`, `designstudio_scene_list` | Active engineering/design tools. |
| Brand plugin (currently deployed catalog) | `brand.get_context`, `brand.inspect`, `brand.assets.list`, `brand.asset.inspect`, `brand.usage.find`, `brand.contract.draft`, `brand.contract.save`, `brand.consistency.evaluate`, `brand.plan` | Nine existing remote tools. The new `brand.workspace.build` and `brand.sources.discover` are implemented in plugin source but are not yet present in the production D1 tool catalog until the plugin is deployed and synchronized. |

The tool catalog also contains other media and storage operations. A workflow must bind to an exact registered tool contract; do not invent tool names or infer an implementation from a package name.

## 5. Existing workflow registry

The connected `agentsam_workflows` table currently contains six workflow records:

- `cad.edit_preview` — draft
- `cad.house_baseline` — draft
- `cad.occt_step_roundtrip` — draft
- `code.index.build` — active
- `integrations.github_supabase.source_sync` — active
- `my_automation` — account-scoped draft

There are currently **no `brand.*` or `content.*` workflow registrations** in that registry. The Brand workflow keys in the product brief remain proposed until executable graph nodes are registered against exact tools and acceptance-tested.

Do not seed empty workflow shells or six more GOAP planning actions. Register only workflows with real action handlers, explicit input/output schemas, provenance, retry behavior and any required human approval nodes.

## 6. Current Brand plugin implementation

The `agentsam-plugin-mcp` repository now contains:

- `brand.workspace.build` — reviewable workspace payload: overview, asset inventory, visual portfolio, sources, usage, findings, draft BrandContract, review queue and creative-production handoffs.
- `brand.sources.discover` — authorized connection inventory with source-coverage limitations.
- MCP App resource with Overview / Assets / Sources / Usage / Review tabs and a Create handoff menu.
- Updated Brand skills for discovery, asset review, consistency, definition and planning.

The workspace builder is read-only. It does not silently approve or save a BrandContract, mutate assets or publish content. It requires actual scan evidence for the portfolio and findings; context-only mode visibly reports the missing evidence.

## 7. Gaps that must be closed before calling the full product complete

| Gap | Required work | Reuse first |
|---|---|---|
| Source acquisition is still orchestrated, not fully automatic | Connect authorized repository, Drive, R2, website and upload readers to a unified source inventory with pagination and per-source completion receipts | Content providers, repository snapshot/Merkle tools, browser capture and host Files readers |
| Archive extraction is local-only | Add a safe, bounded archive inspection/extraction path for hosted workflows; test nested archives, path traversal, expansion limits and recoverable failures | Existing `extractArchive()` as behavioral reference; do not run its local `unzip`/`tar` implementation in Workers |
| Office/document parsing is incomplete | Register real PDF/DOCX/PPTX/XLSX readers and preserve page/sheet/slide provenance | Host Files/document readers and any existing document parser already installed |
| Visual interpretation is not part of deterministic scan | Add vision-assisted asset interpretation with source references and human review | Existing image/vision capabilities; never infer identity from filename alone |
| Brand usage is not connected to all production surfaces | Trace assets/tokens through repositories, CMS, published websites, themes, scenes and media projects | AST/repository tools, Content usage inspector and browser snapshot |
| Typeface packaging is incomplete | Connect Typeface Studio project/source export to Brand asset records; add font metadata/license inspection and validated web-font packaging | Existing SamSketch Typeface Studio and `opentype.js` |
| Bespoke logo/icon authoring handoff is incomplete | Connect editable vector source, logo variants, icon-family source and export history | SamSketch vector authoring and existing Brand iconography pack builder |
| Image transformations are not orchestrated from Brand | Add a workflow around existing Sharp/Cloudflare processors with source preservation and receipts | Brand processors and shared image delivery adapters |
| Motion authoring is not unified | Connect animation source projects, preview, rendering and export; Lottie/Rive remain explicitly unsupported until an editor exists | MovieMode, CoPro and IAMScene animation runtime |
| Brand-specific scene packaging is incomplete | Add brand scene templates, asset links and render/presentation receipts | IAMScene, SamSketch and CAD/OCCT |
| Visual guidelines generation is incomplete | Generate reviewable guideline documents/presentations from approved contract and linked assets | Existing document/presentation authoring tools; no new bespoke editor |
| Workflow library is not registered | Register executable `content.*` and `brand.*` graphs in the existing `agentsam_workflows` system after their tool contracts are live | Existing workflow nodes, pinned tool references, approval nodes and output nodes |

## 8. Reuse decisions

1. `agentsam-assets-core` owns canonical asset identity and provenance.
2. `agentsam-content` owns provider-neutral storage/content operations.
3. `agentsam-content-studio` owns the reusable media-library and inspector UI.
4. `agentsam-brand` owns BrandPack, BrandContract, brand-specific classification, portfolio and review orchestration.
5. SamSketch / Typeface Studio owns vector and font authoring.
6. MovieMode / CoPro owns video and media rendering.
7. IAMScene owns editable spatial scene format and runtime.
8. CAD / OCCT owns engineering geometry.
9. The existing `agentsam_workflows` registry owns workflow definitions and execution graphs.

No new asset database, document parser, media editor, scene format, workflow engine or generic converter should be introduced until the existing implementation inventory proves a specific missing capability.
