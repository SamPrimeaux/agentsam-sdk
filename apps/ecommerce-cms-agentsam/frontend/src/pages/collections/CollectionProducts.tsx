import { useMemo, useState } from "react";
import type { Product, SupplierBlank } from "./model";
import { STARTER_KITS, safeMediaUrl, supplierId, supplierImage } from "./model";
import { collectionsApi } from "./api";
import StudioIcon from "../products/StudioIcon";
import CollectionProductPicker from "./CollectionProductPicker";
import { resolveAssortmentCandidates, type AssortmentSlotMatch } from "../../../../../../packages/agentsam-merch/src/collection-planning.js";

export default function CollectionProducts({ products, selected, onSelect, plan, onPlan, onOpenStudio, onScaffold, onRefresh, collectionId }: {
  products: Product[]; selected: number[]; onSelect: (ids: number[]) => void;
  plan: string[]; onPlan: (ids: string[]) => void; onOpenStudio: (supplierId?: string) => Promise<void>;
  onScaffold: () => Promise<void>;
  onRefresh: () => Promise<void>;
  collectionId?: string | null;
}) {
  const [picker, setPicker] = useState(false);
  const [supplierQuery, setSupplierQuery] = useState("");
  const [supplierBusy, setSupplierBusy] = useState(false);
  const [scaffolding, setScaffolding] = useState(false);
  const [supplierError, setSupplierError] = useState("");
  const [blanks, setBlanks] = useState<SupplierBlank[]>([]);
  const [packResult, setPackResult] = useState<{ label: string; slots: AssortmentSlotMatch[]; missing: string[] } | null>(null);
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [dragging, setDragging] = useState<number | null>(null);
  const order = useMemo(() => new Map(selected.map((id, index) => [id, index])), [selected]);
  const selectedProducts = useMemo(() => products.filter(p => order.has(p.id)).sort((a,b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)), [products, order]);
  const missingIds = selected.filter(id => !products.some(p => p.id === id));
  async function search(terms: string[], kit?: typeof STARTER_KITS[number]) {
    setSupplierBusy(true); setSupplierError(""); setPackResult(null);
    try {
      const data = await Promise.all(terms.map(t => collectionsApi.supplier(t)));
      const found = new Map<string, SupplierBlank>();
      for (const item of data.flat()) {
        const id = supplierId(item);
        if (id && item.available !== 0 && item.available !== false && Number(item.variant_count || 0) > 0 && !found.has(id)) found.set(id, item);
      }
      setBlanks([...found.values()].slice(0, 36));
      if (kit) {
        const resolved = resolveAssortmentCandidates(kit.id,
          Object.fromEntries(kit.slots.map((slot, index) => [slot, data[index] || []])));
        setPackResult({ label: kit.label, slots: resolved.slots, missing: resolved.missing_slots });
        const next = [...new Set([...plan, ...resolved.recommended_ids])].slice(0, 24);
        if (next.length !== plan.length) onPlan(next);
        if (resolved.missing_slots.length) setSupplierError(
          "Some pack slots are unavailable in the connected catalog; missing products were not invented or added."
        );
      } else if (!found.size) setSupplierError("No available supplier blanks matched. Try a different term.");
    } catch (e) { setSupplierError(e instanceof Error ? e.message : "Supplier catalog unavailable"); }
    finally { setSupplierBusy(false); }
  }
  function reorder(id: number, delta: number) {
    const index = selected.indexOf(id);
    const next = index + delta;
    if (index < 0 || next < 0 || next >= selected.length) return;
    const reordered = [...selected];
    [reordered[index], reordered[next]] = [reordered[next], reordered[index]];
    onSelect(reordered);
  }
  function dropAt(id: number) {
    if (dragging === null || dragging === id) return;
    const next = [...selected];
    const old = next.indexOf(dragging);
    const into = next.indexOf(id);
    if (old < 0 || into < 0) return;
    next.splice(old, 1);
    next.splice(into, 0, dragging);
    onSelect(next);
    setDragging(null);
  }
  return <div className="cs-tab-stack">
    <section className="cs-panel cs-products-panel">
      <header className="cs-section-head">
        <div><span className="cs-overline">01 / CURATE</span><h2>Products in this collection <span className="cs-count">{selected.length}</span></h2><p>Choose and order your actual catalog products. Only published products appear in the storefront.</p></div>
        <button className="cs-button primary" type="button" onClick={() => setPicker(true)}><StudioIcon name="layers" size={16}/> Add products</button>
      </header>
      <div className="cs-mini-toolbar">
        <span>{selectedProducts.filter(p => p.status === "active").length} storefront-ready · {selectedProducts.filter(p => p.status !== "active").length} not published</span>
        <label><input type="checkbox" checked={selectedOnly} onChange={e=>setSelectedOnly(e.target.checked)}/> Published only</label>
      </div>
      <div className="cs-selected-list">
        {selectedProducts.filter(p => !selectedOnly || p.status === "active").map((p, index) => {
          const src = safeMediaUrl(p.primary_image || p.image_url);
          return <article key={p.id} className="cs-selected-item" draggable
            onDragStart={() => setDragging(p.id)} onDragEnd={() => setDragging(null)}
            onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); dropAt(p.id); }}>
            <span className="cs-drag-handle" aria-hidden="true">⠿</span>
            <div className="cs-selected-img">{src ? <img src={src} alt="" loading="lazy"/> : <StudioIcon name="image" size={22}/>}</div>
            <div className="cs-selected-description"><strong>{p.title}</strong><small>{p.planned_variant_count || p.variant_count || 0} planned variants · {p.status==="active"?`${p.total_inventory ?? 0} stock units`:"Artwork/preflight pending"}</small></div>
            <span className={`cs-status-chip ${p.status === "active" ? "active" : ""}`}>{p.status === "active" ? "Published" : p.status}</span>
            <div className="cs-item-actions">
              <button type="button" className="cs-icon-button" aria-label={`Move ${p.title} up`} disabled={index === 0} onClick={()=>reorder(p.id,-1)}>↑</button>
              <button type="button" className="cs-icon-button" aria-label={`Move ${p.title} down`} disabled={index === selectedProducts.length-1} onClick={()=>reorder(p.id,1)}>↓</button>
              <a className="cs-icon-button" aria-label={`Design ${p.title}`}
                 href={p.studio_draft_id && p.studio_catalog_product_id
                   ? `/admin/products/create/${encodeURIComponent(p.studio_catalog_product_id)}?resume=${encodeURIComponent(p.studio_draft_id)}${collectionId?`&collection_id=${collectionId}`:""}`
                   : `/admin/product-edit?id=${p.id}`}>
                  <StudioIcon name="pen" size={15}/>
                </a>
              <button type="button" className="cs-icon-button" aria-label={`Remove ${p.title}`} onClick={()=>onSelect(selected.filter(id=>id!==p.id))}><StudioIcon name="close" size={15}/></button>
            </div>
          </article>;
        })}
        {missingIds.length > 0 && <div className="cs-alert error">{missingIds.length} assigned products are no longer in the catalog. Remove them before publishing.</div>}
        {!selected.length && <div className="cs-empty-mini"><StudioIcon name="box" size={29}/><h3>No products selected yet</h3><p>Add from your existing catalog or plan a new lineup below.</p><button className="cs-button" type="button" onClick={()=>setPicker(true)}>Browse products</button></div>}
      </div>
    </section>
    <section className="cs-panel">
      <header className="cs-section-head">
        <div><span className="cs-overline">02 / PLAN</span><h2>Build a coordinated lineup</h2><p>Start with reusable assortment recipes or find real supplier blanks. Planning does not publish products.</p></div>
        <button className="cs-button" type="button" onClick={()=>void onOpenStudio()}><StudioIcon name="spark" size={15}/> Open Product Studio</button>
      </header>
      <div className="cs-starter-grid">
        {STARTER_KITS.map(kit=><button type="button" key={kit.id} className="cs-starter-card" disabled={supplierBusy} onClick={()=>{ setSupplierQuery(kit.searches[0]); void search(kit.searches, kit); }}><span className="cs-starter-icon"><StudioIcon name={kit.id==="accessories"?"box":"layers"} size={19}/></span><strong>{kit.label}</strong><small>{kit.caption}</small><span className="cs-starter-arrow">Explore →</span></button>)}
      </div>
      <form className="cs-supplier-search" onSubmit={e=>{e.preventDefault(); if(supplierQuery.trim()) void search([supplierQuery.trim()]);}}>
        <div className="cs-input-search"><StudioIcon name="search" size={16}/><input value={supplierQuery} onChange={e=>setSupplierQuery(e.target.value)} placeholder="Search Completeful blanks by name" aria-label="Find supplier blanks"/></div>
        <button type="submit" className="cs-button" disabled={supplierBusy || !supplierQuery.trim()}>{supplierBusy?"Searching…":"Search catalog"}</button>
      </form>
      {supplierError && <div className="cs-alert" role="status">{supplierError}</div>}
      {packResult && <div className="cs-pack-coverage" role="status" aria-label={packResult.label + " supplier lineup"}>
        <strong>{packResult.label} — live catalog matches</strong>
        <p>Each proposed product is available in the connected supplier catalog, has sellable variants, and is added to your draft plan only. Nothing is published or ordered.</p>
        <div className="cs-pack-slots">{packResult.slots.map(slot=>{
          const product=slot.recommended;
          const item=product as SupplierBlank | null;
          const id=item ? supplierId(item) : "";
          return <div className="cs-pack-slot" key={slot.slot}>
            <small>{slot.search}</small>
            {item ? <><strong>{item.name || item.title || id}</strong><span>{item.variant_count} variants · {item.mockup_count || 0} supplier mockup templates</span>
              <button type="button" className="cs-button small" onClick={()=>void onOpenStudio(id)}>Design this product</button></>
            : <><strong>Not in the available catalog</strong><span>Search another supplier product or leave this slot unfilled.</span></>}
          </div>;
        })}</div>
      </div>}
      {!!blanks.length && <div className="cs-supplier-results">{blanks.map(item => {
        const id = supplierId(item); const image = supplierImage(item); const added = plan.includes(id);
        return <article className="cs-blank-card" key={id}>
          <div className="cs-blank-image">{image ? <img alt="" src={image} loading="lazy"/> : <span className="cs-no-media">Supplier image unavailable</span>}</div>
          <strong title={item.name || item.title}>{item.name || item.title || id}</strong>
          <small>{item.variant_count ?? 0} variants · {item.product_type || "Supplier blank"}</small>
          <button className="cs-button small" type="button" disabled={!added && plan.length>=24} onClick={()=>onPlan(added ? plan.filter(p=>p!==id) : [...plan,id])}>{added?"Remove from plan":"+ Plan blank"}</button>
        </article>;
      })}</div>}
      <div className="cs-plan-bar">
        <div><strong>Planned blanks ({plan.length}/24)</strong><small>Save the assortment and create draft product shells before editing artwork. No supplier order is placed.</small></div>
        <div className="cs-item-actions">
          <button type="button" className="cs-button primary" disabled={!plan.length||scaffolding} onClick={()=>{setScaffolding(true);void onScaffold().finally(()=>setScaffolding(false));}}>
            {scaffolding?"Scaffolding…":"Scaffold draft products"} <StudioIcon name="layers" size={15}/>
          </button>
          <button type="button" className="cs-button" disabled={!plan.length||scaffolding} onClick={()=>void onOpenStudio(plan[0])}>Design first <StudioIcon name="arrow" size={15}/></button>
        </div>
      </div>
      {!!plan.length && <div className="cs-plan-ids">{plan.map((id,index)=><span key={id+"-"+index}>
          {blanks.find(p=>supplierId(p)===id)?.name || id}
          <button aria-label={`Another design using ${id}`} title="Add independent artwork design on this same supplier blank"
            disabled={plan.length>=24} onClick={()=>onPlan([...plan.slice(0,index+1),id,...plan.slice(index+1)])} type="button">+ Design</button>
          <button aria-label={`Remove planned item ${index+1}`} onClick={()=>onPlan(plan.filter((_,i)=>i!==index))} type="button">×</button>
        </span>)}</div>}
    </section>
    {picker && <CollectionProductPicker products={products} chosen={selected} onRefresh={onRefresh} onApply={onSelect} onClose={()=>setPicker(false)} onCreateProduct={()=>{setPicker(false);void onOpenStudio();}}/>}
  </div>;
}
