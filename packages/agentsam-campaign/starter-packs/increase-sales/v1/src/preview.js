/* Portable interactive preview for the AgentSam Growth Increase Sales starter library.
   Preview-only: this does not authenticate, charge, send, deploy, or write merchant data. */
(function () {
  "use strict";
  var raw=document.getElementById("starter-catalog");
  if(!raw) throw new Error("Missing embedded campaign starter catalog");
  var lib=JSON.parse(raw.textContent);
  var templates=lib.templates;
  var fixedId=document.documentElement.getAttribute("data-template")||"";
  var root=document.getElementById("app");
  var selected=templates.find(function(x){return x.id===fixedId})||null;
  var activeTab="website",device="desktop",draft=null,approved=false,search="";
  var channels=["homepage_banner","email","product_pages","social","subscriber_offer","retargeting"];
  var channelLabels={homepage_banner:"Website banner",email:"Email",product_pages:"Product page",social:"Social",subscriber_offer:"Subscriber offer",retargeting:"Retargeting"};
  var palettes=["#e3eee7","#f5e8d4","#e3e9f8","#ece8e0","#e3d9d4","#d9e9e8","#f4e4dd","#ecdef1","#e6efdf","#e9e5de","#e2e5f2","#e9ece4","#d6e8e6","#e7e9ef"];
  function esc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");}
  function h(t){return esc(t);}
  function storageKey(id){return "agentsam.growth.demo.v1."+id;}
  function getSaved(id){try{return JSON.parse(localStorage.getItem(storageKey(id))||"null");}catch(e){return null;}}
  function save(){try{if(selected&&draft)localStorage.setItem(storageKey(selected.id),JSON.stringify(draft));}catch(e){}}
  function initial(t){return {name:t.name,headline:t.headline,eyebrow:t.eyebrow,body:t.body,cta:t.cta_label,product:"Selected products",offer:"Offer details in checkout",audience:t.segment_hint,selected_channels:t.channel_defaults.slice(),starts:"",ends:"",notes:"",utm_campaign:t.slug,approval:false};}
  function color(t){return palettes[(t.sort_order-1)%palettes.length];}
  function head(){return '<header class="app-header"><a href="index.html" class="brandmark" aria-label="Open starter library">IA</a><a href="index.html" class="wordmark">AgentSam <span>/ Growth</span></a><div class="header-sep"></div><span class="context">Increase sales starters</span><div class="header-spacer"></div><div class="top-actions"><span class="pill">14 templates</span><span class="pill">Preview only · No live publishing</span></div></header>';}
  function toast(msg){var old=document.querySelector(".toast");if(old)old.remove();var n=document.createElement("div");n.className="toast";n.setAttribute("role","status");n.textContent=msg;document.body.appendChild(n);setTimeout(function(){n.remove();},2900);}
  function download(name,body,mime){var blob=new Blob([body],{type:mime||"application/json;charset=utf-8"});var u=URL.createObjectURL(blob);var a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(function(){URL.revokeObjectURL(u)},4000);}
  function exportData(){if(!selected)return;var payload={schema:"agentsam.growth.campaign-preview.v1",template_id:selected.id,template_version:selected.template_version,objective_key:selected.objective_key,preview_only:true,merchant_data_bound:false,configuration:draft,asset_drafts:renderAssetData(),checks:selected.required_checks,reporting:selected.reporting,integrations:selected.integrations};download(selected.id+"-configured-demo.json",JSON.stringify(payload,null,2));toast("Preview JSON exported. No campaign was published.");}
  function renderAssetData(){if(!selected)return {};var a=typeof structuredClone==="function"?structuredClone(selected.assets):JSON.parse(JSON.stringify(selected.assets));["website","email","product_card","paid_ad"].forEach(function(k){if(a[k]){if(a[k].headline)a[k].headline=draft.headline;if(a[k].heading)a[k].heading=draft.headline;if(a[k].body)a[k].body=draft.body;if(a[k].description)a[k].description=draft.body;if(a[k].cta_label)a[k].cta_label=draft.cta;}});if(a.social)a.social.caption=draft.headline+". "+draft.body;return a;}
  function showModal(){var div=document.createElement("div");div.className="modal-backdrop";div.id="modal";div.innerHTML='<section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="kicker">Interactive preview</div><h2 id="modal-title">Simulated shopping action</h2><p>This CTA would open the merchant-selected '+h(selected.destination_label)+'. The starter contains no live catalog, payment integration, or customer data.</p><p><b>'+h(draft.cta)+'</b> · '+h(draft.offer)+'</p><div class="modal-actions"><button class="btn primary" data-action="close-modal">Close preview</button></div></section>';document.body.appendChild(div);div.addEventListener("click",function(e){if(e.target===div)div.remove();});div.querySelector("button").addEventListener("click",function(){div.remove();});div.querySelector("button").focus();}
  function renderGallery(){
    selected=null;draft=null;document.title="AgentSam Growth | Sales starter library";
    root.innerHTML=head()+'<main class="gallery-wrap"><span class="kicker">Growth / Campaign library</span><div class="hero-header"><div><h1>Increase sales, with a plan.</h1><p class="hero-intro">Fourteen complete starter concepts with editable website, email, social, product, and ad previews. Choose a template to explore its content, configuration, and launch checklist.</p><div class="stat-line"><span class="pill ok">14 packaged starters</span><span class="pill">6 creative formats per starter</span><span class="pill">No merchant data bundled</span></div></div><button class="btn" data-action="export-library">Export library JSON ↓</button></div><div class="section-bar"><h2>Starter campaigns</h2><div class="searchbox"><input type="search" id="filter" value="'+h(search)+'" placeholder="Search campaigns" aria-label="Filter starter campaigns" /></div></div><div id="gallery-list" class="catalog-grid"></div><footer class="gallery-footer">Templates are preview assets. Real publishing, discounts, checkout, audiences, and attribution require the account-scoped Growth and Commerce services.</footer></main>';
    paintGallery();
  }
  function paintGallery(){
    var list=root.querySelector("#gallery-list");if(!list)return;
    var shown=templates.filter(function(t){return (t.name+" "+t.summary+" "+t.slug).toLowerCase().includes(search.toLowerCase());});
    list.innerHTML=shown.map(function(t){return '<a class="catalog-card" href="'+h(t.slug)+'.html" aria-label="Open '+h(t.name)+' starter preview"><div class="catalog-art" style="--art:'+color(t)+'"><span class="ribbon">Starter '+String(t.sort_order).padStart(2,"0")+'</span><strong>'+h(t.headline)+'</strong></div><div class="catalog-body"><span class="kicker">'+h(t.subtitle)+'</span><h3>'+h(t.name)+'</h3><p>'+h(t.summary)+'</p><div class="catalog-bottom"><span>'+t.channel_defaults.length+' channel presets · '+t.fields.length+' fields</span><strong>Open preview ↗</strong></div></div></a>';}).join("")||'<p>No matching starter campaigns.</p>';
  }
  function infoField(key,label,multiline){
    return '<div class="field"><label for="field-'+key+'">'+h(label)+'</label>'+
      (multiline?'<textarea id="field-'+key+'" data-field="'+key+'" rows="3">'+h(draft[key])+'</textarea>':'<input id="field-'+key+'" data-field="'+key+'" value="'+h(draft[key])+'" />')+'</div>';
  }
  function renderForm(){
    return '<div class="panel-header"><div><span class="kicker">Starter '+String(selected.sort_order).padStart(2,"0")+' / 14</span><h1>'+h(selected.name)+'</h1><p>'+h(selected.summary)+'</p></div></div>'+
    '<div class="notice"><strong>Template preview</strong>Everything below is an editable demonstration. No checkout, email or marketing provider is connected.</div>'+
    '<section class="form-section"><h3>Campaign details</h3>'+infoField("name","Campaign name")+infoField("product","Product or collection label")+infoField("audience","Audience label")+'</section>'+
    '<section class="form-section"><h3>Creative copy</h3>'+infoField("eyebrow","Eyebrow")+infoField("headline","Headline")+infoField("body","Body copy",true)+infoField("cta","Call to action")+'</section>'+
    '<section class="form-section"><h3>Offer & schedule</h3>'+infoField("offer","Offer label")+'<div class="form-grid"><div class="field"><label for="start">Start</label><input id="start" type="datetime-local" data-field="starts" value="'+h(draft.starts)+'"></div><div class="field"><label for="end">End</label><input id="end" type="datetime-local" data-field="ends" value="'+h(draft.ends)+'"></div></div><div class="help">Times are preview-only. Production schedules require account timezone and verified delivery jobs.</div></section>'+
    '<section class="form-section"><h3>Selected channels</h3><div class="choice-list">'+channels.map(function(c){return '<div class="choice"><label for="channel-'+c+'">'+h(channelLabels[c])+'</label><input id="channel-'+c+'" type="checkbox" data-channel="'+c+'"'+(draft.selected_channels.includes(c)?" checked":"")+'></div>';}).join("")+'</div></section>'+
    '<section class="form-section"><h3>Template contract</h3><p class="help">'+selected.fields.length+' configured field definitions · '+selected.required_checks.length+' verification gates · tracking and reporting configured</p><div class="action-stack"><button class="btn" data-action="validate">Check readiness</button><button class="btn" data-action="download">Export configured JSON</button><button class="btn" data-action="reset">Reset template</button></div></section>';
  }
  function renderEditor(){
    if(!selected)return renderGallery();
    document.title=selected.name+" | AgentSam Growth starter";
    draft=getSaved(selected.id)||initial(selected);
    if(!Array.isArray(draft.selected_channels))draft.selected_channels=selected.channel_defaults.slice();
    approved=!!draft.approval;
    root.innerHTML=head()+'<main class="editor"><aside class="editor-rail" aria-label="Campaign templates"><a class="rail-link" href="index.html">← All templates</a><div class="rail-title">Increase sales</div>'+templates.map(function(t){return '<a class="rail-link '+(t.id===selected.id?"selected":"")+'" href="'+h(t.slug)+'.html"><span class="rail-num">'+String(t.sort_order).padStart(2,"0")+'</span><span>'+h(t.name)+'</span></a>';}).join("")+'</aside><section class="form-panel" id="form-panel">'+renderForm()+'</section><section class="preview-side"><div class="preview-toolbar"><div><div class="kicker">Live demo canvas</div><h2 style="margin:5px 0">Review campaign assets</h2></div><div class="top-actions"><button class="btn small" data-action="validate">Readiness</button><button class="btn small primary" data-action="download">Export JSON ↓</button></div></div><nav class="tabs" id="tabs" aria-label="Preview channel">'+[["website","Website"],["email","Email"],["social","Social"],["product","Product"],["ad","Ad"],["sms","SMS"],["checks","Checklist"]].map(function(t){return '<button class="tab '+(t[0]===activeTab?"current":"")+'" data-tab="'+t[0]+'">'+t[1]+'</button>';}).join("")+'</nav><div class="preview-toolbar" style="margin-top:12px"><span id="approval-status" class="pill">Demo · Not approved</span><div class="device-buttons"><button class="btn small '+(device==="desktop"?"active":"")+'" data-device="desktop">Desktop</button><button class="btn small '+(device==="mobile"?"active":"")+'" data-device="mobile">Mobile</button></div></div><div class="preview-shell" id="preview-canvas" aria-live="polite"></div><div class="action-stack" style="margin-top:18px"><button class="btn" data-action="copy">Copy creative text</button><button class="btn" data-action="export-html">Download this HTML preview</button><button class="btn" data-action="approve">Approve local preview</button></div><p class="help">Approving here only marks the local demonstration. An authorized production campaign requires a separate review receipt and publishing approval.</p></section></main>';
    renderPreview();renderApproval();
  }
  function browserStart(){return '<div class="browserline"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="url">Demo storefront · not published</span></div>';}
  function btn(){return '<button class="store-cta" data-action="cta">'+h(draft.cta)+' →</button>';}
  function artFor(){
    var shape='<div class="shape" role="img" aria-label="Abstract demo product illustration"></div>';
    var k=selected.visual_key;
    if(k==="featured")return '<div class="collection-art"><span class="tile tall">01</span><span class="tile">02</span><span class="tile">03</span></div>';
    if(k==="limited")return '<div class="sale-graphic"><span>THE</span><strong>SALE</strong><em>LIMITED-TIME DEMO</em></div>';
    if(k==="seasonal")return '<div class="seasonal-mark"><span>THE</span><strong>SEASONAL</strong><i>EDIT</i></div>';
    if(k==="bundle")return '<div class="pair-art">'+shape+shape+'</div>';
    if(k==="return")return '<div class="restock-art">'+shape+'<span class="art-stamp">BACK IN STOCK</span></div>';
    if(k==="last")return '<div class="clearance-art"><strong>FINAL<br>EDIT</strong><span>Limited stock · Demo</span></div>';
    if(k==="future")return '<div class="future-art">'+shape+'<span class="art-stamp">COMING SOON</span></div>';
    if(k==="welcome")return '<div class="voucher-art"><span>YOU ARE INVITED</span><strong>WELCOME</strong><small>First-order offer preview</small></div>';
    if(k==="reconnect")return '<div class="letter-art"><span>DEAR CUSTOMER,</span><strong>We missed you.</strong><small>A personal invitation to return</small></div>';
    if(k==="pair")return '<div class="pair-art">'+shape+'<div class="shape second"></div></div>';
    if(k==="cart")return '<div class="cart-art"><span>YOUR SELECTION</span><div class="cart-product">□ &nbsp; Selected item <b>→</b></div><div class="cart-rule"></div><strong>Pick up where you left off.</strong></div>';
    if(k==="upgrade")return '<div class="plan-art"><div><small>YOUR PLAN</small><strong>Current</strong><span>Plan details</span></div><div class="next"><small>EXPLORE</small><strong>Next</strong><span>More possibilities</span></div></div>';
    if(k==="custom")return '<div class="custom-art"><div>YOUR<br>IDEA.</div><span>YOUR CAMPAIGN.</span></div>';
    return shape;
  }
  function storefront(){
    return '<div class="store-nav"><span class="store-brand">YOUR STORE</span><span class="store-nav-links"><span>Shop</span><span>Collections</span><span>About</span></span><span>☰</span></div><div class="store-hero hero-'+h(selected.visual_key)+'" style="--hero:'+color(selected)+'"><div class="store-copy"><div class="mini-eyebrow">'+h(draft.eyebrow)+'</div><h2>'+h(draft.headline)+'</h2><p>'+h(draft.body)+'</p>'+btn()+'</div><div class="product-art visual-'+h(selected.visual_key)+'">'+artFor()+'</div></div><div class="store-footer"><span>'+h(draft.offer)+'</span><span>Preview placement</span></div>';
  }
  function email(){return '<div class="email-wrap"><div class="email-card"><div class="email-head">YOUR STORE</div><div class="email-subject">Subject: '+h(draft.headline)+'</div><div class="kicker">'+h(draft.eyebrow)+'</div><h2>'+h(draft.headline)+'</h2><p>'+h(draft.body)+'</p><p>'+h(draft.offer)+'</p>'+btn()+'<p style="font-size:10px">Demo email · Recipient consent and unsubscribe controls required for real sends.</p></div></div>';}
  function social(){return '<div class="social-wrap"><div class="social-card"><div class="social-head">◉ YOUR STORE <span style="float:right">⋯</span></div><div class="social-image" style="--hero:'+color(selected)+'"><div class="shape" role="img" aria-label="Abstract social graphic"></div></div><div class="social-body"><b>'+h(draft.headline)+'</b><p>'+h(draft.body)+'</p>'+btn()+'</div></div></div>';}
  function product(){return '<div class="product-view"><div class="visual" style="--hero:'+color(selected)+'"></div><div><div class="kicker">'+h(draft.eyebrow)+'</div><h2>'+h(draft.product)+'</h2><p>'+h(draft.body)+'</p><p><b>'+h(draft.offer)+'</b></p><p>Price and stock require the actual site catalog.</p>'+btn()+'</div></div>';}
  function ad(){return '<div class="social-wrap"><div class="social-card"><div class="social-head">Sponsored preview · provider not connected</div><div class="social-image" style="--hero:'+color(selected)+'"><div class="shape"></div></div><div class="social-body"><b>'+h(draft.headline)+'</b><p>'+h(draft.body)+'</p>'+btn()+'</div></div></div>';}
  function sms(){return '<div style="padding:28px;min-height:330px;background:#f6f8f9"><div style="margin:auto;max-width:290px;background:#e4efe6;padding:17px;border-radius:17px;font-size:13px;line-height:1.7">'+h(draft.headline)+'. '+h(draft.body)+'<br><br>'+h(draft.cta)+' →<br><span style="font-size:10px">Preview only · explicit SMS consent required</span></div></div>';}
  function checks(){
    var checks=[
      ["Template schema is complete",true],
      ["Campaign copy is present",!!(draft.name.trim()&&draft.headline.trim()&&draft.cta.trim())],
      ["At least one channel selected",draft.selected_channels.length>0],
      ["Start occurs before end",!draft.starts||!draft.ends||new Date(draft.ends)>new Date(draft.starts)],
      ["Merchant account and site resolved",false],
      ["Product, audience, and offer IDs validated",false],
      ["Channel provider configured and authorized",false],
      ["Publishing permission and receipt recorded",false],
    ];
    return '<div style="padding:23px;min-height:350px"><h2>Readiness checklist</h2><p style="font-size:12px;color:#67756e">The package validates its own preview configuration. Production-only checks intentionally remain blocked until the host supplies authoritative resources.</p><div class="checklist">'+checks.map(function(c){return '<div class="check-row"><span class="checkmark '+(c[1]?"":"blocked")+'">'+(c[1]?"✓":"!")+'</span><span>'+h(c[0])+'</span></div>';}).join("")+'</div></div>';
  }
  function renderPreview(){
    var el=root.querySelector("#preview-canvas");if(!el||!draft||!selected)return;
    var content={website:storefront,email:email,social:social,product:product,ad:ad,sms:sms,checks:checks}[activeTab]();
    el.innerHTML='<div class="preview-window '+(device==="mobile"?"mobile":"")+'">'+browserStart()+content+'</div>';
    root.querySelectorAll("[data-tab]").forEach(function(b){b.classList.toggle("current",b.dataset.tab===activeTab);});
    root.querySelectorAll("[data-device]").forEach(function(b){b.classList.toggle("active",b.dataset.device===device);});
  }
  function renderApproval(){var n=root.querySelector("#approval-status");if(n){n.className="pill "+(approved?"ok":"");n.textContent=approved?"Locally approved demo":"Demo · Not approved";}}
  function edit(key,value){if(!draft)return;draft[key]=value;approved=false;draft.approval=false;save();renderPreview();renderApproval();}
  function copy(){var copy=[selected.name,draft.headline,draft.body,draft.cta,draft.offer].join("\n\n");if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(copy).then(function(){toast("Creative copied");},function(){toast("Clipboard unavailable; use Export JSON");});}else toast("Clipboard unavailable; use Export JSON");}
  function exportHtml(){var p=root.querySelector(".preview-window");if(!p)return;var style=document.getElementById("starter-css").textContent;var html='<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+h(selected.name)+' draft preview</title><style>'+style+'</style><body style="padding:30px"><div style="max-width:950px;margin:auto"><p>AgentSam Growth / Demo-only exported creative · no live checkout</p>'+p.outerHTML+'</div></body></html>';download(selected.id+"-"+activeTab+"-preview.html",html,"text/html;charset=utf-8");toast("Standalone HTML preview saved");}
  root.addEventListener("input",function(e){if(e.target.id==="filter"){search=e.target.value;paintGallery();return;}if(e.target.dataset.field)edit(e.target.dataset.field,e.target.value);});
  root.addEventListener("change",function(e){if(e.target.dataset.channel){var c=e.target.dataset.channel;var set=new Set(draft.selected_channels);if(e.target.checked)set.add(c);else set.delete(c);edit("selected_channels",Array.from(set));}});
  root.addEventListener("click",function(e){
    var b=e.target.closest("[data-action],[data-tab],[data-device]");if(!b)return;
    if(b.dataset.tab){activeTab=b.dataset.tab;renderPreview();return;}
    if(b.dataset.device){device=b.dataset.device;renderPreview();return;}
    var a=b.dataset.action;
    if(a==="cta")showModal();
    if(a==="close-modal")document.getElementById("modal")?.remove();
    if(a==="download")exportData();
    if(a==="copy")copy();
    if(a==="export-html")exportHtml();
    if(a==="export-library"){download("agentsam-increase-sales-starters-v1.json",JSON.stringify(lib,null,2));toast("Complete starter catalog exported.");}
    if(a==="validate"){activeTab="checks";renderPreview();if(typeof root.querySelector("#preview-canvas")?.scrollIntoView==="function")root.querySelector("#preview-canvas").scrollIntoView({behavior:"smooth",block:"nearest"});}
    if(a==="reset"&&confirm("Reset this local preview to the packaged template?")){draft=initial(selected);approved=false;save();renderEditor();toast("Template restored to default");}
    if(a==="approve"){approved=true;draft.approval=true;save();renderApproval();toast("Local preview approved; production publication remains gated.");}
  });
  if(selected)renderEditor();else renderGallery();
})();
