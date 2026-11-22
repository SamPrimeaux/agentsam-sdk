import { useEffect, useMemo, useState } from "react";
import { adminFetch } from "../../lib/api";
import { navigateHostedStudioRoute } from "../../lib/studio-host-navigation";
import { collectionSiteId } from "../collections/model";

type MerchantProduct = {
  id: number;
  title: string;
  slug: string;
  description?: string;
  product_kind?: string;
  registry_id?: string | null;
  status: string;
  image_url?: string | null;
  site_id: string;
  site_name?: string;
  collection?: string | null;
  collection_names?: string | null;
  price_cents?: number | null;
};
type CatalogKind = "all" | "applications" | "automations" | "templates" | "apparel" | "accessories";

function matchesKind(product: MerchantProduct, kind: CatalogKind) {
  const actual = product.product_kind || "";
  if (kind === "applications") return ["app", "app_embed", "plugin", "service", "subscription"].includes(actual);
  if (kind === "automations") return ["automation", "workflow", "agent", "procedure"].includes(actual);
  if (kind === "templates") return ["theme", "template", "digital_download"].includes(actual);
  return true;
}

function openProduct(siteId: string, id?: number) {
  const params = new URLSearchParams({ site_id: siteId });
  if (id !== undefined) params.set("id", String(id));
  const destination = "/admin/product-edit?" + params.toString();
  if (!navigateHostedStudioRoute(destination)) window.location.assign(destination);
}

export default function MerchantProductCatalog({ kind, search, refresh, registryId }: {
  kind: CatalogKind; search: string; refresh: number; registryId?: string;
}) {
  const siteId = collectionSiteId();
  const [products, setProducts] = useState<MerchantProduct[]>([]);
  const [sites, setSites] = useState<{id: string; name: string; status?: string}[]>([]);
  const [createSite, setCreateSite] = useState(siteId || "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const path = siteId ? "/api/admin/products?site_id=" + encodeURIComponent(siteId) : "/api/admin/products?scope=account";
    adminFetch<{ok: boolean; products?: MerchantProduct[]; error?: string}>(path, {signal: controller.signal})
      .then(result => {
        if (controller.signal.aborted) return;
        if (!result.ok) throw new Error(result.error || "Product catalog unavailable");
        const rows = (result.products || []).filter(p => Number.isInteger(p.id) && Boolean(p.site_id));
        setProducts(rows);

      })
      .catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Product catalog unavailable"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [siteId, refresh, retry]);

  useEffect(() => {
    const controller = new AbortController();
    if (siteId) {
      setCreateSite(siteId);
      return () => controller.abort();
    }
    adminFetch<{ok: boolean; sites?: {id: string; name: string; status?: string}[]}>("/api/admin/cms/sites", {signal: controller.signal})
      .then(result => {
        if (controller.signal.aborted || !result.ok) return;
        const available = (result.sites || []).filter(site => site.status === "active");
        setSites(available);
        setCreateSite(current => available.some(site => site.id === current) ? current : available.length === 1 ? available[0].id : "");
      })
      .catch(() => { if (!controller.signal.aborted) setSites([]); });
    return () => controller.abort();
  }, [siteId, retry]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return products.filter(p => (!registryId || p.registry_id === registryId) && matchesKind(p, kind) &&
      (!query || [p.title, p.slug, p.description, p.product_kind, p.site_name, p.collection, p.collection_names].some(v => v?.toLowerCase().includes(query))));
  }, [products, search, kind, registryId]);

  return <section id="studio-catalog" className="ps-platform-catalog">
    <div className="ps-catalog-heading">
      <div><span className="ps-eyebrow">MERCHANT CATALOG</span><h2>{registryId ? "Linked product" : "My products"}</h2></div>
      <div className="ps-catalog-heading-actions">
        {!siteId && sites.length > 0 && <label>Store <select aria-label="Store for new product" value={createSite} onChange={e => setCreateSite(e.target.value)}>
          <option value="">Choose a store</option>{sites.map(site => <option value={site.id} key={site.id}>{site.name}</option>)}
        </select></label>}
        <button type="button" className="ps-button ps-primary" disabled={!createSite || loading || Boolean(error)} onClick={() => openProduct(createSite)}>+ Create product</button>
      </div>
    </div>
    {!siteId && !sites.length && !loading && <p role="status">Select an active store to create a product.</p>}
    <p className="ps-platform-description">Manage products in your actual store catalog. Source packages and supplier inventory are separate.</p>
    {loading && <p role="status">Loading products…</p>}
    {!loading && error && <div className="ps-feedback" role="alert"><strong>Products unavailable</strong><p>{error}</p><button type="button" className="ps-button" onClick={() => setRetry(n => n + 1)}>Retry</button></div>}
    {!loading && !error && <p className="ps-result-count">{visible.length} {visible.length === 1 ? "product" : "products"}</p>}
    {!loading && !error && visible.length === 0 && <div className="ps-feedback" role="status">
      {registryId ? "No merchant product is linked to this registry entry." : "No products match this selection."}
    </div>}
    {!loading && !error && <div className="ps-catalog-grid">
      {visible.map(p => <button type="button" className="ps-product-card ps-platform-card" key={p.id} onClick={() => openProduct(p.site_id, p.id)} aria-label={`Edit ${p.title}`}>
        <div className="ps-product-photo">{p.image_url ? <img src={p.image_url} alt="" loading="lazy" /> : <span className="ps-platform-initials" aria-hidden="true">{p.title.split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase()}</span>}
          <span className="ps-card-arrow" aria-hidden="true">↗</span></div>
        <div className="ps-product-copy"><small>{(p.product_kind || "product").replaceAll("_", " ")}</small><h3>{p.title}</h3>
          <div><span>{p.status}</span><span>{p.site_name || p.site_id}</span></div>
        </div>
      </button>)}
    </div>}
  </section>;
}
