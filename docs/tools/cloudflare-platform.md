# Cloudflare Platform

Account-level Cloudflare operations: listing Workers/D1/KV/R2, fetching Worker code, and searching Cloudflare docs. NOT data operations inside those resources — see Database & Storage for that.

**9 tools** in this domain.

## `cloudflare` (1)

- **`cloudflare_whoami`** (Cloudflare Whoami) — Redacted Cloudflare credential diagnostics for the authenticated MCP actor. Returns credential_source, account ids/names, token verify status — never secrets. _never used_

## `cloudflare.d1` (1)

- **`agentsam_cf_d1_list`** (Cloudflare D1 List) — List D1 databases in your connected Cloudflare account. Returns name + database_id (UUID) for use with agentsam_d1_query.

## `cloudflare.docs` (2)

- **`migrate_pages_to_workers_guide`** (Pages → Workers Migration Guide) — Fetch Cloudflare guidance for migrating Pages projects to Workers. Use when planning framework or deploy path changes. _never used_
- **`search_cloudflare_documentation`** (Search Cloudflare Documentation) — Search current Cloudflare product documentation (Workers, D1, R2, Workers AI, Pages, Zero Trust, etc.). Prefer over pretraining for limits, APIs, compatibility dates, and pricing. _never used_

## `cloudflare.kv` (1)

- **`agentsam_cf_kv_list`** (Cloudflare KV Namespaces) — List KV namespaces in your connected Cloudflare account via Bindings MCP. Use agentsam_kv_manage for key read/write. _never used_

## `cloudflare.r2` (1)

- **`agentsam_cf_r2_buckets`** (Cloudflare R2 Buckets) — List R2 buckets in the Cloudflare account via Bindings MCP r2_buckets_list. No required args. Optional cursor, direction, name_contains, per_page, start_after. Object listing is agentsam_r2_list. _never used_

## `cloudflare.workers` (3)

- **`agentsam_cf_worker_code`** (Cloudflare Worker Code) — Fetch Worker script source code via Bindings MCP. _never used_
- **`agentsam_cf_worker_get`** (Cloudflare Worker Get) — READ-ONLY discovery: get one Worker script metadata via Bindings MCP (remote_tool=workers_get_worker). Not a deploy tool — use agentsam_worker_deploy to ship. _never used_
- **`agentsam_cf_workers_list`** (Cloudflare Workers List) — READ-ONLY discovery: list Worker scripts in the connected Cloudflare account via Bindings MCP (remote_tool=workers_list). Not a deploy tool — use agentsam_worker_deploy to ship.
