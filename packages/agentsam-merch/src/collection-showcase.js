/**
 * Product collection presentation, used by both the storefront and Collections
 * Studio preview. Never guesses a rear view or manufactures product imagery.
 * Rendering receives already-selected catalog products and brand/treatment data.
 */
import { normalizeMerchHero } from "./merch-hero.js";

const text = (v, limit=240) => String(v ?? "").slice(0,limit);
const esc = (v) => text(v,2000).replace(/[&<>"']/g, x=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[x]));
function safeImage(value) {
  const v=text(value,2048).trim();
  if (!v || v.startsWith("//") || v.includes(String.fromCharCode(92)) ||
      [...v].some(ch => ch.charCodeAt(0)<32)) return "";
  if (v.startsWith("/")) return v;
  try {const url=new URL(v);return url.protocol==="https:"?url.href:"";} catch {return "";}
}
const safeRoutePath = value => {
  const v=text(value,256);
  return /^\/(?!\/)[a-z0-9/_-]*$/i.test(v) ? v.replace(/\/$/, "") : "";
};
const money = cents => Number.isSafeInteger(Number(cents)) && Number(cents)>0
  ? new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(Number(cents)/100)
  : "Discover";
export function collectionShowcaseStyle(input={}) {
  const hero = normalizeMerchHero(input.hero||{},input);
  const bg=hero.backgroundColor.toLowerCase();
  const mode=bg==="#e9e0d0"?"lifestyle":bg==="#f4f5f2"?"minimal":"editorial";
  return {mode,hero};
}

export function renderMerchCollectionShowcase(input={}) {
  const products=Array.isArray(input.products)?input.products.slice(0,150):[];
  const {mode,hero}=collectionShowcaseStyle(input);
  const productBase=safeRoutePath(input.links?.productBase);
  const shopHref=safeRoutePath(input.links?.shop);
  const title=esc(text(input.title||hero.headline||"Collection",130));
  const subtitle=esc(text(input.description||hero.subheadline||"",300));
  const eyebrow=esc(text(input.eyebrow||"THE COLLECTION",70));
  const showFeatured=mode==="editorial" && products.length>=3;
  const tiles=products.map((product,index)=>{
    const image=safeImage(product.primary_image||product.image_url);
    const name=esc(text(product.title||"Product",180));
    const handle=encodeURIComponent(String(product.slug||""));
    const imageHtml=image
      ? `<img class="merch-showcase__photo" src="${esc(image)}" loading="lazy" alt="${name}">`
      : '<div class="merch-showcase__missing" role="img" aria-label="Product image pending">Product photo pending</div>';
    const price=esc(money(product.price_cents));
    const linked=Boolean(productBase&&handle);
    return `<${linked?"a":"div"} class="merch-showcase__product${showFeatured&&index===0?" merch-showcase__product--featured":""}"${linked?` href="${esc(productBase+"/"+handle)}" aria-label="View ${name}"`:""}>
      <div class="merch-showcase__media">${imageHtml}<span class="merch-showcase__index">${String(index+1).padStart(2,"0")}</span></div>
      <div class="merch-showcase__meta"><div><span class="merch-showcase__label">${index===0?"FEATURED PIECE":"THE LINEUP"}</span><h3>${name}</h3></div><strong>${price}</strong></div>
    </${linked?"a":"div"}>`;
  }).join("");
  const styles=`--merch-showcase-accent:${hero.accentColor};--merch-showcase-bg:${hero.backgroundColor};--merch-showcase-ink:${hero.textColor}`;
  return `<section class="merch-showcase merch-showcase--${mode}" id="collection-products" data-merch-showcase="1" style="${esc(styles)}">
    <div class="merch-showcase__inner">
      <header class="merch-showcase__heading"><div><p>${eyebrow}</p><h2>${title}</h2>${subtitle?`<span>${subtitle}</span>`:""}</div><span>${products.length} ${products.length===1?"PIECE":"PIECES"} IN THE COLLECTION</span></header>
      <div class="merch-showcase__grid">${tiles||'<div class="merch-showcase__empty">Products will appear here after they are created and published.</div>'}</div>
      <footer class="merch-showcase__foot"><span>MORE GOOD HOURS AHEAD</span>${shopHref?`<a href="${esc(shopHref)}">EXPLORE THE SHOP →</a>`:""}</footer>
    </div>
  </section>`;
}
