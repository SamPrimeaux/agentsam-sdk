import { useMemo, useState } from "react";
import StudioIcon from "../products/StudioIcon";
import type { CollectionForm, MerchHero, Product } from "./model";
import { PRESETS } from "./model";
import { renderMerchHero } from "../../../../../../packages/agentsam-merch/src/merch-hero.js";
import "../../../../../../packages/agentsam-merch/src/merch-hero.css";
import { renderMerchCollectionShowcase } from "../../../../../../packages/agentsam-merch/src/collection-showcase.js";
import "../../../../../../packages/agentsam-merch/src/collection-showcase.css";

const CTAS = [
  { value: "#collection-products", label: "Products in this collection" },
  { value: "/shop", label: "All products" },
  { value: "/shop/collections", label: "All collections" },
  { value: "/community", label: "Community" },
];
export default function CollectionPresentation({ form, setForm, openMedia, products, selected }: {
  form: CollectionForm; setForm: (next: CollectionForm) => void; openMedia: (field: "cover" | "artwork" | "background") => void;
  products: Product[]; selected: number[];
}) {
  const [viewport, setViewport] = useState<"desktop"|"mobile">("desktop");
  const hero = form.hero;
  const update = (patch: Partial<MerchHero>) => setForm({ ...form, hero: { ...hero, ...patch } });
  const html = useMemo(() => renderMerchHero({
    ...hero, headline: hero.headline || form.title || "Your collection",
    eyebrow: hero.eyebrow || form.eyebrow, subheadline: hero.subheadline || form.description,
    accentColor: form.accent_color,
    primaryCta: { ...hero.primaryCta, href: "#collection-products" },
    secondaryCta: { ...hero.secondaryCta, href: hero.secondaryCta.href },
  }), [hero,form.accent_color,form.title,form.eyebrow,form.description]);
  const showcaseHtml = useMemo(() => {
    const chosen = new Map(products.map(p => [p.id,p]));
    const published = selected.map(id => chosen.get(id)).filter((p):p is Product=>Boolean(p&&p.status==="active"));
    return renderMerchCollectionShowcase({
      title: form.title || "Your collection", description: form.description, eyebrow: form.eyebrow,
      hero: {...hero,accentColor:form.accent_color}, products: published,
      links: {productBase:"/products",shop:"/shop"},
    });
  }, [form.title,form.description,form.eyebrow,form.accent_color,hero,products,selected]);
  const activePreset = PRESETS.find(p => p.backgroundColor === hero.backgroundColor && p.layout === hero.layout);
  return <div className="cs-tab-stack">
    <section className="cs-panel">
      <header className="cs-section-head"><div><span className="cs-overline">VISUAL MERCHANDISING</span><h2>Collection presentation</h2><p>Style the real storefront hero using shared theme components. No detached presentation screenshots.</p></div></header>
      <div className="cs-preset-grid">
        {PRESETS.map(p => <button key={p.id} type="button" className={`cs-preset ${activePreset?.id===p.id?"active":""}`} onClick={() => {
          setForm({ ...form, accent_color: p.accent, hero: { ...hero, backgroundColor:p.backgroundColor, gradientTo:p.gradientTo, textColor:p.textColor, layout:p.layout, accentColor:p.accent, backgroundMode:p.mode } });
        }} aria-pressed={activePreset?.id===p.id}>
          <div className="cs-preset-thumbnail" style={{ background: `linear-gradient(130deg,${p.backgroundColor},${p.gradientTo})`, color:p.textColor }}>
            <span>F&FT</span><span className="cs-preset-blocks"><i/><i/><i/></span><b style={{background:p.accent}} />
          </div>
          <strong>{p.name}</strong><small>{p.caption}</small>
        </button>)}
      </div>
      <div className="cs-preview-bar">
        <div><strong>Live storefront preview</strong><span>Hero and product gallery use the published storefront renderers. Unpublished products stay hidden.</span></div>
        <div className="cs-segmented" role="group" aria-label="Preview width">
          <button className={viewport==="desktop"?"active":""} onClick={()=>setViewport("desktop")} type="button">Desktop</button>
          <button className={viewport==="mobile"?"active":""} onClick={()=>setViewport("mobile")} type="button">Mobile</button>
        </div>
      </div>
      <div className={`cs-preview-outer ${viewport}`}><div className="cs-preview-content" onClick={e=>{ if((e.target as Element).closest("a")) e.preventDefault(); }} dangerouslySetInnerHTML={{__html:html+showcaseHtml}} /></div>
    </section>
    <div className="cs-presentation-inspector">
      <section className="cs-panel">
        <header className="cs-section-head"><div><span className="cs-overline">01 / CONTENT</span><h2>Message & action</h2></div></header>
        <div className="cs-form-stack">
          <label>Eyebrow<input maxLength={100} value={hero.eyebrow} onChange={e=>update({eyebrow:e.target.value})} placeholder="Built for good hours"/></label>
          <label>Headline<input maxLength={160} value={hero.headline} onChange={e=>update({headline:e.target.value})} placeholder={form.title || "Collection name"}/></label>
          <label>Supporting line<textarea rows={3} maxLength={500} value={hero.subheadline} onChange={e=>update({subheadline:e.target.value})} placeholder="A short introduction to the collection"/></label>
          <div className="cs-field-grid">
            <label>Primary action<input value={hero.primaryCta.label} maxLength={90} onChange={e=>update({primaryCta:{...hero.primaryCta,label:e.target.value}})} placeholder="Shop collection"/></label>
            <label>Destination<select value={hero.primaryCta.href || "#collection-products"} onChange={e=>update({primaryCta:{...hero.primaryCta,href:e.target.value}})}>{CTAS.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}</select></label>
          </div>
          <div className="cs-field-grid">
            <label>Secondary action<input value={hero.secondaryCta.label} maxLength={90} onChange={e=>update({secondaryCta:{...hero.secondaryCta,label:e.target.value}})} placeholder="Optional"/></label>
            <label>Destination<select value={hero.secondaryCta.href} onChange={e=>update({secondaryCta:{...hero.secondaryCta,href:e.target.value}})}><option value="">No destination</option>{CTAS.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}</select></label>
          </div>
        </div>
      </section>
      <section className="cs-panel">
        <header className="cs-section-head"><div><span className="cs-overline">02 / ART DIRECTION</span><h2>Images & layout</h2></div></header>
        <div className="cs-form-stack">
          <div className="cs-field-grid">
            <button className="cs-media-action" type="button" onClick={()=>openMedia("artwork")}><StudioIcon name="image"/><span>Hero artwork<small>{hero.artworkUrl?"Selected":"Select asset"}</small></span><StudioIcon name="arrow" size={15}/></button>
            <button className="cs-media-action" type="button" onClick={()=>openMedia("background")}><StudioIcon name="image"/><span>Background image<small>{hero.backgroundImageUrl?"Selected":"Select asset"}</small></span><StudioIcon name="arrow" size={15}/></button>
          </div>
          <div className="cs-field-grid">
            <label>Composition<select value={hero.layout} onChange={e=>update({layout:e.target.value as MerchHero["layout"]})}><option value="split">Text left / Artwork right</option><option value="right">Artwork left / Text right</option><option value="center">Centered stack</option></select></label>
            <label>Hero height<select value={hero.height} onChange={e=>update({height:e.target.value as MerchHero["height"]})}><option value="compact">Compact</option><option value="standard">Standard</option><option value="immersive">Immersive</option></select></label>
          </div>
          <div className="cs-field-grid">
            <label>Background treatment<select value={hero.backgroundMode} onChange={e=>update({backgroundMode:e.target.value as MerchHero["backgroundMode"]})}><option value="gradient">Gradient</option><option value="solid">Solid</option><option value="image" disabled={!hero.backgroundImageUrl}>Selected image</option></select></label>
            <label>Focal point<select value={hero.focus} onChange={e=>update({focus:e.target.value as MerchHero["focus"]})}><option value="center">Center</option><option value="left">Left</option><option value="right">Right</option><option value="top">Top</option><option value="bottom">Bottom</option></select></label>
          </div>
          <label>Artwork scale · {hero.artworkScale}%<input type="range" min={30} max={120} step={5} value={hero.artworkScale} onChange={e=>update({artworkScale:Number(e.target.value)})}/></label>
          <label>Image overlay · {hero.overlay}%<input type="range" min={0} max={90} step={5} value={hero.overlay} onChange={e=>update({overlay:Number(e.target.value)})}/></label>
          <div className="cs-color-grid">
            <label>Base<input type="color" value={hero.backgroundColor} onChange={e=>update({backgroundColor:e.target.value})}/></label>
            <label>Gradient<input type="color" value={hero.gradientTo} onChange={e=>update({gradientTo:e.target.value})}/></label>
            <label>Text<input type="color" value={hero.textColor} onChange={e=>update({textColor:e.target.value})}/></label>
            <label>Accent<input type="color" value={form.accent_color} onChange={e=>setForm({...form,accent_color:e.target.value,hero:{...hero,accentColor:e.target.value}})}/></label>
          </div>
        </div>
      </section>
    </div>
  </div>;
}
