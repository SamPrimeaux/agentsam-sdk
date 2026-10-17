# Canonical case-study blueprint adapter

This app folder belongs to `@inneranimalmedia/ecommerce-cms-agentsam` in **agentsam-sdk**. It is not a new CMS/editor. The CLI here normalizes machine discovery receipts into **draft proposals** for the app's existing D1/R2 workflow.

## Storage and authority
- Git owns the portable blueprint source contract and repeatable compiler.
- Dedicated CMS R2 binding owns immutable compiled implementation, previews, and manifests after approval. Never silently upload to the SDK/chat R2 bucket.
- `cms_component_templates` records discovered or proposed source assets/SKUs. Source file/hash are preserved.
- `cms_definitions` is the account-scoped authority for approved section and block definitions. Fields and blocks must conform to the runtime editor schema.
- `cms_page_sections`/`cms_section_blocks` own placed instances and their identity, settings and order. **Do not insert page placements during intake.**
- `cms_assets`/configured media provider owns media records. Source URL is a hint, not an authoritative media ID.
- `agentsam_artifacts` records provenance/output in the main IAM install. The FNF packaged runtime currently uses `cms_artifacts`; its adapter remains unresolved. Do not pretend the two schemas are interchangeable or add a third authority.
- The CMS private revision + explicit publish workflow owns publication.

## Corrected model
Legacy `CaseStudy{sku,slug,sections:Section[]}` is an **input storyboard**, not a canonical renderer/persistence shape. Its `Section.sku` is a reusable structural identifier, not a placed section instance ID; media `src` is not a validated asset reference. Every installed placement requires a durable ID, `definition_key`, `definition_version`, ordered settings and block hierarchy. A page preset is a reusable ordered recipe, not a published page.

## CLI machine intake
```sh
node apps/ecommerce-cms-agentsam/bin/cms-blueprint-intake.mjs \
  apps/ecommerce-cms-agentsam/blueprints/editorial-case-study/receipt.example.json \
  /tmp/cms-intake-output
```
Input: a JSON receipt from existing authorized CLI/Machine discovery, with `sources[]`, optional `project`, `brand`, `tokens`, and `content`. Outputs: `intake.json`, `inventory.csv`, `content-intake.json`, `page-proposal.json`. The compiler is deterministic and offline; no D1, R2, page or repository mutations.

## Acceptance gate before promotion
Confirm file hashes and provenance, usage rights, stable structural keys, SKU collisions in live D1, typed settings compatible with existing CMS editor, media resolution, R2 artifact validation, scoped CSS, responsive/accessibility behavior, duplicate-instance isolation, private autosave/reload and deliberate publish. Untested discoveries remain draft.
