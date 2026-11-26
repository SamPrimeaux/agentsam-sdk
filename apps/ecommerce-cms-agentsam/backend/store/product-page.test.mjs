import test from "node:test";
import assert from "node:assert/strict";
import { resolvePublicProductRoute } from "./product-page.js";

function fixture({ products = [], redirects = [] } = {}) {
  return {
    DB: {
      prepare(sql) {
        const statement = {
          values: [],
          bind(...values) { this.values = values; return this; },
          async first() {
            if (sql.includes("FROM products WHERE slug = ?")) {
              const [slug, siteId] = this.values;
              return products.find((row) => row.slug === slug && row.site_id === siteId && row.status === "active") || null;
            }
            if (sql.includes("FROM product_slug_redirects")) {
              const [oldSlug, siteId] = this.values;
              const redirect = redirects.find((row) => row.old_slug === oldSlug);
              const product = products.find((row) => row.id === redirect?.product_id && row.site_id === siteId && row.status === "active");
              return product ? { slug: product.slug } : null;
            }
            throw new Error(`Unexpected SQL: ${sql}`);
          },
        };
        return statement;
      },
    },
  };
}

const sites = {
  "store-a.example": { id: "site-a", primary_domain: "store-a.example", status: "active" },
  "store-b.example": { id: "site-b", primary_domain: "store-b.example", status: "active" },
};
const resolveSite = async (_env, { hostname }) => sites[hostname] || null;

test("identical product slugs resolve only inside the request host's site", async () => {
  const env = fixture({ products: [
    { id: 1, slug: "crewneck", site_id: "site-a", status: "active", title: "A Crewneck" },
    { id: 2, slug: "crewneck", site_id: "site-b", status: "active", title: "B Crewneck" },
  ] });
  const a = await resolvePublicProductRoute(env, "crewneck", new URL("https://store-a.example/products/crewneck"), resolveSite);
  const b = await resolvePublicProductRoute(env, "crewneck", new URL("https://store-b.example/products/crewneck"), resolveSite);
  assert.equal(a.product.title, "A Crewneck");
  assert.equal(b.product.title, "B Crewneck");
  assert.equal(a.site.id, "site-a");
  assert.equal(b.site.id, "site-b");
});

test("legacy slug redirects cannot cross storefront site boundaries", async () => {
  const env = fixture({
    products: [{ id: 2, slug: "current-b", site_id: "site-b", status: "active" }],
    redirects: [{ old_slug: "old", product_id: 2 }],
  });
  const a = await resolvePublicProductRoute(env, "old", new URL("https://store-a.example/products/old"), resolveSite);
  const b = await resolvePublicProductRoute(env, "old", new URL("https://store-b.example/products/old"), resolveSite);
  assert.equal(a.redirectSlug, null);
  assert.equal(b.redirectSlug, "current-b");
});

test("missing host or unpublished product never falls back to another site's record", async () => {
  const env = fixture({ products: [{ id: 1, slug: "draft", site_id: "site-a", status: "draft" }] });
  const missingHost = await resolvePublicProductRoute(env, "draft", new URL("https://unknown.example/products/draft"), resolveSite);
  const unpublished = await resolvePublicProductRoute(env, "draft", new URL("https://store-a.example/products/draft"), resolveSite);
  assert.equal(missingHost.product, null);
  assert.equal(unpublished.product, null);
});
