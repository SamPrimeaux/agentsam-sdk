# @inneranimalmedia/agentsam-merch

**Provider-neutral product, artwork and manufacturing planning for AgentSam and PrimeTech.**

An artwork master can serve Completeful, Printify, an independent print shop, an in-house workshop, or another production provider **without** forcing all products into a Completeful-shaped catalog.

This package owns preflight, profile data, provider-neutral product concepts, compatibility, derivative plans and the Collection Lab lifecycle. The commerce app owns storefront product state, authentication, purchase/order workflows and fulfillment; the media engine owns actual processing of artwork. PrimeTech can design the workflow but does not create another commerce authority.

## What is implemented

- Manufacturing profile registry and normalization, including generic and Completeful seed profiles.
- Deterministic compatibility statuses: `ready`, `ready_with_warning`, `ready_with_transform`, `needs_variant`, `prepared_for_digitization`, `unsupported`.
- Product concept targeting with provider selection and profile lookup.
- Source resolution/effective PPI checks, vectorization and automated-transform planning.
- Manufacture-versus-storefront derivative separation, collection candidate lifecycle and CLI planning.
- Metadata adapters for **Completeful** and **Printify**. They normalize catalog selections; they do **not** manufacture files, connect accounts or place orders.

## Source master and derivative authority

```text
immutable original/master
    ├── manufacturing/<provider>/<process>/<variant>
    ├── storefront/gallery
    ├── thumbnails
    ├── social
    └── mockups
```

A storefront mockup is never the manufacturing master. Each production derivative needs source hash, target variant/process, format, dimensions and resolution evidence, applicable color constraints, output hash, status, and any manual/digitization approval. Invalid or low-resolution art must never be silently described as production-ready.

## Manufacturing profiles, not application conditionals

Keep process rules in versioned `profiles/<manufacturer>/` and generic profiles. Profiles are rules with source/verification status, not loose documentation. The adapter does not declare new DPI or embroidery limits by guessing provider conventions.

`requirementsVerified` and `productionReady` are distinct. An `operator-defined` seed profile remains provisional until an official provider document or human owner verifies it.

## Provider adapters

`./adapters/completeful` maps Completeful metadata such as `print_type` and `file_width` into manufacturing preflight context.

`./adapters/printify` maps blueprint, print-provider, variant and placeholder identity into the **same** context. Printify print areas may include pixel measurements: the adapter accepts physical dimensions only when separately verified in inches/cm/mm; it never interprets pixels as inches.

```js
import { printifyProfileContext } from '@inneranimalmedia/agentsam-merch/adapters/printify';

const selection = printifyProfileContext(
  { id: 12, title: 'Everyday Shirt' },  // blueprint
  { id: 44 },                           // print provider
  { id: 77 },                           // selected variant
  { position: 'front', decoration_method: 'dtg' },
  { physicalSize: { width: 10, height: 12, unit: 'in' } }, // verified only
);
```

This **does not connect to Printify**, retrieve live catalog availability, upload images, create a product or initiate fulfillment. Those are separate authenticated provider-connector capabilities, with per-account installation and idempotent write receipts. Never hardcode a customer's provider account, store, R2 bucket or orders.

A future adapter can target Printful, a local printer, an embroidery digitizer, a manufacturing vendor or an offline quote process using this same neutral domain. New adapters only translate provider metadata; they cannot bypass preflight.

## Collection Lab

`concept → approved-art → production-ready → sample-ordered → sample-approved → published → retired`

An automated preflight is not a physical sample approval. User-visible candidate state and the durable product/order state are related but never conflated.

## Programmatic and CLI use

```js
import { createManufacturingProfileRegistry, buildMerchPlan } from '@inneranimalmedia/agentsam-merch';

// Register only sourced, reviewed profiles relevant to the current process.
// The engine consumes artwork and product context, not provider credentials.
const registry = createManufacturingProfileRegistry([]);
const plan = buildMerchPlan({ design: { asset: { format: 'svg' } }, products: [], registry });
```

`agentsam-merch build <manifest.json> --all-compatible` is the standalone proof path. `agentsam merch build ...` delegates to that kernel; it should not reimplement preflight.

## Acceptance before calling any provider production-ready

A real variant and placement; verified process profile; original artwork provenance; exact print size/resolution/color and file constraints; actual manufacturing derivative; digital sample/reference and human approval as appropriate; a durable production receipt; correct store/order association; retry/idempotency and tenant isolation tests.

Use `npm --prefix packages/agentsam-merch test` for package contract tests. Validate official live provider requirements separately; test fixtures do not replace production verification.
