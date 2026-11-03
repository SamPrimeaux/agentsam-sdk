/**
 * Generic starter preset -> the existing editable theme-project contract.
 * No theme-specific routing, D1 schema, UI, or installer lives here.
 */
const SAFE = /^[a-z][a-z0-9-]{0,63}$/;
const html = value => String(value ?? '').replaceAll('&','&amp;')
  .replaceAll('<','&lt;').replaceAll('>','&gt;')
  .replaceAll('"','&quot;').replaceAll("'",'&#39;');
const replace = (value, site) => String(value ?? '')
  .replaceAll('{{site.name}}', site.name);
const field = (key, label, extra = {}) => ({ key, label, type: 'text', ...extra });

function sectionFromPreset(source, index, site) {
  const key = 'section_' + (index + 1);
  const eyebrow = replace(source.eyebrow,site);
  const heading = replace(source.heading,site);
  const body = replace(source.body,site);
  const ctaLabel = replace(source.ctaLabel || 'Learn more',site);
  const ctaHref = source.ctaHref || '/';
  const markup = `<section class="iam-starter-section iam-starter--${html(source.type)}" data-theme-section="${key}">
    <div class="iam-starter-wrap">
      <p class="iam-starter-eyebrow" data-theme-project-field="eyebrow">${html(eyebrow)}</p>
      <h${index===0?1:2} data-theme-project-field="heading">${html(heading)}</h${index===0?1:2}>
      <p class="iam-starter-body" data-theme-project-field="body">${html(body)}</p>
      <a class="iam-starter-cta" data-theme-project-field="cta_label" href="${html(ctaHref)}">${html(ctaLabel)}</a>
    </div>
  </section>`;
  return {
    key, name:source.type==='hero'?'Hero':heading, type:source.type,
    html:markup, status:'draft', version:0, sort_order:index,
    content:{ eyebrow, heading, body, cta_label:ctaLabel, cta_href:ctaHref,
      __editor:{ templateKey:key, visibility:{enabled:true}, blocks:[] } },
    schema:{key,label:heading,capabilities:{reorder:true},
      fields:[field('eyebrow','Eyebrow'),field('heading','Heading'),field('body','Description'),
        field('cta_label','Button label'),field('cta_href','Button link',
          {type:'link',binding:{field:'cta_label',attribute:'href'}})],
      settings:[],blocks:[]},
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
    :root{--iam-ink:#18191d;--iam-paper:#f9f8f5;--iam-accent:${accent};color-scheme:light}
    *{box-sizing:border-box}body{margin:0;background:var(--iam-paper);color:var(--iam-ink);font-family:${body}}
    .iam-starter-header{display:flex;align-items:center;justify-content:space-between;padding:20px clamp(20px,5vw,84px);border-bottom:1px solid #dddcd6;gap:20px}
    .iam-starter-brand{font-family:${display};font-size:1.4rem;font-weight:700;text-decoration:none;color:inherit}
    .iam-starter-nav{display:flex;flex-wrap:wrap;gap:24px}
    .iam-starter-nav a{color:inherit;text-decoration:none;font-size:.85rem}
    .iam-starter-section{padding:clamp(65px,9vw,144px) clamp(20px,6vw,96px);border-bottom:1px solid #deded8}
    .iam-starter-section:nth-of-type(even){background:#f0f1ed}
    .iam-starter-wrap{max-width:1200px;margin:auto}
    .iam-starter-section h1,.iam-starter-section h2{font-family:${display};font-weight:500;letter-spacing:-.045em;line-height:1.07;max-width:950px;margin:16px 0 23px}
    .iam-starter-section h1{font-size:clamp(3.25rem,8vw,7.5rem)}
    .iam-starter-section h2{font-size:clamp(2.5rem,5vw,5rem)}
    .iam-starter-eyebrow{font-size:.72rem;letter-spacing:.15em;text-transform:uppercase;font-weight:650}
    .iam-starter-body{font-size:clamp(1rem,1.5vw,1.25rem);line-height:1.7;color:#54565b;max-width:650px}
    .iam-starter-cta{display:inline-flex;padding:13px 22px;background:var(--iam-accent);color:white;text-decoration:none;margin-top:20px;border-radius:5px;font-size:.9rem}
    .iam-starter-footer{padding:36px clamp(20px,6vw,96px);font-size:.85rem;color:#606166}
    @media(max-width:680px){.iam-starter-header{align-items:flex-start;flex-direction:column}.iam-starter-nav{gap:17px}.iam-starter-section{padding:68px 20px}}
  </style></head><body>
  <header class="iam-starter-header"><a class="iam-starter-brand" href="/">${html(site.name)}</a>
    <nav class="iam-starter-nav" aria-label="Main"><a href="/">Home</a><a href="/shop">Shop</a><a href="/about">About</a></nav>
  </header><main>${sections.map(section=>`<!--theme-section:${section.key}-->`).join('')}
  </main><footer class="iam-starter-footer">${html(site.name)} · Your website, your story.</footer>
  </body></html>`;
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
    const sections = page.sections.map((section,i)=>sectionFromPreset(section,i,site));
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
    pages,
  };
}
