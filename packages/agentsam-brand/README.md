# @inneranimalmedia/agentsam-brand

**Brand compiler** — not just an image optimizer CLI.

```text
drop anything → ingest/classify → brand.pack.json (source of truth)
                                      │
                    ┌─────────────────┼─────────────────┐
                    ▼                 ▼                 ▼
              localhost studio      ZIP export     production publish
```

## BrandPack v2

`brand.pack.json` owns:

| Graph node | Purpose |
|---|---|
| `assets[]` | Role-tagged masters + semantic derivatives |
| `tokens` | color / type / space / radius / motion |
| `rules` | logo clearspace, forbidden ops, template requirements |
| `provenance` | source → transforms → sha256 |
| `delivery` | Images / Stream / R2 policy (`role_canonical`) |

ZIP, `studio.html`, CSS tokens, icons, and CF uploads are **compiled representations**.

### CLI

```bash
# Ingest folder, previous build zip/tar/gz, or HTML/CSS for token extraction
agentsam brand ingest ./exports --brand acme --template product-saas

# Compile dist + studio + zip export
agentsam brand build --from .agentsam/brand/packs/acme

# Preview studio (prefers studio.html)
agentsam brand preview --from .agentsam/brand/dist/acme

agentsam brand templates
agentsam brand roles
agentsam brand presets
```

### Asset roles (examples)

`logo.primary` · `favicon` · `icon.app` · `hero.landscape` · `social.og` · `product.raw` · `motion.hero` · `model.product` · `type.body` · `token.color`

A 512px logo and a 512px app icon are **different assets**.

### Semantic derivatives

- **DERIVABLE** — system knows how to make it (often on-demand via Cloudflare Images)
- **MATERIALIZED** — file included in this pack export

Shared responsive ladder: `320…2560` — roles pick a subset. Logos get raster fallbacks (256/512/1024), not a giant ladder.

### Format families

Logo/vector, raster, photography, favicon, app-icon, social, video, motion-graphics, 3D, fonts (licensing gate), tokens, theme, docs, archives (zip/tar/gz containers).

Fonts default to `licensing.redistributable: false` — never dumped into client ZIPs until confirmed.

### Templates

`web-app` · `mobile-app` · `marketing-site` · `product-saas` · `spatial-3d`

### V1 still works

```bash
agentsam brand pack --brand acme --asset app-icon --source ./master.png --preset app-icon --out ./acme.zip
agentsam brand promote --brand acme --asset logo --source - --preset logo
```

Delivery policy id: **`canonical_png`** / per-role **`role_canonical`**. Prefer high-quality masters; let Cloudflare Images negotiate AVIF/WebP.

No product brand defaults (`agentsam` as brand id is rejected in the wizard).

## Image / media processors (pluggable)

**Do not** depend on abandoned `@squoosh/cli` (npm 0.7.3 — Node 12–16 only; crashes on Node 22+).

Public UX:

```bash
agentsam brand optimize ./hero.png --role hero.landscape --target web
agentsam brand optimize ./logo.png --role logo.primary --processor sharp
agentsam brand processors   # sharp | squoosh (binary) | native | cloudflare
```

Internally:

```text
Asset Pipeline
  ├── sharp          ← dependable Node path
  ├── squoosh        ← maintained Homebrew/Scoop binary (optional)
  ├── native         ← ImageMagick
  ├── cloudflare     ← edge DERIVABLE (retain master)
  ├── wasm / go      ← Studio preview / heavy queued jobs (scheduler hooks)
```

Role-aware policies choose formats (logo → lossless/SVG path; hero → AVIF+WebP; screenshots → sharper WebP). Semantic delivery names (`acme-showroom-hero-1280.avif`) are aliases — `asset.id` stays the machine identity. Cloudflare custom metadata / R2 `customMetadata` / BrandPack own SEO+provenance — not EXIF alone.

## Website composition (sibling package)

BrandPack owns **what the brand is**. Page experiences live in **`@inneranimalmedia/theme-scenes`**:

- `SECTION_CONTENT` → scene kinds (hero, bridge, product.demo, gallery, …)
- Route refs + asset roles (no hardcoded CDN / nav URLs in scenes)
- Demo adapters (`agentsam-mini-composer`, `database-editor`) — real product surfaces, not fake Meaux cards
- Themes: `foundation` → `inneranimal` → `agentsam` / `autodidact`

```bash
npm --prefix packages/theme-scenes test
```

See `packages/theme-scenes/README.md`. Studio shell (Moon Glass → Brand Studio) sits above both packages in a later tranche.

<!-- agentsam:trademark-notice -->
> Independent project. Not affiliated with, endorsed by, or sponsored by Cloudflare, Inc. or by any other company whose products are named here. Cloudflare is a registered trademark of Cloudflare, Inc. Other names are trademarks of their respective owners. See [TRADEMARKS](https://github.com/SamPrimeaux/agentsam-sdk/blob/main/TRADEMARKS.md).

## Source-driven iconography packs

`agentsam brand iconography --from <iconography.manifest.json> --out <output-dir>` builds a versioned icon family from the sources named in the manifest. The build preserves source masters, records source/output SHA-256 hashes, normalizes semantic SVG masters, emits color/size derivatives, and can invoke the configured Blender lane to author real relief GLBs and reproducible renders from source-derived masks. Blender is used for model authoring and rendering—not as a generic GLB optimizer. Generated output directories are replaceable only when they carry this kit's ownership marker; unrelated directories are never overwritten.

The current `assets/iconography/v1` source set uses the canonical InnerAnimalMedia dashboard PWA icon and the actual AgentSam Tauri desktop icon master as immutable clay-model inputs. The Local Studio public icon and upstream SVG mark remain provenance references, not substitute logo sources. It also includes 64 normalized semantic system-icon sources. The system icon paths originate from the existing Lucide UI library (ISC); they are normalized v1 masters, not yet bespoke-redrawn glyphs. Clay GLBs are presentation derivatives in icon-units and must not be used as manufacturing geometry. For apparel, laser, engraving and CNC work, use verified 2D vector masters and the merch preflight pipeline.
