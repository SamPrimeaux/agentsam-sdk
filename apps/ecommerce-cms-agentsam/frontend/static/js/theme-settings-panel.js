/* Isolated frontend Theme Settings review: no CMS writes */
(() => {
"use strict";
const definitions = [];
const categories = [
["brand","Logo and favicon"],["palette","Color palette"],["type","Typography"],["page","Page"],
["motion","Animations"],["badges","Badges"],["buttons","Buttons"],["cart","Cart"],
["drawers","Drawers"],["icons","Icons"],["inputs","Input fields"],["overlays","Popovers and modals"],
["prices","Prices"],["cards","Product cards"],["search","Search"],["swatches","Swatches"],
["variants","Variant pickers"],["css","Custom CSS"]
];
const f=(key,label,type,initial,extra={})=>({key,label,type,initial,...extra});
const sw=(k,l,v=false)=>f(k,l,"switch",v);
const co=(k,l,v="#000000")=>f(k,l,"color",v);
const sl=(k,l,v,min=0,max=100,unit="px")=>f(k,l,"range",v,{min,max,unit});
const se=(k,l,options,initial=options[0])=>f(k,l,"select",initial,{options});
const seg=(k,l,options,initial=options[0])=>f(k,l,"segment",initial,{options});
const group=label=>({type:"group",label});
const help=label=>({type:"help",label});
const roles=["Body","Subheading","Heading","Accent"];
const cases=["Default","Uppercase"];
const fonts=["Inter","Arial","Georgia","System sans-serif"];
const sizeOpts=["12px","14px","16px","18px","20px","24px","28px","32px","40px","48px","56px","64px"];
const btn=(prefix,title,bg,fg,border,borderW,radius)=>[
 group(title),co(prefix+".bg","Background",bg),co(prefix+".text","Text",fg),
 co(prefix+".border","Borders",border),sl(prefix+".borderW","Border thickness",borderW,0,10),
 sl(prefix+".radius","Corner radius",radius,0,100),
 seg(prefix+".font","Font",["Body","Accent"]),seg(prefix+".case","Text case",cases)
];
const forms={
brand:[
 f("brand.name","Manage store name","name","Store"),
 f("brand.default","Default logo","media",""),
 f("brand.inverse","Inverse logo","media",""),
 help("Used when transparent header background is set to Inverse."),
 f("brand.favicon","Favicon","media","")
],
palette:[f("palette.colors","Palette","palette",null)],
type:[
 group("Colors"),co("type.text","Text"),help("Default for theme sections. Custom backgrounds use this color only when contrast is sufficient."),
 group("Fonts"),...roles.map(x=>se("type.font."+x,x,fonts,"Inter")),
 group("Text presets"),help("Sizes automatically scale for all screen sizes"),
 group("Paragraph"),se("type.p.size","Size",sizeOpts,"14px"),se("type.p.line","Line height",["Tight","Normal","Loose"],"Loose"),
 ...[56,48,32,24,14,12].flatMap((size,i)=>{
 const key="type.h"+(i+1);
 return [group("Heading "+(i+1)),
 (i<2?seg(key+".font","Font",["Heading","Accent"]):se(key+".font","Font",roles,i<4?"Heading":"Subheading")),
 se(key+".size","Size",sizeOpts,size+"px"),
 se(key+".line","Line height",["Tight","Normal","Loose"],i<2?"Tight":i>=4?"Loose":"Normal"),
 se(key+".spacing","Letter spacing",["Tight","Normal","Wide"]),
 seg(key+".case","Case",cases)];
 })
],
page:[co("page.bg","Background","#FFFFFF"),se("page.width","Page width",["Narrow","Standard","Wide","Full width"])],
motion:[
 sw("motion.page","Page transition"),sw("motion.product","Product card to product page transition"),
 sw("motion.cart","Add to cart",true),
 se("motion.hover","Card hover effect",["None","Subtle lift","Image zoom","Soft fade"]),
 help("Applies to product and collection cards")
],
badges:[
 se("badges.position","Position on cards",["Top left","Top right","Bottom left","Bottom right"],"Top right"),
 sl("badges.radius","Corner radius",100),
 group("Colors"),co("badges.saleBg","Sale badge background","#FFFFFF"),
 co("badges.saleText","Sale badge text"),co("badges.soldBg","Sold out badge background","#EEF1EA"),
 co("badges.soldText","Sold out badge text"),
 group("Typography"),se("badges.font","Font",roles),seg("badges.case","Case",cases)
],
buttons:[
 ...btn("buttons.primary","Primary button","#000000","#FFFFFF","#000000",0,14),
 ...btn("buttons.secondary","Secondary button","transparent","#000000","#000000",1,14),
 ...btn("buttons.pills","Pills","#F3F3F3","#000000","#DDDDDD",1,100),
 seg("buttons.pills.active","Selected appearance",["Solid","Outline"])
],
cart:[
 seg("cart.type","Type",["Page","Drawer"],"Drawer"),
 seg("cart.title","Product title case",cases),
 se("cart.priceFont","Price font",roles,"Subheading"),
 sw("cart.auto","\"Add to cart\" auto-opens drawer"),
 group("Cart features"),
 sw("cart.note","Allow note to seller"),sw("cart.discount","Allow discounts in cart",true),
 sw("cart.installments","Installments",true),sw("cart.accelerated","Accelerated checkout buttons",true),
 help("Accelerated checkout buttons are visual samples only. No checkout is executed."),
 f("cart.empty","Empty cart button link","link","All Products"),
 group("Product media"),seg("cart.mediaBorder","Border style",["None","Solid"]),
 sl("cart.mediaRadius","Corner radius",0)
],
drawers:[co("drawers.bg","Background color","#FFFFFF"),co("drawers.text","Text color"),co("drawers.border","Border color","#DDDDDD")],
icons:[se("icons.stroke","Stroke",["Thin","Default","Heavy"],"Default")],
inputs:[
 co("inputs.bg","Background","#FFFFFF"),co("inputs.text","Text","#303030"),
 co("inputs.border","Borders","#DDDDDD"),sl("inputs.thickness","Border thickness",1,0,10),
 sl("inputs.radius","Corner radius",4),
 se("inputs.preset","Text preset",["Paragraph","Heading 1","Heading 2","Heading 3","Heading 4","Heading 5","Heading 6"])
],
overlays:[
 co("overlays.bg","Background color","#FFFFFF"),co("overlays.text","Text color"),
 sl("overlays.radius","Corner radius",14),co("overlays.border","Border color","#DDDDDD"),
 sl("overlays.thickness","Border thickness",1,0,10),sw("overlays.shadow","Drop shadow",true),
 co("overlays.shadowColor","Shadow")
],
prices:[
 group("Currency code"),sw("prices.product","Product pages"),sw("prices.cards","Product cards"),
 sw("prices.items","Cart items"),sw("prices.total","Cart total",true)
],
cards:[
 sw("cards.quick","Quick add",true),sw("cards.mobileQuick","Mobile quick add"),
 co("cards.bg","Background","#FFFFFF"),co("cards.text","Text"),
 group("Media"),sw("cards.second","Show second image on hover",true),sw("cards.carousel","Show carousel",true)
],
search:[
 f("search.empty","Empty state collection","collection",""),
 help("Shown before a search is entered"),group("Search popover"),
 sl("search.productRadius","Product corner radius",0),
 sl("search.cardRadius","Card corner radius",4),seg("search.title","Product and card title case",cases)
],
swatches:[
 sw("swatches.images","Variant images"),sl("swatches.width","Width",34,18,72),
 sl("swatches.height","Height",34,18,72),sl("swatches.radius","Corner radius",32),
 seg("swatches.borders","Borders",["None","Solid"],"Solid"),
 sl("swatches.thickness","Border thickness",1,0,8),
 sl("swatches.opacity","Border opacity",10,0,100,"%")
],
variants:[
 group("Variant settings"),co("variants.bg","Background","#FFFFFF"),
 co("variants.text","Text"),co("variants.border","Borders","#DDDDDD"),
 group("Selected variants"),co("variants.selectedBg","Background"),
 co("variants.selectedText","Text","#FFFFFF"),co("variants.selectedBorder","Borders"),
 group("Buttons"),sl("variants.thickness","Border thickness",1,0,10),
 sl("variants.radius","Corner radius",14),seg("variants.width","Width",["Fit","Fill"],"Fill")
],
css:[
 help("Adds custom styles to your entire online store."),
 f("css.source","CSS","code",".card {\n  border-radius: 30px;\n}"),
 help("Custom CSS stays in isolated preview state and is not injected into the editor or storefront.")
]
};
const fieldMap=new Map(Object.values(forms).flat().filter(x=>x.key).map(x=>[x.key,x]));
const defaults={};fieldMap.forEach((x,k)=>defaults[k]=x.initial);
for(let i=0;i<4;i++)defaults["palette."+i]=["#FFFFFF","#000000","#303030","#DADADA"][i];
let state={...defaults},paletteLinks={},category="",popup=null,focusReturn=null,
 selectedVariant=1,imageIndex=0,searchQuery="",brandName="Store",media={},paletteCount=4;
let root=null,rail=null;
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const validColor=x=>x==="transparent"||/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(x));
const hex=x=>validColor(x)&&x!=="transparent"?x:"#000000";
const v=k=>state[k]??defaults[k]??"";
const localKey=()=> "ia:theme-ui-review:v1:"+(document.querySelector("#te-theme-name")?.textContent||"installed")+":"+(new URLSearchParams(location.search).get("slug")||"page");
const reviewNote=()=>root?.querySelector("[data-ts-review-note]");
function load(){try{const data=JSON.parse(sessionStorage.getItem(localKey())||"null");if(data){Object.keys(defaults).forEach(k=>{if(data.values&&k in data.values)state[k]=data.values[k];});Object.entries(data.values||{}).forEach(([k,value])=>{if(/^palette\.\d+$/.test(k)){state[k]=value;paletteCount=Math.max(paletteCount,Number(k.split(".")[1])+1);}});paletteLinks=data.links||{};brandName=data.brandName||"Store";media=data.media||{};}else{fieldMap.forEach((item,key)=>{if(item.type!=="color")return;const match=[0,1,2,3].find(i=>defaults["palette."+i]===item.initial);if(match!==undefined)paletteLinks[key]=match;});}}catch{}}
function save(){
 try{const retained=Object.fromEntries(Object.entries(media).filter(([,value])=>String(value).length<1000000));sessionStorage.setItem(localKey(),JSON.stringify({values:state,links:paletteLinks,brandName,media:retained}));}
 catch{if(reviewNote())reviewNote().textContent="Preview only · session storage unavailable";}
}
function set(k,value){
 const d=fieldMap.get(k);
 if(!d)return;
 if(d.type==="range"){
   const n=Number(value);if(!Number.isFinite(n))return;
   value=Math.max(d.min,Math.min(d.max,Math.round(n)));
 }
 if(d.type==="color"&&!validColor(value))return;
 state[k]=value;save();sync(k);updatePreview();applyWhitelistedPreview();
}
function button(label,attributes=""){return `<button type="button" ${attributes}>${esc(label)}</button>`;}
function inputFor(d){
 const k=esc(d.key),label=esc(d.label);
 if(d.type==="group")return `<h3 class="ts-group">${label}</h3>`;
 if(d.type==="help")return `<p class="ts-helper">${label}</p>`;
 if(d.type==="palette")return `<div class="ts-palette">${Array.from({length:paletteCount},(_,i)=>i).map(i=>`<button type="button" data-ts-action="paletteEdit" data-ts-index="${i}" aria-label="Edit palette color ${i+1}" title="Edit palette color ${i+1}" class="ts-palette-chip" style="background:${hex(v("palette."+i))}"></button>`).join("")}${button("+",'data-ts-action="paletteAdd" class="ts-palette-plus" aria-label="Add palette color" title="Add palette color"')}</div>`;
 if(d.type==="name")return `<div class="ts-name-row">${button("Manage store name",'class="ts-link" data-ts-action="name"')}</div>`;
 if(d.type==="media")return `<div class="ts-media-field"><label>${label}</label><div data-ts-media="${k}"></div></div>`;
 if(d.type==="code")return `<div class="ts-code-field"><label for="ts-css-code">CSS</label><div class="ts-code"><pre data-ts-syntax aria-hidden="true"></pre><textarea id="ts-css-code" data-ts-key="${k}" aria-label="Custom CSS" spellcheck="false" rows="7">${esc(v(d.key))}</textarea></div>${button("Learn more about custom CSS",'data-ts-action="cssHelp" class="ts-link"')}</div>`;
 if(d.type==="collection"||d.type==="link")return `<div class="ts-field"><label>${label}</label>${button(v(d.key)||"Select",`class="ts-select ts-resource" data-ts-action="${d.type}" data-ts-key="${k}" aria-label="${label}"`)}</div>`;
 let control="";
 if(d.type==="switch")control=`<button type="button" class="ts-switch" role="switch" aria-label="${label}" aria-checked="${!!v(d.key)}" data-ts-key="${k}" title="${label}: ${v(d.key)?"On":"Off"}"><span></span></button>`;
 if(d.type==="select")control=`<select data-ts-key="${k}" class="ts-select" aria-label="${label}">${d.options.map(x=>`<option value="${esc(x)}" ${v(d.key)===x?"selected":""}>${esc(x)}</option>`).join("")}</select>`;
 if(d.type==="segment")control=`<div class="ts-segment" role="group" aria-label="${label}">${d.options.map(x=>button(x,`data-ts-key="${k}" data-ts-value="${esc(x)}" aria-pressed="${v(d.key)===x}" class="${v(d.key)===x?"is-selected":""}"`)).join("")}</div>`;
 if(d.type==="range")control=`<div class="ts-range"><input type="range" data-ts-key="${k}" aria-label="${label}" value="${v(d.key)}" min="${d.min}" max="${d.max}"><div class="ts-numeric"><input type="number" data-ts-key="${k}" aria-label="${label} numeric value" value="${v(d.key)}" min="${d.min}" max="${d.max}"><span>${d.unit}</span></div></div>`;
 if(d.type==="color"){
 const value=v(d.key),linked=Number.isInteger(paletteLinks[d.key]);
 control=`<button type="button" class="ts-color" data-ts-key="${k}" data-ts-action="color" aria-label="${label}: ${esc(value)}" title="Choose ${label}"><span class="ts-chip ${value==="transparent"?"transparent":""}" style="${value==="transparent"?"":`background:${hex(value)}`}"></span><span>${linked?"Palette color":value==="transparent"?"Transparent":esc(value)}</span><span aria-hidden="true">${linked?"↗":""}</span></button>`;
 }
 return `<div class="ts-field"><label>${label}</label>${control}</div>`;
}
function updateMedia(key){
 const node=root?.querySelector(`[data-ts-media="${key}"]`);if(!node)return;
 node.innerHTML=media[key]?`<div class="ts-media-selected"><img src="${esc(media[key])}" alt="Selected preview-only asset"><div>${button("Replace",`data-ts-action="media" data-ts-key="${key}"`)}${button("Remove",`data-ts-action="mediaRemove" data-ts-key="${key}"`)}</div></div>`:
 `<div class="ts-media-empty">${button("Select",`data-ts-action="media" data-ts-key="${key}"`)}${button("▦",`data-ts-action="media" data-ts-key="${key}" aria-label="Browse preview media library" title="Browse preview media library"`)}${button("Explore free images",`data-ts-action="explore" data-ts-key="${key}" class="ts-link"`)}</div>`;
}
function sync(key){
 root?.querySelectorAll("[data-ts-key]").forEach(node=>{
 if(node.dataset.tsKey!==key)return;
 const d=fieldMap.get(key),value=v(key);
 if(d.type==="range"&&(node.tagName==="INPUT"))node.value=value;
 if(d.type==="switch"){node.setAttribute("aria-checked",String(!!value));node.setAttribute("title",d.label+": "+(value?"On":"Off"));}
 if(d.type==="segment"){const active=node.dataset.tsValue===value;node.classList.toggle("is-selected",active);node.setAttribute("aria-pressed",String(active));}
 if(d.type==="select"&&node.value!==value)node.value=value;
 if(d.type==="color"){
 const chip=node.querySelector(".ts-chip");if(chip){chip.style.background=value==="transparent"?"":hex(value);chip.classList.toggle("transparent",value==="transparent");}
 const text=node.querySelector(".ts-chip+span");if(text)text.textContent=Number.isInteger(paletteLinks[key])?"Palette color":value;
 }
 });
 if(key==="css.source")syntax();
}
function syntax(){
 const pre=root?.querySelector("[data-ts-syntax]");if(!pre)return;
 pre.innerHTML=esc(v("css.source")).replace(/([.#][a-zA-Z][\w-]*)/g,'<span class="ts-css-selector">$1</span>').replace(/([a-z-]+)(?=\s*:)/g,'<span class="ts-css-prop">$1</span>');
}
function mediaSample(i){
 return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent([
 `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 140"><rect width="240" height="140" fill="#dbded9"/><circle cx="185" cy="45" r="32" fill="#97a9a0"/><path d="M0 130 80 20l80 110 40-55 40 55" fill="#687b7a"/></svg>`,
 `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 140"><rect width="240" height="140" fill="#c7d0d3"/><path d="M30 130 120 12l85 118" stroke="#4a616c" stroke-width="22" fill="none"/></svg>`,
 `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 140"><rect width="240" height="140" fill="#e5d6c8"/><rect x="35" y="25" width="175" height="90" rx="23" fill="#a07365"/></svg>`
 ][i]);
}
function dismiss(restoreFocus=true){
 if(!popup)return;
 popup.remove();
 popup=null;
 if(restoreFocus)focusReturn?.focus?.();
 focusReturn=null;
}
function dialog(title,html,apply){
 dismiss();focusReturn=document.activeElement;
 popup=document.createElement("div");popup.className="ts-scrim";
 popup.innerHTML=`<div class="ts-modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="ts-modal-header"><strong>${esc(title)}</strong>${button("×",'data-ts-close aria-label="Close dialog" class="ts-modal-close"')}</div><div class="ts-modal-body">${html}</div><div class="ts-modal-footer">${button("Cancel","data-ts-close")}${button("Apply",'class="ts-apply" data-ts-apply')}</div></div>`;
 document.body.append(popup);
 popup.addEventListener("click",e=>{if(e.target===popup||e.target.closest("[data-ts-close]"))dismiss();});
 popup.querySelector("[data-ts-apply]").addEventListener("click",()=>{if(apply?.(popup)!==false)dismiss();});
 popup.addEventListener("keydown",e=>{
 if(e.key==="Escape"){e.preventDefault();dismiss();}
 if(e.key==="Tab"){const items=[...popup.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled)')];
 if(e.shiftKey&&document.activeElement===items[0]){e.preventDefault();items.at(-1).focus();}
 else if(!e.shiftKey&&document.activeElement===items.at(-1)){e.preventDefault();items[0].focus();}}
 });
 popup.querySelector("[data-ts-close]").focus();
 return popup;
}
function palettePicker(key,paletteIndex=null){
 const value=paletteIndex===null?v(key):v("palette."+paletteIndex);
 const html=`<label>Color<input type="color" data-ts-color-native value="${hex(value)}"></label><label>Hex<input data-ts-color-hex type="text" value="${hex(value)}" spellcheck="false"></label><div class="ts-palette">${Array.from({length:paletteCount},(_,i)=>i).map(i=>button(" ",`data-ts-palette-use="${i}" class="ts-palette-chip" style="background:${hex(v("palette."+i))}" aria-label="Use palette ${i+1}"`)).join("")}</div>${paletteIndex===null?'<label class="ts-transparency"><input type="checkbox" data-ts-transparent> Transparent</label>':""}<div data-ts-error role="alert"></div>`;
 const d=dialog("Choose color",html,box=>{
 const c=box.querySelector("[data-ts-color-hex]").value.trim();const transparent=box.querySelector("[data-ts-transparent]")?.checked;
 if(!transparent&&!validColor(c)){box.querySelector("[data-ts-error]").textContent="Enter a valid hex value.";return false;}
 const val=transparent?"transparent":c;
 if(paletteIndex===null){
   paletteLinks[key]=box.dataset.paletteChoice===undefined?undefined:+box.dataset.paletteChoice;
   set(key,val);
 }else{
   state["palette."+paletteIndex]=val;
   paletteCount=Math.max(paletteCount,paletteIndex+1);
   Object.keys(paletteLinks).forEach(k=>{if(paletteLinks[k]===paletteIndex)state[k]=val;sync(k);});
   save();renderPalette();updatePreview();applyWhitelistedPreview();
 }
 });
 d.querySelector("[data-ts-color-native]").addEventListener("input",e=>{d.querySelector("[data-ts-color-hex]").value=e.target.value;delete d.dataset.paletteChoice;});
 d.querySelector("[data-ts-color-hex]").addEventListener("input",()=>delete d.dataset.paletteChoice);
 d.querySelectorAll("[data-ts-palette-use]").forEach(b=>b.addEventListener("click",()=>{d.dataset.paletteChoice=b.dataset.tsPaletteUse;const c=v("palette."+b.dataset.tsPaletteUse);d.querySelector("[data-ts-color-hex]").value=c;d.querySelector("[data-ts-color-native]").value=hex(c);}));
}
function renderPalette(){
 const node=root?.querySelector(".ts-palette:not(.ts-modal .ts-palette)");
 if(!node)return;
 node.innerHTML=Array.from({length:paletteCount},(_,i)=>`<button type="button" data-ts-action="paletteEdit" data-ts-index="${i}" aria-label="Edit palette color ${i+1}" title="Edit palette color ${i+1}" class="ts-palette-chip" style="background:${hex(v("palette."+i))}"></button>`).join("")+button("+",'data-ts-action="paletteAdd" class="ts-palette-plus" aria-label="Add palette color" title="Add palette color"');
}
function chooseMedia(key){
 const html=`<p class="ts-helper">Local preview illustrations only; no production media changes.</p><div class="ts-media-choices">${[0,1,2].map(i=>`<button type="button" data-ts-image-choice="${i}"><img src="${esc(mediaSample(i))}" alt="Sample illustration ${i+1}"></button>`).join("")}</div><label class="ts-upload">Choose image from device<input type="file" accept="image/*" data-ts-upload></label><p data-ts-selected-label class="ts-helper">Select an image to continue.</p>`;
 const d=dialog("Preview media picker",html,box=>{
 if(!box.dataset.src){box.querySelector("[data-ts-selected-label]").textContent="Choose an image first.";return false;}
 media[key]=box.dataset.src;updateMedia(key);save();
 });
 d.querySelectorAll("[data-ts-image-choice]").forEach(b=>b.addEventListener("click",()=>{d.dataset.src=mediaSample(+b.dataset.tsImageChoice);d.querySelector("[data-ts-selected-label]").textContent="Sample selected";}));
 d.querySelector("[data-ts-upload]").addEventListener("change",e=>{const file=e.target.files?.[0];if(!file||!file.type.startsWith("image/"))return;const fr=new FileReader();fr.onload=()=>{d.dataset.src=fr.result;d.querySelector("[data-ts-selected-label]").textContent=file.name;};fr.readAsDataURL(file);});
}
function resourcePicker(key){
 const options=key==="search.empty"?["Featured collection","All products","New arrivals"]:["All Products","Home","Collections","Contact"];
 const d=dialog(key==="search.empty"?"Preview collection":"Link destination",`<p class="ts-helper">Fixture choices; not linked to live commerce.</p>${options.map((x,i)=>button(x,`data-ts-resource="${i}" class="ts-resource-choice"`)).join("")}${button("Clear","data-ts-clear-resource")}`,box=>{set(key,box.dataset.selected||"");renderFields();});
 d.dataset.selected=v(key);
 d.querySelectorAll("[data-ts-resource]").forEach(b=>b.addEventListener("click",()=>{d.dataset.selected=options[+b.dataset.tsResource];d.querySelectorAll("[data-ts-resource]").forEach(n=>n.setAttribute("aria-pressed",String(n===b)));}));
 d.querySelector("[data-ts-clear-resource]").addEventListener("click",()=>d.dataset.selected="");
}
function action(button){
 const a=button.dataset.tsAction,key=button.dataset.tsKey;
 if(a==="color")return palettePicker(key);
 if(a==="paletteEdit")return palettePicker(null,+button.dataset.tsIndex);
 if(a==="paletteAdd")return palettePicker(null,paletteCount);
 if(["media","explore"].includes(a))return chooseMedia(key);
 if(a==="mediaRemove"){delete media[key];updateMedia(key);save();return;}
 if(["collection","link"].includes(a))return resourcePicker(key);
 if(a==="name")return dialog("Manage store name",`<label>Store name<input data-ts-name value="${esc(brandName)}"></label>`,d=>{brandName=d.querySelector("[data-ts-name]").value.trim()||"Store";save();updatePreview();});
 if(a==="cssHelp")return dialog("About custom CSS","<p>The source editor is preview-only; CSS is not executed or published before mapping and approval.</p>");
 if(a==="variant"){selectedVariant=+button.dataset.tsChoice;return updatePreview();}
 if(a==="nextImage"){imageIndex=(imageIndex+1)%3;return updatePreview();}
 if(a==="previousImage"){imageIndex=(imageIndex+2)%3;return updatePreview();}
 if(["cart","drawer","modal","popover"].includes(a)){
 const isCart=a==="cart",asDrawer=a==="drawer"||(isCart&&v("cart.type")==="Drawer");
 const title=isCart?(asDrawer?"Cart drawer preview":"Cart page preview"):a==="drawer"?"Storefront drawer preview":a==="modal"?"Modal preview":"Popover preview";
 const html=isCart?'<div class="ts-demo-lines"><div>Field Collection <strong>$45.00</strong></div><div>Cart total <strong>$45.00</strong></div><p>Local fixture. No order or checkout is placed.</p></div>':'<p>Storefront presentation preview; no merchant content is changed.</p>';
 const d=dialog(title,html);
 const surface=d.querySelector(".ts-modal");
 if(asDrawer)surface.classList.add("ts-preview-drawer");
 if(a==="popover"){surface.classList.add("ts-preview-popover");const bounds=button.getBoundingClientRect();surface.style.top=Math.max(10,Math.min(bounds.bottom+8,innerHeight-160))+"px";surface.style.left=Math.max(10,Math.min(bounds.left,innerWidth-290))+"px";}
 const prefix=a==="modal"||a==="popover"?"overlays":"drawers";
 surface.style.background=hex(v(prefix+".bg"));surface.style.color=hex(v(prefix+".text"));surface.style.borderColor=hex(v(prefix+".border"));
 if(prefix==="overlays"){surface.style.borderRadius=v("overlays.radius")+"px";surface.style.borderWidth=v("overlays.thickness")+"px";surface.style.boxShadow=v("overlays.shadow")?"0 14px 45px "+hex(v("overlays.shadowColor"))+"35":"none";}
 return;
 }
 if(a==="motionDemo"){const demo=root.querySelector(".ts-motion-card");if(demo){demo.classList.remove("is-playing");void demo.offsetWidth;demo.classList.add("is-playing");}return;}
 if(button.closest(".ts-button-examples"))return dialog("Button style preview","<p>These are interactive style samples. No storefront action or commerce workflow is connected to this preview.</p>");
 if(key&&fieldMap.get(key)?.type==="switch")return set(key,!v(key));
 if(key&&button.dataset.tsValue!==undefined)return set(key,button.dataset.tsValue);
}
function price(key){return "$45.00"+(v("prices."+key)?" USD":"");}
function demo(cat){
 const previewButton=(text,a)=>button(text,`data-ts-action="${a}"`);
 const product=()=>`<div class="ts-product" style="background:${hex(v("cards.bg"))};color:${hex(v("cards.text"))}"><div class="ts-product-image" data-ts-image style="background:${["#8d9791","#a4b7b7","#c4afa1"][imageIndex]}"><span>Media ${imageIndex+1} / 3</span>${v("cards.carousel")?`<div>${button("‹",'data-ts-action="previousImage" aria-label="Previous image"')}${button("›",'data-ts-action="nextImage" aria-label="Next image"')}</div>`:""}</div><strong>Field Collection</strong><small>${price("cards")}</small>${(document.getElementById("te-preview-device")?.dataset.device==="mobile"?v("cards.mobileQuick"):v("cards.quick"))?previewButton("Quick add","cart"):""}</div>`;
 switch(cat){
 case "brand":return `<strong>${esc(brandName)}</strong><p>Asset previews appear in their own fields above.</p>`;
 case "palette":return `<div class="ts-demo-colors">${Array.from({length:paletteCount},(_,i)=>i).map(i=>`<span style="background:${hex(v("palette."+i))}"></span>`).join("")}</div>`;
 case "type":return `<h2 style="font-family:${esc(v("type.font.Heading"))},sans-serif;font-size:clamp(22px,5vw,${parseInt(v("type.h1.size"))}px);text-transform:${v("type.h1.case")==="Uppercase"?"uppercase":"none"};color:${hex(v("type.text"))};line-height:${{Tight:1.1,Normal:1.35,Loose:1.65}[v("type.h1.line")]}">Designed for living</h2><p style="font-family:${esc(v("type.font.Body"))},sans-serif;font-size:${esc(v("type.p.size"))};line-height:${{Tight:1.1,Normal:1.4,Loose:1.7}[v("type.p.line")]}">Typography preview, with responsive sizing.</p>`;
 case "page":return `<div class="ts-page-example" style="background:${hex(v("page.bg"))}"><div style="width:${{Narrow:"48%",Standard:"64%",Wide:"83%","Full width":"100%"}[v("page.width")]}">Content width</div></div>`;
 case "motion":return `<div tabindex="0" class="ts-motion-card ${v("motion.hover").toLowerCase().replace(/ /g,"-")}">Hover or focus for the chosen effect</div><div class="ts-demo-lines ts-motion-status"><div>Page transition <strong>${v("motion.page")?"On":"Off"}</strong></div><div>Product transition <strong>${v("motion.product")?"On":"Off"}</strong></div><div>Add-to-cart animation <strong>${v("motion.cart")?"On":"Off"}</strong></div></div>${button("Play transition","data-ts-action=\"motionDemo\"")}`;
 case "badges":return `<div class="ts-badge-example"><span style="background:${hex(v("badges.saleBg"))};color:${hex(v("badges.saleText"))};border-radius:${v("badges.radius")}px;text-transform:${v("badges.case")==="Uppercase"?"uppercase":"none"}">${esc(v("badges.position"))}: SALE</span><span style="background:${hex(v("badges.soldBg"))};color:${hex(v("badges.soldText"))}">SOLD OUT</span></div>`;
 case "buttons":return `<div class="ts-button-examples">${["primary","secondary","pills"].map(x=>button(x,`style="background:${v("buttons."+x+".bg")==="transparent"?"transparent":hex(v("buttons."+x+".bg"))};color:${hex(v("buttons."+x+".text"))};border:${v("buttons."+x+".borderW")}px solid ${hex(v("buttons."+x+".border"))};border-radius:${v("buttons."+x+".radius")}px;text-transform:${v("buttons."+x+".case")==="Uppercase"?"uppercase":"none"}"`)).join("")}</div>`;
 case "cart":return `<div class="ts-demo-lines"><div>Cart item <strong>${price("items")}</strong></div><div>Total <strong>${price("total")}</strong></div>${v("cart.note")?'<textarea placeholder="Note to seller" aria-label="Seller note"></textarea>':""}${v("cart.discount")?'<small>Discount input available</small>':""}${v("cart.accelerated")?'<small>Accelerated checkout preview · disabled</small>':""}${previewButton(v("cart.type")==="Drawer"?"Open cart drawer":"Open cart page","cart")}</div>`;
 case "drawers":return previewButton("Open storefront drawer","drawer");
 case "icons":return `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${{Thin:1,Default:2,Heavy:3}[v("icons.stroke")]}" stroke-linecap="round"><circle cx="10" cy="10" r="7"/><path d="m16 16 6 6"/></svg>`;
 case "inputs":return `<div class="ts-input-demo" style="--input-bg:${hex(v("inputs.bg"))};--input-text:${hex(v("inputs.text"))};--input-border:${hex(v("inputs.border"))};--input-radius:${v("inputs.radius")}px;--input-thickness:${v("inputs.thickness")}px"><input aria-label="Example input" placeholder="Text input"><input type="email" aria-label="Email input" placeholder="Email address"><input disabled value="Unavailable" aria-label="Disabled input"><input aria-invalid="true" value="Invalid" aria-label="Invalid input"></div>`;
 case "overlays":return `${previewButton("Preview popover","popover")} ${previewButton("Preview modal","modal")}`;
 case "prices":return `<div class="ts-demo-lines">${[["Product pages","product"],["Product cards","cards"],["Cart items","items"],["Cart total","total"]].map(([l,k])=>`<div>${l}<strong>${price(k)}</strong></div>`).join("")}</div>`;
 case "cards":return product();
 case "search":return `<div class="ts-demo-search"><input type="search" data-ts-search value="${esc(searchQuery)}" placeholder="Search sample products" aria-label="Preview search"><div class="ts-search-result" style="border-radius:${v("search.cardRadius")}px"><span class="ts-search-art" style="border-radius:${v("search.productRadius")}px"></span><strong data-ts-result style="text-transform:${v("search.title")==="Uppercase"?"uppercase":"none"}">${searchQuery&&!/field collection/i.test(searchQuery)?"No fixture matches":"Field Collection"}</strong></div><small>${esc(v("search.empty")||"No collection selected")} · local fixture only</small></div>`;
 case "swatches":return `<div class="ts-demo-swatches">${["Graphite","Sand","Stone","Unavailable"].map((l,i)=>button(selectedVariant===i?"✓":"",`data-ts-action="variant" data-ts-choice="${i}" ${i===3?"disabled":""} aria-pressed="${selectedVariant===i}" aria-label="${l}" title="${l}" style="width:${v("swatches.width")}px;height:${v("swatches.height")}px;border-radius:${v("swatches.radius")}px;border:${v("swatches.borders")==="None"?0:v("swatches.thickness")}px solid rgba(0,0,0,${v("swatches.opacity")/100});background:${["#303030","#d2c5ac","#9c9c97","#e9e9e9"][i]};${v("swatches.images")&&i!==3?`background-image:url(${mediaSample(i%3)});background-position:center;background-size:cover;`:""}"`)).join("")}</div>`;
 case "variants":return `<div class="ts-demo-variants ${v("variants.width")==="Fill"?"is-fill":""}">${["Small","Medium","Large"].map((label,i)=>button(label,`data-ts-action="variant" data-ts-choice="${i}" aria-pressed="${selectedVariant===i}" style="background:${hex(v(i===selectedVariant?"variants.selectedBg":"variants.bg"))};color:${hex(v(i===selectedVariant?"variants.selectedText":"variants.text"))};border:${v("variants.thickness")}px solid ${hex(v(i===selectedVariant?"variants.selectedBorder":"variants.border"))};border-radius:${v("variants.radius")}px"`)).join("")}</div>`;
 case "css":return "<p>Custom CSS is saved to isolated session preview state and is not applied to the storefront.</p>";
 default:return "";
 }
}
function updatePreview(){
 const place=root?.querySelector("[data-ts-demo-content]");
 if(place)place.innerHTML=demo(category);
}
function applyWhitelistedPreview(){
 let doc;try{doc=document.getElementById("theme-preview")?.contentDocument;}catch{}
 if(!doc?.head)return;
 let style=doc.getElementById("ts-review-preview-style");
 if(!style){style=doc.createElement("style");style.id="ts-review-preview-style";doc.head.append(style);}
 // Only known, sanitized properties. Never execute merchant-supplied CSS in the administrative context.
 style.textContent=`:root{--ts-review-text:${hex(v("type.text"))};--ts-review-cards:${hex(v("cards.bg"))}}[data-cms-section] .cms-product-card{background:var(--ts-review-cards)}[data-cms-section] h1,[data-cms-section] h2{color:var(--ts-review-text)}@media(prefers-reduced-motion:reduce){*{transition-duration:.01ms!important;animation-duration:.01ms!important}}`;
}
function renderFields(){
 if(!root||!category)return;
 const content=root.querySelector(`[data-ts-panel="${category}"]`);
 if(!content)return;
 content.innerHTML=forms[category].map(inputFor).join("")+`<div class="ts-preview" aria-label="${esc(categories.find(x=>x[0]===category)[1])} local preview"><div class="ts-preview-title">Preview <span>Local sample</span></div><div data-ts-demo-content></div></div>`;
 forms[category].filter(x=>x.type==="media").forEach(x=>updateMedia(x.key));
 syntax();updatePreview();
}
function openCategory(key){
 // The category key is the single source of truth: never accumulate open panels.
 if(!root||!categories.some(([id])=>id===key))return;
 const next=category===key?"":key;
 const selected=root.querySelector('[data-ts-category="'+key+'"] > h3 > [data-ts-toggle]');
 const scrollHost=root.closest('[data-drawer-panel="theme-settings"]');
 const oldTop=selected?.getBoundingClientRect().top;
 // Switching categories must not restore focus into the panel being hidden.
 dismiss(false);
 category=next;
 root.dataset.openCategory=category;
 root.querySelectorAll("[data-ts-category]").forEach(section=>{
  const isOpen=section.dataset.tsCategory===category;
  const trigger=section.querySelector("[data-ts-toggle]");
  const panel=section.querySelector("[data-ts-panel]");
  section.classList.toggle("is-open",isOpen);
  trigger.setAttribute("aria-expanded",String(isOpen));
  trigger.dataset.state=isOpen?"open":"closed";
  panel.hidden=!isOpen;
  panel.setAttribute("aria-hidden",String(!isOpen));
  panel.toggleAttribute("inert",!isOpen);
 });
 renderFields();
 applyWhitelistedPreview();
 // Collapsing a long category above the clicked row must not make the row jump.
 if(scrollHost&&oldTop!==undefined){
  const movement=selected.getBoundingClientRect().top-oldTop;
  if(Number.isFinite(movement)&&Math.abs(movement)>1)scrollHost.scrollTop+=movement;
 }
}
function mount(){
 if(document.getElementById("ts-theme-root"))return true;
 const drawer=document.querySelector('[data-drawer-panel="theme-settings"]');
 if(!drawer)return false;
 load();drawer.innerHTML='<div id="ts-theme-root" class="ts-theme-root"></div>';root=drawer.firstElementChild;
 root.dataset.openCategory="";
 root.innerHTML=`<div class="ts-heading"><h2>Theme settings</h2><span>Preview</span></div><div class="ts-categories"></div><div class="ts-theme-style"><span>Theme style</span><span title="Theme style switching is deferred until backend mapping">ⓘ</span></div><p class="ts-review-note" data-ts-review-note>Preview only · preserved for this browser session · not published</p>`;
 rail=root.querySelector(".ts-categories");
 rail.innerHTML=categories.map(([id,label])=>`<section class="ts-category" data-ts-category="${id}"><h3><button type="button" data-ts-toggle aria-expanded="false" aria-controls="ts-panel-${id}" data-state="closed"><span>${esc(label)}</span><svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="1.8"/></svg></button></h3><div id="ts-panel-${id}" data-ts-panel="${id}" class="ts-category-content" aria-hidden="true" inert hidden></div></section>`).join("");
 rail.addEventListener("mouseover",e=>{
 if(category!=="cards"||!v("cards.second")||imageIndex!==0)return;
 const card=e.target.closest(".ts-product");
 if(!card||card.contains(e.relatedTarget))return;
 const art=card.querySelector("[data-ts-image]");
 if(art){art.style.background="#a4b7b7";art.querySelector("span").textContent="Media 2 / 3";}
 });
 rail.addEventListener("mouseout",e=>{
 if(category!=="cards"||imageIndex!==0)return;
 const card=e.target.closest(".ts-product");
 if(!card||card.contains(e.relatedTarget))return;
 const art=card.querySelector("[data-ts-image]");
 if(art){art.style.background="#8d9791";art.querySelector("span").textContent="Media 1 / 3";}
 });
 rail.addEventListener("click",e=>{
 const toggleButton=e.target.closest("[data-ts-toggle]");
 if(toggleButton)return openCategory(toggleButton.closest("[data-ts-category]").dataset.tsCategory);
 const actionButton=e.target.closest("button");if(actionButton)action(actionButton);
 });
 rail.addEventListener("input",e=>{
 const t=e.target;
 if(t.matches("[data-ts-search]")){searchQuery=t.value;const result=root.querySelector("[data-ts-result]");if(result)result.textContent=searchQuery&&!/field collection/i.test(searchQuery)?"No fixture matches":"Field Collection";return;}
 const key=t.dataset.tsKey;if(!key)return;
 if(fieldMap.get(key)?.type==="range"||fieldMap.get(key)?.type==="code"){set(key,t.value);if(key==="css.source")syntax();}
 });
 rail.addEventListener("change",e=>{
 const t=e.target,key=t.dataset.tsKey;
 if(key&&(fieldMap.get(key)?.type==="select"||fieldMap.get(key)?.type==="range"))set(key,t.value);
 });
 document.addEventListener("keydown",e=>{if(e.key==="Escape")dismiss();});
 document.getElementById("theme-preview")?.addEventListener("load",applyWhitelistedPreview);
 const previewDevice=document.getElementById("te-preview-device");
 if(previewDevice)new MutationObserver(updatePreview).observe(previewDevice,{attributes:true,attributeFilter:["data-device"]});
 window.ThemeSettingsPanel={open:openCategory,close:()=>{if(category)openCategory(category);},refresh:updatePreview,getState:()=>({category,values:{...state},links:{...paletteLinks},storage:"sessionStorage",published:false})};
 return true;
}
if(!mount()){
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",mount,{once:true});
 else requestAnimationFrame(mount);
}
})();
