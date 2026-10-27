import { useEffect, useMemo, useState } from "react";
import { adminFetch } from "../../lib/api";

type PlatformProduct = {
  id: string;
  slug: string;
  name: string;
  kind: string;
  status?: string;
  version?: string | null;
  package_name?: string | null;
  description?: string;
  collection?: string;
  thumbnail_url?: string;
  revision?: string;
};

type ProductEdit = Pick<PlatformProduct, "name" | "description" | "collection" | "thumbnail_url">;

const productMatches = (p: PlatformProduct, category: "applications" | "automations" | "templates") => {
  const value = [p.name, p.slug, p.kind, p.package_name].join(" ").toLowerCase();
  if (category === "automations") return /automation|workflow|agent-flow/.test(value) || p.kind === "script";
  if (category === "templates") return ["theme", "ui-component", "section", "block"].includes(p.kind) || /template|starter/.test(value);
  return ["app", "sdk-package", "integration", "service", "product"].includes(p.kind) && !/automation|workflow/.test(value);
};

export default function PlatformProductCatalog({
  kind, search, refresh,
}: {
  kind: "applications" | "automations" | "templates";
  search: string;
  refresh: number;
}) {
  const [products, setProducts] = useState<PlatformProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<PlatformProduct | null>(null);
  const [edit, setEdit] = useState<ProductEdit>({ name: "", description: "", collection: "", thumbnail_url: "" });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    adminFetch<{ products: PlatformProduct[] }>("/api/admin/platform/products", { signal: controller.signal })
      .then((response) => {
        if (!controller.signal.aborted) {
          setProducts(Array.isArray(response.products) ? response.products : []);
          setError("");
        }
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Product registry unavailable");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [refresh, retry]);

  const visible = useMemo(() => products.filter((p) => productMatches(p, kind))
    .filter((p) => !search || [p.name, p.slug, p.kind, p.package_name, p.collection]
      .some((v) => String(v || "").toLowerCase().includes(search.toLowerCase())))
    .sort((a,b) => a.name.localeCompare(b.name)), [products, kind, search]);

  function inspect(p: PlatformProduct) {
    setSelected(p);
    setEdit({ name: p.name, description: p.description || "", collection: p.collection || "", thumbnail_url: p.thumbnail_url || "" });
    setNotice("");
    // Bring the existing details panel into view; never make edits appear below
    // an arbitrarily long product grid without moving the viewport.
    requestAnimationFrame(() => document.getElementById("ps-product-inspector")?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    }));
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !selected.revision || saving) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await adminFetch<{ product: PlatformProduct }>(
        "/api/admin/platform/products/" + encodeURIComponent(selected.id),
        { method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...edit, revision: selected.revision }) },
      );
      setProducts((all) => all.map((p) => p.id === selected.id ? response.product : p));
      setSelected(response.product);
      setNotice("Product details saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save product details");
    } finally { setSaving(false); }
  }

  return (
    <section id="studio-catalog" className="ps-platform" aria-label="AgentSam product registry">
      <div className="ps-catalog-heading">
        <div><span className="ps-eyebrow">YOUR AGENTSAM PRODUCTS</span><h2>Find your canvas.</h2></div>
        <button type="button" className="ps-button" onClick={() => { setLoading(true); setRetry((v) => v + 1); }}>Refresh products</button>
      </div>
      <p className="ps-platform-description">Explore and manage products you own in the existing AgentSam product registry.</p>
      <p className="ps-result-count" aria-live="polite">{loading ? "Loading products…" : visible.length + " products"}</p>
      {error && <div className="ps-feedback" role="alert"><strong>Product registry unavailable</strong><p>{error}</p></div>}
      {!loading && !error && visible.length === 0 && <div className="ps-empty">
        <h3>No matching products</h3><p>Try another category or search to browse your registered products.</p>
      </div>}
      <div className="ps-catalog-grid">
        {visible.map((p) => (
          <button type="button" className="ps-product-card ps-platform-card" key={p.id} onClick={() => inspect(p)}>
            <div className="ps-product-photo">
              {p.thumbnail_url
                ? <img src={p.thumbnail_url} alt="" loading="lazy" />
                : <span className="ps-platform-initials" aria-hidden="true">{p.name.split(/\s+/).slice(0,2).map((w) => w[0]).join("").toUpperCase()}</span>}
              <span className="ps-card-arrow" aria-hidden="true">↗</span>
            </div>
            <div className="ps-product-copy"><small>{p.kind}</small><h3>{p.name}</h3>
              <div><span>{p.version || p.status || "Registered"}</span><span>{p.package_name || ""}</span></div>
            </div>
          </button>
        ))}
      </div>
      {selected && <div id="ps-product-inspector" className="ps-platform-inspector" role="region" aria-label="Edit registered product">
        <div className="ps-platform-inspector-head"><div><span className="ps-eyebrow">PRODUCT DETAILS</span><h3>{selected.name}</h3></div>
          <button className="ps-button" type="button" onClick={() => setSelected(null)}>Close</button>
        </div>
        <p>Update the presentation details of this existing AgentSam product. Repository, status, and release metadata remain managed by their authoritative systems.</p>
        <form onSubmit={(event) => void save(event)} className="ps-platform-fields">
          <label>Name<input required maxLength={160} value={edit.name || ""} onChange={(e) => setEdit((s) => ({...s,name:e.target.value}))}/></label>
          <label>Collection<input maxLength={120} value={edit.collection || ""} onChange={(e) => setEdit((s) => ({...s,collection:e.target.value}))}/></label>
          <label className="ps-platform-wide">Description<textarea maxLength={8000} rows={3} value={edit.description || ""} onChange={(e) => setEdit((s) => ({...s,description:e.target.value}))}/></label>
          <label className="ps-platform-wide">Thumbnail URL<input type="text" maxLength={2048} value={edit.thumbnail_url || ""} onChange={(e) => setEdit((s) => ({...s,thumbnail_url:e.target.value}))}/></label>
          <div className="ps-platform-wide"><button type="submit" disabled={saving || !selected.revision} className="ps-button ps-primary">{saving ? "Saving…" : "Save product details"}</button>
            {!selected.revision && <span className="ps-result-count">This product is read-only.</span>}</div>
        </form>
        {notice && <p className="ps-notice" role="status">{notice}</p>}
      </div>}
    </section>
  );
}
