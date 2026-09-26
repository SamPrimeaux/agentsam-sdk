# @inneranimalmedia/agentsam-sdk-brand

Portable **Brand Intelligence** + **brand-asset promotion** SDK.

```text
repository.snapshot → brand.scan → brand.resolve → brand.plan

inputs + derivatives → plan → derive → publish(adapters) → verify
```

This package does **not** encode AgentSam product filenames, Downloads paths, or
`brand === 'agentsam'` branches. Product icons live under `apps/local-studio/brand/`.

## Install / use

```js
import {
  planBrandAssetPromotion,
  promoteBrandAssets,
  MemoryStorageAdapter,
} from '@inneranimalmedia/agentsam-sdk-brand';
// or: '@inneranimalmedia/agentsam-sdk/brand'

const plan = await planBrandAssetPromotion({
  brand: 'acme',
  asset: 'app-icon',
  version: 'v1',
  inputs: [{ role: 'source', path: './master.png' }],
  derivatives: [
    { id: 'png-1024', format: 'png', width: 1024, height: 1024 },
    { id: 'webp-1024', format: 'webp', width: 1024, height: 1024, quality: 92 },
  ],
});
```

## CLI

Root (integrated):

```bash
agentsam brand plan --manifest ./brand-assets.json --json
agentsam brand promote --brand acme --asset logo --source ./m.png --derive png:512 --dry-run --json
```

Standalone package bin:

```bash
agentsam-brand plan --manifest ./brand-assets.json --json
agentsam-brand presets
```

Both call the same controller.

## Adapters

| Concern | Adapter |
|---|---|
| Storage | `FilesystemStorageAdapter`, `MemoryStorageAdapter`, `CloudflareR2StorageAdapter` |
| Delivery | `CloudflareImagesDeliveryAdapter` |
| Registry | `D1BrandRegistryAdapter` (optional) |

**Storage ≠ delivery ≠ registry.** An R2 key is never evidence of Cloudflare Images.

### Cloudflare Images identity

| Field | Env | Class | Role |
|---|---|---|---|
| Account id | `CLOUDFLARE_ACCOUNT_ID` | config | Management API `/accounts/{id}/images/v1` |
| Account hash | `CLOUDFLARE_IMAGES_ACCOUNT_HASH` | config | Delivery namespace `imagedelivery.net/{hash}/…` |
| API token | `CLOUDFLARE_IMAGES_API_TOKEN` | secret | Bearer auth; needs **Account → Images → Write** |

Fallback: `CLOUDFLARE_API_TOKEN` (broader session). Deprecated alias: `CLOUDFLARE_IMAGES_TOKEN`.

Token is opaque — no `cfat_` regex. `verifyConnection()` calls `GET …/images/v1/stats`.

Published truth requires `success === true` and non-empty `result.id`. Prefer returned `variants[]` over reconstructed URLs. Reconstruct only via `cloudflareImageUrl({ accountHash, imageId, variant })` — never from an R2 key.

AgentSam’s default delivery policy uploads **canonical PNG** to Images (CF negotiates WebP/AVIF output). That is publishing policy, not a Cloudflare input limit — platform accepts PNG/JPEG/GIF/WebP/SVG/HEIC/AVIF.

Planning and deriving work offline with zero Cloudflare auth.
