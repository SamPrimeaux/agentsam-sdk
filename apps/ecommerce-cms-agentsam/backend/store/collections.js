const PRESETS = [
  {
    slug: "high-octane-performance-gear",
    title: "High Octane",
    description: "Performance-minded gear for garage nights, open roads, and redline living.",
    eyebrow: "Built for motion",
    image_url: "/assets/presets/fuel-free-time/earned-hours-hero.webp",
    accent_color: "#ff4d00",
    sort_order: 10,
    aliases: ["high-octane", "high octane", "high-octane-performance-gear"],
  },
  {
    slug: "masters",
    title: "Masters",
    description: "Refined staples for people who have put in the years and earned the hours.",
    eyebrow: "Quiet confidence",
    image_url: "/assets/presets/fuel-free-time/masters.webp",
    accent_color: "#d99142",
    sort_order: 20,
    aliases: ["masters", "masters-series", "masters series"],
  },
  {
    slug: "essentials",
    title: "Essentials",
    description: "Dependable daily drivers made for early starts, late finishes, and everything after.",
    eyebrow: "Repeat wear",
    image_url: "/assets/presets/fuel-free-time/essentials.webp",
    accent_color: "#22adae",
    sort_order: 30,
    aliases: ["essentials", "everyday-essentials", "everyday essentials"],
  },
];

function json(data, init = {}) {
  return Response.json(data, init);
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function presetFor(value) {
  const key = slugify(value);
  return PRESETS.find((preset) => preset.slug === key || preset.aliases.some((alias) => slugify(alias) === key));
}

function productSelect(where = "", order = "p.updated_at DESC") {
  return `SELECT p.*,
      COUNT(v.id) AS variant_count,
      COALESCE(SUM(v.inventory_qty), 0) AS total_inventory,
      GROUP_CONCAT(DISTINCT v.size) AS sizes,
      COALESCE((SELECT m.url FROM product_images pi JOIN media_assets m ON m.id = pi.media_asset_id WHERE pi.product_id = p.id AND pi.is_primary = 1 LIMIT 1), p.image_url) AS primary_image
    FROM products p
    LEFT JOIN product_variants v ON v.product_id = p.id
    WHERE p.status = 'active' ${where}
    GROUP BY p.id
    ORDER BY ${order}`;
}

function formatProduct(row) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    collection: row.collection,
    price_cents: row.price_cents,
    image_url: row.image_url,
    primary_image: row.primary_image || row.image_url,
    variant_count: row.variant_count ?? 0,
    total_inventory: row.total_inventory ?? 0,
    sizes: row.sizes || "",
  };
}

async function collectionRows(env) {
  try {
    const { results } = await env.DB.prepare(
      `SELECT c.*, COUNT(cp.product_id) AS product_count
       FROM store_collections c
       LEFT JOIN store_collection_products cp ON cp.collection_id = c.id
       WHERE c.status = 'active'
       GROUP BY c.id
       ORDER BY c.sort_order, c.title`
    ).all();
    if (results?.length) return results.map((row) => ({ ...row, product_count: Number(row.product_count || 0) }));
  } catch (error) {
    if (!/no such table/i.test(String(error?.message || error))) throw error;
  }

  const { results } = await env.DB.prepare(
    `SELECT collection, COUNT(*) AS product_count
     FROM products
     WHERE status = 'active' AND collection IS NOT NULL AND TRIM(collection) <> ''
     GROUP BY collection`
  ).all();
  const counts = new Map();
  for (const row of results || []) {
    const preset = presetFor(row.collection);
    counts.set(preset?.slug || slugify(row.collection), Number(row.product_count || 0));
  }
  return PRESETS.map(({ aliases, ...preset }) => ({ ...preset, status: "active", product_count: counts.get(preset.slug) || 0 }));
}

export async function listStoreCollections(env) {
  const collections = await collectionRows(env);
  return json({ ok: true, collections });
}

export async function getStoreCollection(env, requestedSlug) {
  const canonicalPreset = presetFor(requestedSlug);
  const canonicalSlug = canonicalPreset?.slug || slugify(requestedSlug);
  let collection = null;
  let products = [];

  try {
    collection = await env.DB.prepare(
      `SELECT * FROM store_collections WHERE slug = ? AND status = 'active' LIMIT 1`
    ).bind(canonicalSlug).first();
    if (collection) {
      const { results } = await env.DB.prepare(
        productSelect(
          `AND p.id IN (SELECT product_id FROM store_collection_products WHERE collection_id = ?)`,
          `(SELECT sort_order FROM store_collection_products WHERE collection_id = ? AND product_id = p.id), p.updated_at DESC`
        )
      ).bind(collection.id, collection.id).all();
      products = results || [];
    }
  } catch (error) {
    if (!/no such table/i.test(String(error?.message || error))) throw error;
  }

  if (!collection) {
    if (!canonicalPreset) return json({ error: "Collection not found" }, { status: 404 });
    const aliases = canonicalPreset.aliases.map(slugify);
    const { results } = await env.DB.prepare(productSelect()).all();
    products = (results || []).filter((product) => aliases.includes(slugify(product.collection)));
    const { aliases: _aliases, ...preset } = canonicalPreset;
    collection = { ...preset, status: "active" };
  }

  return json({ ok: true, collection: { ...collection, product_count: products.length }, products: products.map(formatProduct) });
}

export const STOREFRONT_COLLECTION_PRESETS = PRESETS;
