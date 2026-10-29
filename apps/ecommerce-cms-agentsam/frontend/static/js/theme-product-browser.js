/* Package catalog previews + authenticated, source-backed draft creation. */
(() => {
 'use strict';
 const root=document.getElementById('theme-marketplace-grid');
 if(!root)return;
 const search=document.getElementById('theme-marketplace-search');
 const filter=document.getElementById('theme-marketplace-filter');
 const count=document.getElementById('theme-marketplace-count');
 let products=[];
 let drafts=[];
 const node=(tag,className,text)=>{
   const element=document.createElement(tag);
   if(className)element.className=className;
   if(text!==undefined)element.textContent=String(text);
   return element;
 };
 const sameOriginUrl=path=>{
   if(typeof path!=='string'||!path.startsWith('/')||path.startsWith('//'))return null;
   try {
     const url=new URL(path,location.origin);
     return url.origin===location.origin?url:null;
   }catch{return null;}
 };
 function previewInsideStudio(product){
   const url=sameOriginUrl(product.preview_url);
   if(!url)return;
   const dialog=node('dialog','theme-marketplace-dialog');
   const header=node('div','theme-marketplace-dialog-head');
   header.append(node('strong','',product.name+' · Packaged preview'));
   const close=node('button','btn ghost small','Close');
   close.type='button';close.addEventListener('click',()=>dialog.close());
   header.append(close);
   const frame=node('iframe','theme-marketplace-dialog-frame');
   frame.title=product.name+' preview';
   frame.src=url.toString();
   frame.setAttribute('sandbox','allow-scripts');
   dialog.append(header,frame);
   dialog.addEventListener('close',()=>dialog.remove(),{once:true});
   document.body.append(dialog);dialog.showModal();
 }
 async function addDraft(product,button){
   button.disabled=true;button.textContent='Adding…';
   try{
     const res=await fetch('/api/admin/theme-products/drafts',{
       method:'POST',credentials:'same-origin',
       headers:{'content-type':'application/json'},
       body:JSON.stringify({slug:product.slug})
     });
     const data=await res.json();
     if(!res.ok||!data.ok)throw Error(data.error||'Draft was not saved');
     drafts=[...drafts.filter(d=>d.slug!==product.slug),data.draft];
     render();
     document.dispatchEvent(new CustomEvent('agentsam:theme-draft-added',{detail:data.draft}));
   }catch(error){
     button.disabled=false;button.textContent='Add to Drafts';
     const card=button.closest('.theme-marketplace-item');
     card?.querySelector('.theme-marketplace-error')?.remove();
     const warning=node('p','theme-marketplace-error','Could not add draft: '+error.message);
     warning.setAttribute('role','alert');
     card?.querySelector('.theme-marketplace-body')?.append(warning);
   }
 }
 function render(){
   const q=search.value.trim().toLowerCase(),category=filter.value;
   const visible=products.filter(product=>!drafts.some(d=>d.slug===product.slug) && (category==='all'||product.category===category)
     && (!q || [product.name,product.category,product.description].join(' ').toLowerCase().includes(q)));
   root.replaceChildren();
   count.textContent=visible.length+' available · '+drafts.length+' in Drafts';
   if(!visible.length){
     const empty=node('div','theme-marketplace-empty');
     empty.append(node('strong','',drafts.length===products.length?'All templates added to Drafts.':'No templates match those filters.'),node('p','','Open Draft themes above or change your filters.'));
     const clear=node('button','btn ghost small','Clear filters');
     clear.type='button';clear.addEventListener('click',()=>{search.value='';filter.value='all';render();});
     empty.append(clear);root.append(empty);return;
   }
   for(const product of visible){
     const card=node('article','theme-marketplace-item');
     const visual=node('div','theme-marketplace-visual');
     const preview=sameOriginUrl(product.preview_url);
     const thumbnail=sameOriginUrl(product.thumbnail_url);
     if(thumbnail && product.preview_ready){
       const image=node('img','theme-marketplace-thumb');
       image.loading='lazy';
       image.alt=product.name+' theme artwork';
       image.src=thumbnail.toString();
       visual.append(image);
     }else{
       visual.append(node('div','theme-marketplace-unavailable','Preview artwork unavailable'));
     }
     visual.append(node('span','theme-marketplace-state',product.preview_ready?'Preview available':'Source only'));
     const body=node('div','theme-marketplace-body');
     body.append(node('span','theme-marketplace-category',product.category),node('h3','',product.name),node('p','',product.description));
     const meta=node('div','theme-marketplace-meta',product.package+' · v'+product.version);
     body.append(meta);
     const actions=node('div','theme-marketplace-actions');
     if(preview){
       const open=node('button','btn ghost small','Preview');
       open.type='button';
       open.addEventListener('click',()=>previewInsideStudio(product));
       actions.append(open);
     }
     const add=node('button','btn small','Add to Drafts');
     add.type='button';
     add.addEventListener('click',()=>void addDraft(product,add));
     actions.append(add);
     body.append(actions);
     const foot=node('p','theme-marketplace-disclaimer','Add to Drafts to save this theme under your Online Store. Site installation is a separate step.');
     body.append(foot);
     card.append(visual,body);root.append(card);
   }
 }
 async function load(){
   try{
     const res=await fetch('/api/admin/theme-products',{credentials:'same-origin',cache:'no-store'});
     if(!res.ok)throw Error('Catalog unavailable (HTTP '+res.status+')');
     const data=await res.json();
     if(!data.ok||!Array.isArray(data.products))throw Error('Catalog response not supported');
     products=data.products.filter(p=>p&&p.slug&&p.name);
     const draftResult=await fetch('/api/admin/theme-products/drafts',{credentials:'same-origin',cache:'no-store'}).catch(()=>null);
     if(draftResult?.ok){
       const saved=await draftResult.json().catch(()=>null);
       drafts=Array.isArray(saved?.drafts)?saved.drafts:[];
     }
     filter.replaceChildren(new Option('All categories','all'));
     for(const category of [...new Set(products.map(p=>p.category))].sort()){
       filter.add(new Option(category,category));
     }
     render();
   }catch(error){
     count.textContent='Catalog unavailable';
     root.replaceChildren();
     const empty=node('div','theme-marketplace-empty');
     empty.append(node('strong','','Theme catalog could not be loaded.'),node('p','',error.message));
     const retry=node('button','btn ghost small','Try again');retry.type='button';retry.addEventListener('click',load);
     empty.append(retry);root.append(empty);
   }
 }
 search.addEventListener('input',render);filter.addEventListener('change',render);
 void load();
})();
