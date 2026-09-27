# @inneranimalmedia/agentsam-sdk-brand

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
