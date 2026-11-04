import { useMemo, useState } from "react";
import type { Product } from "./model";
import { safeMediaUrl } from "./model";
import StudioIcon from "../products/StudioIcon";

export default function CollectionProductPicker({ products, chosen, onClose, onApply }: {
  products: Product[]; chosen: number[]; onClose: () => void; onApply: (ids: number[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [selection, setSelection] = useState<number[]>(chosen);
  const selectedSet = useMemo(() => new Set(selection), [selection]);
  const results = useMemo(() => products.filter(p => {
    if (filter === "published" && p.status !== "active") return false;
    if (filter === "selected" && !selectedSet.has(p.id)) return false;
    const term = query.trim().toLowerCase();
    return !term || `${p.title} ${p.slug} ${p.collection || ""}`.toLowerCase().includes(term);
  }), [products, query, filter, selectedSet]);
  function toggle(id: number) {
    setSelection(current => current.includes(id) ? current.filter(v => v !== id) : [...current, id]);
  }
  return <div className="cs-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <section className="cs-dialog cs-picker-dialog" role="dialog" aria-modal="true" aria-label="Add products">
      <header className="cs-dialog-head">
        <div><span className="cs-overline">Your catalog</span><h2>Select collection products</h2><p>Use real products from your store. Draft products stay hidden from shoppers.</p></div>
        <button className="cs-icon-button" aria-label="Close product picker" type="button" onClick={onClose}><StudioIcon name="close"/></button>
      </header>
      <div className="cs-picker-toolbar">
        <div className="cs-input-search"><StudioIcon name="search" size={17}/><input autoFocus value={query} aria-label="Search products" onChange={e => setQuery(e.target.value)} placeholder="Search product, design, or collection" /></div>
        <select aria-label="Filter catalog" value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="all">All products</option><option value="published">Published</option><option value="selected">Selected</option>
        </select>
      </div>
      <div className="cs-product-picker-grid">
        {results.map(p => {
          const src = safeMediaUrl(p.primary_image || p.image_url);
          return <button key={p.id} type="button" className={`cs-product-choice ${selectedSet.has(p.id) ? "is-selected" : ""}`} onClick={() => toggle(p.id)} aria-pressed={selectedSet.has(p.id)}>
            <span className="cs-product-photo">{src ? <img src={src} alt={p.title} loading="lazy"/> : <span className="cs-no-media"><StudioIcon name="image"/>No media</span>}</span>
            <span className="cs-product-choice-info"><strong>{p.title}</strong><small>{p.variant_count || 0} variants · {p.status === "active" ? "Published" : p.status}</small></span>
            <span className="cs-check-icon"><StudioIcon name="check" size={13}/></span>
          </button>;
        })}
        {!results.length && <p className="cs-muted">No matching catalog products.</p>}
      </div>
      <footer className="cs-dialog-foot"><span>{selection.length} selected · max 500</span><div>
        <button className="cs-button" type="button" onClick={onClose}>Cancel</button>
        <button className="cs-button primary" type="button" disabled={selection.length > 500} onClick={() => { onApply(selection); onClose(); }}>Apply products</button>
      </div></footer>
    </section>
  </div>;
}
