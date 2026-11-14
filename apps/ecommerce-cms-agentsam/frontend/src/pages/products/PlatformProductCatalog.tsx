import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { navigateHostedStudioRoute } from "../../lib/studio-host-navigation";
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
  display_name?: string | null;
  catalog_visibility?: "internal" | "unlisted" | "public";
  sku?: string | null;
};

type ProductEdit = Pick<PlatformProduct, "name" | "description" | "collection" | "thumbnail_url">;

/** Localhost-only candidates built from real source manifests, not database products. */
type ProductCandidate = {
  id: string; name: string; category: "templates" | "automations";
  kind: string; version?: string; package_name?: string; description: string;
  source_path: string; registry_status: string;
};

const productMatches = (p: PlatformProduct, category: "applications" | "automations" | "templates") => {
  const value = [p.name, p.slug, p.kind, p.package_name].join(" ").toLowerCase();
  if (category === "automations") return /automation|workflow|agent-flow/.test(value) || p.kind === "script";
  if (category === "templates") return ["theme", "ui-component", "section", "block"].includes(p.kind) || /template|starter/.test(value);
  return ["app", "sdk-package", "integration", "service", "product"].includes(p.kind) && !/automation|workflow/.test(value);
};

export default function PlatformProductCatalog({
  kind, search, refresh, productId,
}: {
  kind: "applications" | "automations" | "templates";
  search: string;
  refresh: number;
  productId?: string;
}) {
  const navigate = useNavigate();
  const [products, setProducts] = useState<PlatformProduct[]>([]);
  const [sourceCandidates, setSourceCandidates] = useState<ProductCandidate[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<ProductCandidate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<PlatformProduct | null>(null);
  const [edit, setEdit] = useState<ProductEdit>({ name: "", description: "", collection: "", thumbnail_url: "" });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [retry, setRetry] = useState(0);
  const [showInternal, setShowInternal] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    adminFetch<{ products: PlatformProduct[] }>("/api/admin/platform/products", { signal: controller.signal })
      .then((response) => {
        if (!controller.signal.aborted) {
          const items = Array.isArray(response.products) ? response.products : [];
          setProducts(items);
          if (productId) {
            const found = items.find(p => p.id === productId) || null;
            setSelected(found);
            setEdit(found ? {
              name: found.name, description: found.description || "",
              collection: found.collection || "", thumbnail_url: found.thumbnail_url || "",
            } : { name: "", description: "", collection: "", thumbnail_url: "" });
          }
          setError("");
        }
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Product registry unavailable");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [refresh, retry, productId]);

  useEffect(() => {
    if (!["localhost", "127.0.0.1"].includes(window.location.hostname)) return;
    const controller = new AbortController();
    void fetch("/api/dev/product-intake", { signal: controller.signal, credentials: "same-origin" })
      .then(async (response) => response.ok ? response.json() : null)
      .then((body) => {
        if (!controller.signal.aborted && body?.local_only === true && Array.isArray(body.candidates)) {
          setSourceCandidates(body.candidates);
        }
      }).catch(() => { /* Deployed catalogs never use this optional source. */ });
    return () => controller.abort();
  }, [refresh, retry]);

  const matchingCandidates = useMemo(() => sourceCandidates.filter((p) => p.category === kind)
    .filter((p) => !search || [p.name, p.description, p.kind, p.package_name, p.source_path]
      .some((v) => String(v || "").toLowerCase().includes(search.toLowerCase())))
    .sort((a, b) => a.name.localeCompare(b.name)), [sourceCandidates, kind, search]);

  const visible = useMemo(() => products.filter((p) => productMatches(p, kind))
    .filter((p) => showInternal || p.catalog_visibility !== "internal")
    .filter((p) => !search || [p.display_name, p.name, p.slug, p.kind, p.package_name, p.collection]
      .some((v) => String(v || "").toLowerCase().includes(search.toLowerCase())))
    .sort((a,b) => (a.display_name || a.name).localeCompare(b.display_name || b.name)), [products, kind, search, showInternal]);

  function inspect(p: PlatformProduct) {
    // Registered applications have a real deep-link editor, not a scroll target
    // hidden below an arbitrarily long catalog.
    const route = "/products/create/" + encodeURIComponent(p.id);
    if (!navigateHostedStudioRoute("/admin" + route)) navigate(route);
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


  if (productId) return (
    <section id="studio-product-editor" className="ps-platform ps-platform-editor" aria-label="Registered product editor">
      <div className="ps-platform-inspector-head">
        <div>
          <span className="ps-eyebrow">PRODUCT STUDIO / REGISTERED APPLICATION</span>
          <h1>{selected?.name || "Product details"}</h1>
          <p className="ps-platform-description">Edit catalog presentation. Product release, app installations and storefront publishing remain separate managed operations.</p>
        </div>
        <button type="button" className="ps-button" onClick={() => {
          if (!navigateHostedStudioRoute("/admin/products/create")) navigate("/products/create");
        }}>Back to products</button>
      </div>
      {loading && <p role="status" className="ps-result-count">Loading registered product…</p>}
      {!loading && error && <div className="ps-feedback" role="alert">
        <strong>Product registry unavailable</strong><p>{error}</p>
        <button type="button" className="ps-button" onClick={() => { setLoading(true); setRetry(n => n + 1); }}>Retry</button>
      </div>}
      {!loading && !error && !selected && <div className="ps-feedback" role="status">
        <strong>Product not found in this account</strong>
        <p>This product may be removed, or your account may not have permission to edit it.</p>
      </div>}
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

  return (
    <section id="studio-catalog" className="ps-platform" aria-label="AgentSam product registry">
      <div className="ps-catalog-heading">
        <div><span className="ps-eyebrow">YOUR AGENTSAM PRODUCTS</span><h2>Find your canvas.</h2></div>
        <div className="ps-catalog-actions">{products.some(p => p.catalog_visibility === "internal") && <button type="button" aria-pressed={showInternal} className="ps-button" onClick={() => setShowInternal(v => !v)}>{showInternal ? "Hide internal packages" : "Show internal packages"}</button>}<button type="button" className="ps-button" onClick={() => { setLoading(true); setRetry((v) => v + 1); }}>Refresh products</button></div>
      </div>
      <p className="ps-platform-description">Explore and manage products you own in the existing AgentSam product registry.</p>
      <p className="ps-result-count" aria-live="polite">{loading ? "Loading registered products…" : `${visible.length} registered products${matchingCandidates.length ? ` · ${matchingCandidates.length} local source candidates` : ""}`}</p>
      {error && <div className="ps-feedback" role="alert">
        <strong>{sourceCandidates.length && ["localhost", "127.0.0.1"].includes(window.location.hostname)
          ? "Account product registry is not connected in this local preview"
          : "Product registry unavailable"}</strong>
        <p>{sourceCandidates.length && ["localhost", "127.0.0.1"].includes(window.location.hostname)
          ? "Registered products still require the authenticated platform API. The source-backed previews below remain available for review, but are not sellable products."
          : error}</p>
      </div>}
      {!loading && !error && visible.length === 0 && matchingCandidates.length === 0 && <div className="ps-empty">
        <h3>No matching products</h3><p>Try another category or search to browse your registered products.</p>
      </div>}
      <div className="ps-catalog-grid">
        {visible.map((p) => (
          <button type="button" className="ps-product-card ps-platform-card" key={p.id} onClick={() => inspect(p)}>
            <div className="ps-product-photo">
              {p.thumbnail_url
                ? <img src={p.thumbnail_url} alt="" loading="lazy" />
                : <span className="ps-platform-initials" aria-hidden="true">{(p.display_name || p.name).split(/\s+/).slice(0,2).map((w) => w[0]).join("").toUpperCase()}</span>}
              <span className="ps-card-arrow" aria-hidden="true">↗</span>
            </div>
            <div className="ps-product-copy"><small>{p.kind}</small><h3>{p.display_name || p.name}</h3>
              <div><span>{p.version || p.status || "Registered"}</span><span>{p.package_name || ""}</span></div>
            </div>
          </button>
        ))}
      </div>
      {matchingCandidates.length > 0 && <>
        <div className="ps-catalog-heading" style={{ marginTop: 28, marginBottom: 12 }}>
          <div><span className="ps-eyebrow">SOURCE LIBRARY · LOCAL PREVIEW</span><h3 style={{ margin: 0 }}>Ready to curate</h3></div>
        </div>
        <p className="ps-platform-description">These packages and workflows were discovered from real source files on this Mac. They are not products in your account, and they have not been uploaded, priced or published.</p>
        <div className="ps-catalog-grid">
          {matchingCandidates.map((candidate) => (
            <button type="button" className="ps-product-card ps-platform-card" key={candidate.id}
              onClick={() => setSelectedCandidate(candidate)} aria-label={`Inspect source candidate ${candidate.name}`}>
              <div className="ps-product-photo">
                <span className="ps-platform-initials" aria-hidden="true">{candidate.name.split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase()}</span>
                <span className="ps-card-arrow" aria-hidden="true">↗</span>
              </div>
              <div className="ps-product-copy"><small>{candidate.kind} · local candidate</small><h3>{candidate.name}</h3>
                <div><span>{candidate.version || "Local"}</span><span>Not published</span></div>
              </div>
            </button>
          ))}
        </div>
      </>}
      {selectedCandidate && <div className="ps-platform-inspector" role="region" aria-label="Source candidate details">
        <div className="ps-platform-inspector-head"><div><span className="ps-eyebrow">LOCAL SOURCE · NOT A PRODUCT</span><h3>{selectedCandidate.name}</h3></div>
          <button className="ps-button" type="button" onClick={() => setSelectedCandidate(null)}>Close</button>
        </div>
        <p>{selectedCandidate.description}</p>
        <p><strong>Source:</strong> <code>{selectedCandidate.source_path}</code></p>
        <p><strong>Status:</strong> {selectedCandidate.registry_status} · No pricing, registration or publish action has been performed.</p>
      </div>}

    </section>
  );
}
