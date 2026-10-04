# Studio CMS Harvest Tooling Lab

Purpose: use this historical CMS/storefront as both donor material and a repeatable acceptance fixture for AgentSam tooling.

Ownership rule:
account_id -> site_id -> brand/routes/layouts/navigation/content/assets/drafts/publications.
There is intentionally no tenant_id and no workspace_id in the local CMS scaffold.

Local harvester:
scripts/harvest_local_cms.py

It creates:
../studio-cms-editor-harvest-export/local/inneranimals-cms.sqlite

It extracts:
- public storefront brand tokens
- editor-shell tokens as a separate reference profile
- public routes and layout candidates
- public header/footer navigation
- products, archetypes, and journal sample content
- external asset references
- provenance and hashes
- prototype-risk findings
- empty local draft/change/publication tables

Tooling acceptance runner:
scripts/harvest_tooling_lab.py

Default safe profile exercises:
- AgentSam CLI availability
- AgentSam site-scrape unit tests with no network
- Brand processor discovery
- Brand role catalog
- Brand template catalog
- AutoRAG setup using deterministic fixture embeddings
- AutoRAG local SQLite semantic probe
- local knowledge index planning
- SQLite integrity

Local-full additionally attempts:
- Brand ingest into an isolated fixture
- Brand build into isolated fixture output

Optional public network test:
pass --scrape-url explicitly.
No repo-root is supplied to the scraper, so it stays local-only and does not upload to R2.

Hard safety boundary:
the tooling lab never deploys, publishes, syncs a site, uploads to R2, writes remote Vectorize, or writes Cloudflare Images.

The fixture has its own disposable Git repository and .agentsam directory so test runs do not contaminate the donor repo or the real SDK repository.

Suggested command:

python3 scripts/harvest_tooling_lab.py --sdk repo://agentsam-sdk --replace-export --replace-db

For the wider product, use the same acceptance fixture on:
- local CLI / desktop
- CI
- Docker
- a persistent VM or container lane

Cloudflare should remain an explicit graduation target rather than a side effect of local harvesting.
