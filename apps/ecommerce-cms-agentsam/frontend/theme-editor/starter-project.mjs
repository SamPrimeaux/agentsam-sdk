/**
 * Generic starter preset -> the existing editable theme-project contract.
 * No theme-specific routing, D1 schema, UI, or installer lives here.
 */
import { STARTER_PRODUCT_ILLUSTRATIONS } from './starter-products.mjs';
import { starterChrome, starterChromeStyles, starterChromeScript } from './starter-chrome.mjs';
const SAFE = /^[a-z][a-z0-9-]{0,63}$/;
const html = value => String(value ?? '').replaceAll('&','&amp;')
  .replaceAll('<','&lt;').replaceAll('>','&gt;')
  .replaceAll('"','&quot;').replaceAll("'",'&#39;');
const replace = (value, site) => String(value ?? '')
  .replaceAll('{{site.name}}', site.name);
const field = (key, label, extra = {}) => ({ key, label, type: 'text', ...extra });

function sectionFromPreset(source, index, site, sampleProducts) {
  const key = 'section_' + (index + 1);
  const eyebrow = replace(source.eyebrow,site);
  const heading = replace(source.heading,site);
  const body = replace(source.body,site);
  const ctaLabel = replace(source.ctaLabel || 'Learn more',site);
  const ctaHref = source.ctaHref || '/';
  const samples = source.type === 'products' && sampleProducts ? STARTER_PRODUCT_ILLUSTRATIONS : [];
  const sampleBlocks = samples.map(product => ({
    key:'sample_'+product.id.replaceAll('-','_'),label:product.name,
    fields:[field('title','Product name'),field('price','Display price'),
      field('image','Illustration',{type:'media',binding:{attribute:'src'}}),
      field('alt','Image description',{binding:{field:'image',attribute:'alt'}})],
    settings:[],
    html:`<article class="iam-starter-product" data-sample-product>
      <img data-theme-project-field="image" alt="" width="320" height="400" loading="lazy">
      <h3 data-theme-project-field="title"></h3><p data-theme-project-field="price"></p>
    </article>`,
    defaults:{title:product.name,price:product.price,image:product.image_url,alt:product.alt},
  }));
  const sampleMarkup = samples.length ? `<p class="iam-starter-sample-note" data-theme-project-field="sample_label">Sample products · Replace these illustrations with your own catalog.</p>
    <div class="iam-starter-product-grid">${sampleBlocks.map(b=>`<!--theme-block:${b.key}-->`).join('')}</div>` : '';
  const markup = `<section class="iam-starter-section iam-starter--${html(source.type)}" data-theme-section="${key}">
    <div class="iam-starter-wrap">
      <p class="iam-starter-eyebrow" data-theme-project-field="eyebrow">${html(eyebrow)}</p>
      <h${index===0?1:2} data-theme-project-field="heading">${html(heading)}</h${index===0?1:2}>
      <p class="iam-starter-body" data-theme-project-field="body">${html(body)}</p>
      ${sampleMarkup}
      <a class="iam-starter-cta" data-theme-project-field="cta_label" href="${html(ctaHref)}">${html(ctaLabel)}</a>
    </div>
  </section>`;
  return {
    key, name:source.type==='hero'?'Hero':heading, type:source.type,
    zone:'BODY', sourceKind:source.type,
    html:markup, status:'draft', version:0, sort_order:index,
    content:{ eyebrow, heading, body, cta_label:ctaLabel, cta_href:ctaHref,
      ...(samples.length?{sample_label:'Sample products · Replace these illustrations with your own catalog.'}:{}),
      ...Object.fromEntries(sampleBlocks.map(b=>[b.key,b.defaults])),
      __editor:{ templateKey:key, visibility:{enabled:true}, blocks:sampleBlocks.map(b=>({id:b.key,templateKey:b.key})) } },
    schema:{key,label:heading,capabilities:{reorder:true},
      fields:[field('eyebrow','Eyebrow'),field('heading','Heading'),field('body','Description'),
        ...(samples.length?[field('sample_label','Sample product notice')]:[]),
        field('cta_label','Button label'),field('cta_href','Button link',
          {type:'link',binding:{field:'cta_label',attribute:'href'}})],
      settings:[],blocks:sampleBlocks},
  };
}

function htmlTemplate(title, site, sections, tokens) {
  const accent = /^#[0-9a-f]{3,8}$/i.test(tokens['--color-accent']||'') ?
    tokens['--color-accent'] : '#1e6a6f';
  const display = tokens['--font-display'] || 'Georgia,serif';
  const body = tokens['--font-body'] || 'system-ui,sans-serif';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${html(title)} · ${html(site.name)}</title>
  <style>
    :root{--iam-ink:#18191d;--iam-paper:#f9f8f5;--iam-accent:${accent};--iam-display:${display};color-scheme:light}
    *{box-sizing:border-box}body{margin:0;background:var(--iam-paper);color:var(--iam-ink);font-family:${body}}
    ${starterChromeStyles}
    .iam-starter-section{padding:clamp(65px,9vw,144px) clamp(20px,6vw,96px);border-bottom:1px solid #deded8}
    .iam-starter-section:nth-of-type(even){background:#f0f1ed}
    .iam-starter-wrap{max-width:1200px;margin:auto}
    .iam-starter-section h1,.iam-starter-section h2{font-family:${display};font-weight:500;letter-spacing:-.045em;line-height:1.07;max-width:950px;margin:16px 0 23px}
    .iam-starter-section h1{font-size:clamp(3.25rem,8vw,7.5rem)}
    .iam-starter-section h2{font-size:clamp(2.5rem,5vw,5rem)}
    .iam-starter-eyebrow{font-size:.72rem;letter-spacing:.15em;text-transform:uppercase;font-weight:650}
    .iam-starter-body{font-size:clamp(1rem,1.5vw,1.25rem);line-height:1.7;color:#54565b;max-width:650px}
    .iam-starter-cta{display:inline-flex;padding:13px 22px;background:var(--iam-accent);color:white;text-decoration:none;margin-top:20px;border-radius:5px;font-size:.9rem}
    .iam-starter-product-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:24px;margin:28px 0}
    .iam-starter-product{min-width:0}.iam-starter-product img{width:100%;height:auto;aspect-ratio:4/5;object-fit:cover;display:block;background:#eef0f3}
    .iam-starter-product h3{font:500 .9rem/1.4 ${body};margin:12px 0 3px;overflow-wrap:anywhere}
    .iam-starter-product p{font-size:.85rem;margin:0}.iam-starter-sample-note{font-size:.8rem;color:#54565b}
    @media(max-width:900px){.iam-starter-product-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:20px 16px}}
    @media(max-width:680px){.iam-starter-section{padding:68px 20px}}
  </style></head><body>
  <!--theme-section:announcement_bar--><!--theme-section:site_header-->
  <main>${sections.filter(section=>section.zone==='BODY').map(section=>`<!--theme-section:${section.key}-->`).join('')}</main>
  <!--theme-section:site_footer--><!--theme-section:promotion_popup-->
  ${starterChromeScript}</body></html>`;
}

export function materializeStarterProject(preset, site) {
  if(preset?.schema!=='agentsam.website-starter-preset.v1' ||
     !SAFE.test(preset.theme?.slug||'') || !Array.isArray(preset.pages) ||
     !preset.pages.length || typeof site?.name!=='string') {
    throw new Error('starter_preset_invalid');
  }
  const seen = new Set();
  const pages = preset.pages.map(page=>{
    if(!SAFE.test(page.slug||'') || seen.has(page.slug) ||
       !Array.isArray(page.sections) || !page.sections.length)
      throw new Error('starter_page_invalid');
    seen.add(page.slug);
    const bodySections = page.sections.map((section,i)=>sectionFromPreset(section,i,site,preset.sampleProducts!==false));
    const chrome = starterChrome(site.name.trim() || 'My Store');
    const sections = [chrome.announcementBar, chrome.header, ...bodySections, chrome.footer, chrome.popup];
    return {slug:page.slug,title:page.title||page.slug,assetBase:'',
      status:'draft',template:htmlTemplate(page.title||page.slug,site,sections,preset.tokens||{}),sections};
  });
  return {
    schema:'agentsam.theme-project.v1',
    id:'theme_'+preset.theme.slug,
    name:preset.theme.name,
    version:preset.theme.packageVersion,
    sourceThemeId:preset.theme.slug,
    sourcePackage:preset.theme.packageName,
    sourcePackageVersion:preset.theme.packageVersion,
    sourcePreviewUrl:null,
    tokens:{},
    media:preset.sampleProducts===false?[]:STARTER_PRODUCT_ILLUSTRATIONS.map(p=>({
      id:'starter_'+p.id,filename:p.id+'.svg',content_type:'image/svg+xml',url:p.image_url,alt:p.alt,source:'starter-illustration'
    })),
    pages,
  };
}
