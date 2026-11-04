# Collections and reusable starter products

Authority: `apps/ecommerce-cms-agentsam`.

## Runtime ownership

- `products` and `product_variants` remain the merchandise records. Products carry a verified `site_id`; the authenticated site is passed to the existing Product Studio and product/inventory handlers.
- `cms_collections` owns site/account-scoped merchandising and editorial group metadata.
- `cms_collection_items` stores ordered references. A product is not copied when added to another collection.
- `store_collections` and `store_collection_products` are retained migration inputs. The updated collection handlers no longer write to them.
- The storefront resolves its site from a registered hostname and returns only active public collections and active products.
- Shared media/content reference creation requires an installed ownership resolver. Existing asset references survive migration. This release does not advertise an unwired media/content resolver or smart-rule evaluator.

Both `/api/admin/collections` and `/api/admin/cms/collections` delegate to the same service. The existing Products → Collections view supports create, edit, visibility/status and SEO; product membership saves atomically with product/variant changes. Selection uses stable opaque collection IDs.

Collection metadata updates accept `expected_updated_at`. Conflicts return 409. Membership replacement preserves existing item IDs and presentation metadata; re-saving a product preserves its membership order.

## Explicit migration

Migration does not run during a request. The planner consumes the declared collection SQL in migration 004 and adds compatibility fields/triggers to a deployed asset-era schema. Old asset columns, timestamps and relationships are retained. It derives ownership only from existing sites, refuses unresolved ownership or duplicate handles, and never creates a guessed merchant site.

Preview a SQLite database:

```sh
ecommerce collections:migrate --sqlite ./store.sqlite --out ./collections-plan.sql
```

Apply with a consistent SQLite backup:

```sh
ecommerce collections:migrate --sqlite ./store.sqlite --apply --backup ./store-before-collections.sqlite
```

For D1, use `--d1 <installed-database-name> --remote --config <wrangler-config>`. Applying requires `--backup <new-file>`. The backup exports affected tables and their account/site ownership records, avoiding unrelated FTS tables that D1 cannot export.

To bridge an existing commerce catalog, supply `--legacy-site-id <verified-site-id>`. Claiming unscoped products additionally requires `--claim-unscoped-products` and a database with exactly one account and one site. Multi-site product ownership requires an explicit mapping; it is never inferred from a brand, domain or account name.

Legacy bridge reruns import only previously unbridged collections. They do not resurrect memberships a merchant subsequently removed. Merchant product rows and legacy grouping tables are retained.

## Starter illustrations

`frontend/theme-editor/starter-products.mjs` contains four original vector illustrations: coral tee, pocket tee, graphic tee and canvas tote. The generic preset materializer uses them in product sections unless `sampleProducts: false`.

They are editable blocks with product name, display price, image and alt text. They are stored inside a private theme project and its immutable object revisions. They create no product, variant, inventory, fulfillment or checkout records. Existing installed projects and merchant edits are not overwritten.

The asset build also emits individual SVGs and an index under `admin/illustrations/starter-products/`. The standalone distribution includes the same project/editor runtime used by the host.

## Verified scope and rollout

On November 4, 2026, the shared platform D1 was aligned: 10 existing collections retained, zero missing account owners, no product rows created. A scoped SQL backup was saved on the operator machine before applying.

Fuel N Free Time's separate live database has 25 products and 8 legacy commerce collections. Its live catalog has not been migrated by this change. Validate its site mapping and consuming Worker release together before switching its handlers.

The migration is additive. Legacy timestamp affinity and compatibility columns remain deliberate; this is semantic/runtime alignment, not a destructive table rebuild. Existing global product-slug uniqueness remains a compatibility constraint. This change does not certify PostgreSQL/S3 portability, checkout isolation, all smart collection rules, or physical iPhone Safari.

Tests cover deployed schema compatibility, idempotent legacy import, authorization, atomic product/variant/membership rollback, stale collection writes and starter draft edit/reload. Browser acceptance uses the existing packaged UI and real domain handlers with isolated SQLite/object fixtures.
