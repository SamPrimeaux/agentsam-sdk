# @inneranimalmedia/agentsam-merch

Portable manufacturing preflight and merch planning for AgentSam applications.

The package separates manufacturing profile **data** from execution code, provider adapters from the media engine, preserved source masters from manufacturing/storefront derivatives, and deterministic preflight from human/process-specific handoffs.

## Profile contract

Profiles are JSON under `profiles/<manufacturer>/`. Provider requirements do not belong in application conditionals.

The engine returns:

- `ready`
- `ready_with_transform`
- `needs_variant`
- `prepared_for_digitization`
- `unsupported`

A low-resolution raster is never called production-ready. An embroidery source is never represented as a finished stitch file.

## Derivative authority

```text
original/master
  ├─ manufacturing
  ├─ storefront/gallery
  ├─ thumbnail
  ├─ social
  └─ mockup
```

The manufacturing plan is marked `mustNotUseStorefrontDerivative`.

## Collection Lab

Portable candidate states:

```text
concept
approved-art
production-ready
sample-ordered
sample-approved
published
retired
```

## Provider adapters

Adapters only translate provider catalog metadata into a neutral selection context. The Completeful adapter knows field names such as `print_type` and `file_width`; manufacturing rules remain profile data.

## CLI kernel

The standalone proof is:

```text
agentsam-merch build <manifest.json> --all-compatible
```

The distributed AgentSam CLI can delegate `agentsam merch build ...` to the same `buildMerchPlan()` kernel.

Seed Completeful profiles are marked `operator-defined` until verified against provider documentation.
