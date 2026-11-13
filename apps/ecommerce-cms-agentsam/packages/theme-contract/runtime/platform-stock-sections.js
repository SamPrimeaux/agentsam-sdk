/**
 * Platform-provided stock UI patterns: real editable CMS sections.
 *
 * One browser/Worker-native renderer and source-template adapter. IDs correspond
 * to the 13 immutable owner-supplied Design Canvas stock exports, but these
 * sections are safe declarative WEBSITE components, not executable copies of
 * the platform's internal checkout, agent or settings interfaces.
 *
 * All actions are real browser links or native details/summary controls.
 * Payments, publishing, account mutations and agent execution are never
 * simulated by these storefront components.
 */
(function (scope) {
  const f = (key, label, type = "text") => ({ key, label, type });
  const common = [
    f("eyebrow", "Eyebrow"), f("title", "Heading"),
    f("body", "Description", "textarea"),
  ];
  const action = [f("linkText", "Action label"), f("href", "Action destination", "link")];
  const block = (key, label, fields, defaults, max = 8) => ({
    key, label, repeatable: true, min: 0, max,
    fields, defaultContent: defaults,
  });
  const specs = [
    ["choose-a-plan", "Plan comparison", "plans",
      [...common], block("plan", "Plan", [
        f("title", "Plan name"), f("detail", "Plan summary", "textarea"),
        f("price", "Price label"), f("linkText", "Action text"),
        f("href", "Action destination", "link"),
      ], {title:"Plan",detail:"Describe what is included.",price:"Contact us",linkText:"Explore plan",href:"/contact"},6)],
    ["start-trial-checkout", "Trial announcement", "banner",
      [...common,...action], null],
    ["setup-goals", "Service chooser", "cards",
      [...common], block("service", "Service", [
        f("title","Service name"),f("detail","Description","textarea"),
        f("href","Destination","link"),f("linkText","Action text"),
      ],{title:"Service",detail:"Describe what this service helps with.",href:"/contact",linkText:"Learn more"})],
    ["first-run-home", "Welcome hero", "hero",
      [...common,...action,f("imageUrl","Hero image","media")],null],
    ["design-canvas-dark", "Creative work gallery", "media",
      [...common],block("work","Project",[
        f("title","Project name"),f("detail","Description","textarea"),
        f("imageUrl","Cover image","media"),f("href","Project link","link"),
      ],{title:"Project",detail:"Introduce this piece of work.",imageUrl:"",href:"/work"})],
    ["design-theme-settings", "Palette showcase", "palette",
      [...common],block("swatch","Color",[
        f("title","Color name"),f("color","Color","color"),
        f("detail","Usage note","textarea"),
      ],{title:"Accent",color:"#238552",detail:"Primary action color"})],
    ["design-publish-popover", "Release announcement", "banner",
      [...common,...action],null],
    ["design-jump-to", "Quick links", "nav",
      [f("title","Navigation label")],block("link","Link",[
        f("title","Label"),f("href","Destination","link"),
      ],{title:"Learn more",href:"/about"},12)],
    ["design-screen-sizes", "Device showcase", "media",
      [...common],block("screen","Screen",[
        f("title","Device or screen"),f("detail","Description","textarea"),
        f("imageUrl","Screenshot","media"),f("href","Preview link","link"),
      ],{title:"Desktop",detail:"Responsive experience",imageUrl:"",href:"/work"})],
    ["mini-expanded", "Expandable details", "details",
      [...common],block("detail","Detail",[
        f("title","Question"),f("detail","Answer","textarea"),
      ],{title:"How does it work?",detail:"Add an explanation."},16)],
    ["mini-compact", "Compact feature", "feature",
      [...common,...action],null],
    ["mini-confirmation", "Confirmation notice", "banner",
      [...common,...action],null],
    ["assistant-workspace", "Process overview", "steps",
      [...common],block("step","Step",[
        f("title","Step name"),f("detail","Description","textarea"),
      ],{title:"Plan",detail:"Explain this part of the process."},12)],
  ];
  const labels = Object.freeze({
    "choose-a-plan":"Compare options",
    "start-trial-checkout":"Start your next project",
    "setup-goals":"What can we help with?",
    "first-run-home":"Welcome to our studio",
    "design-canvas-dark":"Selected work",
    "design-theme-settings":"A considered palette",
    "design-publish-popover":"What's new",
    "design-jump-to":"Explore",
    "design-screen-sizes":"Designed for every screen",
    "mini-expanded":"Common questions",
    "mini-compact":"Made to fit",
    "mini-confirmation":"You're all set",
    "assistant-workspace":"How we work",
  });
  const definitions = Object.freeze(specs.map(([slug,label,family,fields,repeatable]) => Object.freeze({
    id:"platform/"+slug, slug, label, type:family, family, source:"platform",
    templateKey:"portable", preset:"platform/"+slug, fields,
    blocks:repeatable?[repeatable]:[],
    stockAssetId:"agentsam.stock."+slug,
  })));
  const lookup = new Map(definitions.map(d=>[d.id,d]));
  const esc = (input) => String(input ?? "")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
  const validUrl = (value) => typeof value === "string" && value.length <= 2048 &&
    (!value || (value[0] === "/" && value[1] !== "/") || value[0] === "#" ||
    /^https:\/\/[^\s<>"']+$/i.test(value) || /^mailto:[^\s<>"']+$/i.test(value));
  const validColor = v => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);
  const clone = obj => JSON.parse(JSON.stringify(obj));

  // Theme-project source editing uses these exact annotated nodes; it never
  // relies on separately hand-authored HTML or a screenshot-only thumbnail.
  const attrs = (key, attribute) =>
    ' data-cms="'+esc(key)+'" data-theme-project-field="'+esc(key)+'"'+
    (attribute ? ' data-cms-attr="'+attribute+'"' : '');
  const fieldText = (tag,key,value,classes="") =>
    '<'+tag+(classes?' class="'+classes+'"':'')+attrs(key)+'>'+esc(value)+'</'+tag+'>';
  const link = (href,text,key="href",labelKey="linkText") =>
    '<a class="ps-stock-action"'+attrs(key,"href")+' href="'+esc(validUrl(href)?href:"#")+'">'+
    '<span'+attrs(labelKey)+'>'+esc(text||"Learn more")+'</span><span aria-hidden="true">↗</span></a>';
  const picture = (url,key="imageUrl") =>
    '<img'+attrs(key,"src")+(validUrl(url) && url ? ' src="'+esc(url)+'"' : '')+
    ' alt="" loading="lazy">';

  const css = [
    '.ps-stock{--st-ink:var(--iam-ink,var(--color-foreground,#1f222b));--st-paper:var(--iam-paper,var(--color-background,#fff));--st-accent:var(--iam-accent,var(--color-accent,#238552));--st-line:var(--iam-border,var(--color-border,#dedede));font-family:inherit;color:var(--st-ink);background:var(--st-paper);padding:clamp(28px,5vw,80px) 20px}',
    '.ps-stock *{box-sizing:border-box}.ps-stock-inner{max-width:1120px;margin:0 auto}',
    '.ps-stock-eyebrow{font-size:12px;letter-spacing:.12em;text-transform:uppercase;opacity:.75;margin:0 0 14px}',
    '.ps-stock-title{font:inherit;font-size:clamp(28px,5vw,58px);font-weight:700;line-height:1.08;letter-spacing:-.03em;margin:0 0 18px;overflow-wrap:break-word}',
    '.ps-stock-body{font-size:clamp(15px,1.5vw,18px);line-height:1.65;max-width:64ch;opacity:.78;margin:0 0 28px}',
    '.ps-stock-action{display:inline-flex;align-items:center;justify-content:center;gap:12px;min-height:44px;padding:12px 18px;border-radius:8px;background:var(--st-accent);color:#fff;text-decoration:none;font-weight:650}',
    '.ps-stock-action:focus-visible,.ps-stock a:focus-visible,.ps-stock summary:focus-visible{outline:3px solid var(--st-accent);outline-offset:4px}',
    '.ps-stock-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:16px}',
    '.ps-stock-card{min-width:0;border:1px solid var(--st-line);border-radius:14px;padding:22px;background:color-mix(in srgb,var(--st-paper) 94%,var(--st-ink))}',
    '.ps-stock-card h3{font:inherit;font-size:22px;font-weight:700;margin:0 0 10px}',
    '.ps-stock-card p{font:inherit;line-height:1.55;opacity:.75;margin:0 0 18px}',
    '.ps-stock-card img,.ps-stock-media img{max-width:100%;width:100%;aspect-ratio:16/10;object-fit:cover;border-radius:8px;margin-bottom:16px}.ps-stock img:not([src]){display:none}',
    '.ps-stock-card a:not(.ps-stock-action){color:var(--st-accent);text-underline-offset:4px;font-weight:600}',
    '.ps-stock-swatch{display:block;height:76px;border-radius:8px;margin-bottom:12px;border:1px solid var(--st-line)}',
    '.ps-stock-faq{display:grid;gap:8px}.ps-stock-faq details{border:1px solid var(--st-line);border-radius:10px;padding:18px 20px}',
    '.ps-stock-faq summary{cursor:pointer;font-weight:650;min-height:26px}.ps-stock-faq details p{line-height:1.65}',
    '.ps-stock--hero .ps-stock-inner{min-height:240px}.ps-stock--banner .ps-stock-inner{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:24px}',
    '.ps-stock--banner .ps-stock-body{margin-bottom:0}.ps-stock--nav nav{display:flex;flex-wrap:wrap;gap:12px}',
    '.ps-stock--nav nav a{padding:10px 14px;border:1px solid var(--st-line);border-radius:7px;color:inherit;text-decoration:none}',
    '@media(max-width:600px){.ps-stock{padding:38px 16px}.ps-stock-card{padding:17px}.ps-stock--banner .ps-stock-inner{display:block}.ps-stock--banner .ps-stock-action{margin-top:18px}}',
    '@media(prefers-reduced-motion:no-preference){.ps-stock-action,.ps-stock-card{transition:filter .2s ease,transform .2s ease}.ps-stock-action:hover{filter:brightness(.92)}.ps-stock-card:hover{transform:translateY(-2px)}}',
  ].join("\n");
  const style = '<style data-platform-stock-style>'+css+'</style>';

  const blockHtml = (def,blockId,data) => {
    const kind=def.blocks[0]?.key;
    if (!kind) return "";
    const d=data||{};
    const idAttr=blockId?' data-cms-block="'+esc(blockId)+'" data-theme-block-id="'+esc(blockId)+'"':'';
    if (kind==="detail")
      return '<details'+idAttr+'><summary'+attrs("title")+'>'+esc(d.title||"Question")+'</summary>'+
        fieldText("p","detail",d.detail||"")+'</details>';
    if (kind==="link")
      return '<a'+idAttr+attrs("href","href")+' href="'+esc(validUrl(d.href)?d.href:"#")+'>'+
        '<span'+attrs("title")+'>'+esc(d.title||"Link")+'</span></a>';
    if (kind==="swatch")
      return '<article class="ps-stock-card"'+idAttr+'><span class="ps-stock-swatch"'+attrs("color")+
        ' style="background-color:'+esc(validColor(d.color)?d.color:"#238552")+'"></span>'+
        fieldText("h3","title",d.title||"Color")+fieldText("p","detail",d.detail||"")+'</article>';
    if (kind==="step")
      return '<article class="ps-stock-card"'+idAttr+'>'+fieldText("h3","title",d.title||"Step")+
        fieldText("p","detail",d.detail||"")+'</article>';
    let html='<article class="ps-stock-card"'+idAttr+'>';
    if ("imageUrl" in d) html+=picture(d.imageUrl);
    html+=fieldText("h3","title",d.title||"Item");
    if (kind==="plan") html+=fieldText("strong","price",d.price||"Contact us");
    html+=fieldText("p","detail",d.detail||"");
    if ("href" in d) html+='<a'+attrs("href","href")+' href="'+esc(validUrl(d.href)?d.href:"#")+'>'+
      '<span'+attrs("linkText")+'>'+esc(d.linkText||"Learn more")+'</span></a>';
    return html+'</article>';
  };
  const wrap = (def, content, blocks, marker=false) => {
    const c=content||{};
    const heading = '<div class="ps-stock-copy">'+
      (c.eyebrow?fieldText("p","eyebrow",c.eyebrow,"ps-stock-eyebrow"):'')+
      fieldText("h2","title",c.title||def.label,"ps-stock-title")+
      (c.body?fieldText("p","body",c.body,"ps-stock-body"):'')+'</div>';
    const kind=def.blocks[0]?.key;
    const items=kind ? (marker?'<!--theme-block:items-->':blocks.map(b=>blockHtml(def,b.id,c[b.id]||{})).join("")) : "";
    const container= kind==="detail" ? '<div class="ps-stock-faq">'+items+'</div>'
      : kind==="link" ? '<nav aria-label="'+esc(c.title||"Quick links")+'">'+items+'</nav>'
      : kind ? '<div class="ps-stock-grid">'+items+'</div>' : "";
    const primary=(!kind && c.linkText && validUrl(c.href))?link(c.href,c.linkText):"";
    const media=(!kind && def.fields.some(f=>f.key==="imageUrl"))?
      '<div class="ps-stock-media">'+picture(c.imageUrl)+'</div>':"";
    const id="ps-stock--"+def.family;
    return '<section class="ps-section ps-stock '+id+'" data-portable-preset="'+esc(def.id)+'" data-portable-family="platform"'+
      (c.__sectionKey?' data-cms-section="'+esc(c.__sectionKey)+'" data-theme-section="'+esc(c.__sectionKey)+'"':'')+'>'+
      style+'<div class="ps-stock-inner">'+heading+media+container+primary+'</div></section>';
  };
  function defaults(id){
    const d=lookup.get(id); if (!d) return null;
    const content={
      eyebrow:"Platform stock",title:labels[d.slug]||d.label,
      body:"Replace this copy with your own content.",
      ...(d.blocks.length?{}:{linkText:"Explore",href:"/about"}),
      ...(d.slug==="first-run-home"?{imageUrl:""}:{}),
    };
    // Defaults are generated from the actual schema, never a family's
    // accidental superset (quick links deliberately has no body field).
    const allowed=new Set(d.fields.map(f=>f.key));
    for(const key of Object.keys(content))if(!allowed.has(key))delete content[key];
    if (d.blocks.length){
      const b=d.blocks[0];
      // Two useful blocks are installed as editable data, not a rendered fixture.
      for(let i=1;i<=2;i++){
        const key=b.key+i;
        content[key]=clone(b.defaultContent);
      }
    }
    const blocks=d.blocks.length?[{id:d.blocks[0].key+"1",templateKey:d.blocks[0].key,enabled:true},
      {id:d.blocks[0].key+"2",templateKey:d.blocks[0].key,enabled:true}]:[];
    content.__editor={templateKey:"portable",themePreset:id,visibility:{enabled:true},blocks};
    return content;
  }
  function validate(id,c){
    const d=lookup.get(id);
    if(!d) return {ok:false,error:"Unknown stock section"};
    if(!c||typeof c!=="object"||Array.isArray(c))return{ok:false,error:"Section content must be an object"};
    const keys=new Set([...d.fields.map(f=>f.key),"__editor","__layout","__styles"]);
    const blocks=c.__editor?.blocks||[];
    if(!Array.isArray(blocks)||blocks.length>(d.blocks[0]?.max||0))return{ok:false,error:"Invalid stock blocks"};
    const ids=new Set();
    for(const b of blocks){
      if(!d.blocks.length||!b||typeof b.id!=="string"||!/^[a-zA-Z0-9_-]{1,60}$/.test(b.id)||
        ids.has(b.id)||b.templateKey!==d.blocks[0].key)
        return{ok:false,error:"Invalid stock block identity"};
      ids.add(b.id);keys.add(b.id);
      const values=c[b.id];
      if(!values||typeof values!=="object"||Array.isArray(values))
        return{ok:false,error:"Missing block content"};
      for(const [k,v] of Object.entries(values)){
        const field=d.blocks[0].fields.find(f=>f.key===k);
        if(!field||typeof v!=="string"||v.length>12000||
          (field.type==="link"&&!validUrl(v))||(field.type==="media"&&!validUrl(v))||
          (field.type==="color"&&!validColor(v)))
          return{ok:false,error:"Invalid stock block field: "+k};
      }
    }
    for(const [k,v] of Object.entries(c)){
      if(!keys.has(k))return{ok:false,error:"Unsupported stock field: "+k};
      if(k.startsWith("__"))continue;
      const field=d.fields.find(f=>f.key===k);
      if(field && (typeof v!=="string"||v.length>12000||
        (field.type==="link"&&!validUrl(v))||(field.type==="media"&&!validUrl(v))||
        (field.type==="color"&&!validColor(v))))
        return{ok:false,error:"Invalid stock field: "+k};
    }
    if(c.__editor?.themePreset!==id||c.__editor?.templateKey!=="portable")
      return{ok:false,error:"Stock section identity mismatch"};
    return {ok:true};
  }
  function schema(id) {
    const d=lookup.get(id);if(!d)return null;
    return {label:d.label,fields:d.fields,blocks:d.blocks,
      settings:[],capabilities:{edit:true,reorder:true,duplicate:true,remove:true,blocks:!!d.blocks.length},
      guardrails:{maxBlocks:d.blocks[0]?.max||0}};
  }
  function render(entry) {
    const id=entry?.content?.__editor?.themePreset;
    const d=lookup.get(id);if(!d)return null;
    if(entry.content?.__editor?.visibility?.enabled===false)return "";
    const blocks=(entry.content?.__editor?.blocks||[]).filter(b=>b.enabled!==false);
    return wrap(d,{...entry.content,__sectionKey:entry.key},blocks);
  }
  // This is the exact same markup/definition used by theme-project draft
  // installation. No independent mock section registry or stored duplicates.
  function sourceTemplate(id) {
    const d=lookup.get(id);if(!d)return null;
    const content=defaults(id);
    return {
      key:"stock-"+d.slug,
      name:d.label, type:d.family,sourceKind:d.family,
      html:wrap(d,content,[],true),
      version:0,zone:"BODY",status:"draft",
      content:{...content,__editor:{...content.__editor,templateKey:"stock-"+d.slug}},
      schema:{key:"stock-"+d.slug,label:d.label,fields:d.fields.map(field=>({
        ...field,binding:{...(field.type==="link"?{attribute:"href"}:field.type==="media"?{attribute:"src"}:{})}
      })),settings:[],blocks:d.blocks.map(b=>({
        key:b.key,label:b.label,repeatable:true,min:b.min,max:b.max,
        fields:b.fields.map(field=>({
          ...field,binding:field.type==="link"?{attribute:"href"}:
            field.type==="media"?{attribute:"src"}:
            field.type==="color"?{styleProperty:"background-color"}:{}
        })),
        html:blockHtml(d,null,b.defaultContent),
        defaults:b.defaultContent,
      })),capabilities:{insert:true,reorder:true,duplicate:true,remove:true}},
      stockAssetId:d.stockAssetId,
    };
  }
  scope.ThemePlatformStock = Object.freeze({
    definitions,get:(id)=>lookup.get(id)||null,
    catalog:()=>definitions.map(d=>({id:d.id,label:d.label,type:d.family,
      source:d.source,templateKey:d.templateKey,preset:d.preset,stockAssetId:d.stockAssetId})),
    defaults,schema,render,validate,sourceTemplate,
  });
})(globalThis);
