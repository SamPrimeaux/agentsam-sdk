# AgentSam Growth — Increase Sales Starter Pack v1

14 original starter configurations. No new CMS spine, D1 schema, or customer data.

Open index.html locally, or upload the dist/ contents to a single R2 key prefix so relative links remain valid. Each of the 14 pages is self-contained (inline CSS, JS and catalog), usable without external assets or live APIs.

## Contents
- index.html — clickable template gallery
- <slug>.html (14) — independently clickable and editable preview workspaces
- templates/<slug>.json — field/schema/channel/approval/scheduling/reporting contracts
- creative/<slug>/*.json — six draft asset formats per campaign
- starter-campaigns.json — whole registry for importers
- schema.json — JSON Schema shape
- manifest.json — file inventory with SHA-256 hashes

## Important boundaries
- All example copy, graphics, offer text, storefront brand, and product labels are demonstrative only. No merchant products, stock, discounts, customer contacts, sales figures, or provider authorizations are bundled.
- A preview CTA opens a simulation, never a real checkout. Approve preview is local-only, never a production approval. Export JSON packages draft configuration without modifying the database.
- A real install must resolve authoritative account, cms_site, product, variant, collection, discount, audience, CMS page, publishing, and order attribution references and enforce consent plus approvals.
- Existing CMS: cms_pages, cms_page_sections, cms_section_blocks, cms_definitions, cms_components, cms_publications, cms_assets; workflow: agentsam_workflows and agentsam_workflow_runs. Do not create another CMS authority.

R2 prefix: r2://cms/growth/starter-campaigns/increase-sales/v1/
Package: starter-campaigns-v1.zip (uploaded separately next to the manifest and previews)

## Template IDs
- product-launch — Product launch
- collection-promotion — Collection promotion
- flash-sale — Flash sale
- seasonal-sale — Seasonal sale
- bundle-offer — Bundle offer
- back-in-stock — Back in stock
- clearance-sale — Clearance sale
- preorder — Preorder campaign
- first-purchase — First-purchase offer
- customer-winback — Customer winback
- upsell-cross-sell — Upsell / cross-sell
- abandoned-checkout — Abandoned checkout
- subscription-upgrade — Subscription upgrade
- custom-sales — Custom sales campaign
