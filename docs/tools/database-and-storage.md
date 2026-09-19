# Database & Storage

D1 (query/write/delete), Supabase (query/vector/write), Hyperdrive, R2 (get/put/list/delete), KV, Vectorize, and Cloudflare Images.

**15 tools** in this domain.

## `database.d1.delete` (1)

- **`agentsam_d1_delete`** (D1 Delete) — Run DELETE (or other mutate) SQL on a D1 database in your Cloudflare account. Credentials resolve from your connected Cloudflare account. _risk: high, never used_

## `database.d1.query` (1)

- **`agentsam_d1_query`** (D1 Query) — Query a D1 database in your Cloudflare account. Pass database_id (UUID) + sql. If database_id is omitted, the session workspace pin is used. List UUIDs with agentsam_cf_d1_list. _★ heavily used (654 calls)_

## `database.d1.write` (1)

- **`agentsam_d1_write`** (D1 Write) — Run mutating SQL on a D1 database in your Cloudflare account.

## `database.hyperdrive` (1)

- **`hyperdrive_schema_inspect`** (Hyperdrive Schema Inspect) — List agentsam tables and columns via Hyperdrive (read-only). _**inactive**, never used_

## `database.supabase.query` (1)

- **`agentsam_supabase_query`** (Supabase Query) — Read-only SQL on an explicitly selected Supabase/Postgres resource. Supports PostgreSQL $1 parameters.

## `database.supabase.vector` (1)

- **`agentsam_supabase_vector`** (Supabase Vector) — pgvector similarity search. Platform Hyperdrive for operators; optional project for user BYOK/customer plane. _never used_

## `database.supabase.write` (1)

- **`agentsam_supabase_write`** (Supabase Write) — Mutating SQL on an authorized Supabase/Postgres resource. Pass sql with RETURNING, or operation=insert|update|delete with table/row/set/where. _never used_

## `storage.images` (2)

- **`agentsam_cf_image_upload`** (CF Image Upload (base64)) — Upload a binary image to Cloudflare Images via base64. Writes to CF Images, R2 (S3 API), and D1 images registry. _never used_
- **`agentsam_cf_images_upload`** (CF Images Upload) — Upload an image to Cloudflare Images from a public HTTPS URL. Returns delivery URL with transform variants. Base64 not supported — image_url only. _never used_

## `storage.kv.manage` (1)

- **`agentsam_kv_manage`** (KV Manage) — List/read/write/delete Workers KV keys in the caller Cloudflare account. Namespace create/delete: use CF Bindings MCP tools separately. Never hardcode namespace or workspace ids. _never used_

## `storage.r2.delete` (1)

- **`agentsam_r2_delete`** (R2 Delete) — Delete an object from any R2 bucket. Irreversible. _risk: high, never used_

## `storage.r2.get` (1)

- **`agentsam_r2_get`** (R2 Get) — Read or fetch an object from any R2 bucket.

## `storage.r2.list` (1)

- **`agentsam_r2_list`** (R2 List Objects) — List objects in one R2 bucket (bucket required). For account-wide bucket inventory use agentsam_cf_r2_buckets instead.

## `storage.r2.put` (1)

- **`agentsam_r2_put`** (R2 Put) — Write an object to an R2 bucket the caller can access. Sets IAM customMetadata. Binary: prefer attachment_id or content_base64; content is UTF-8 text. _never used_

## `storage.vectorize` (1)

- **`agentsam_cf_vectorize`** (Cloudflare Vectorize) — Query, upsert, or delete vectors in a Vectorize index. Pass index_name and operation. _never used_
