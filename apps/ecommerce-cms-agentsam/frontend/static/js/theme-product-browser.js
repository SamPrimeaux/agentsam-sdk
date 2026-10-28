/* Catalog browser is read-only. Product/package identity comes from the server. */
(() => {
 'use strict';
 const root=document.getElementById('theme-marketplace-grid');
 if(!root)return;
 const search=document.getElementById('theme-marketplace-search');
 const filter=document.getElementById('theme-marketplace-filter');
 const count=document.getElementById('theme-marketplace-count');
 let products=[];
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
 function render(){
   const q=search.value.trim().toLowerCase(),category=filter.value;
   const visible=products.filter(product=>(category==='all'||product.category===category)
     && (!q || [product.name,product.category,product.description].join(' ').toLowerCase().includes(q)));
   root.replaceChildren();
   count.textContent=visible.length+' of '+products.length+' packages';
   if(!visible.length){
     const empty=node('div','theme-marketplace-empty');
     empty.append(node('strong','','No templates match those filters.'),node('p','','Try another category or clear your search.'));
     const clear=node('button','btn ghost small','Clear filters');
     clear.type='button';clear.addEventListener('click',()=>{search.value='';filter.value='all';render();});
     empty.append(clear);root.append(empty);return;
   }
   for(const product of visible){
     const card=node('article','theme-marketplace-item');
     const visual=node('div','theme-marketplace-visual');
     const preview=sameOriginUrl(product.preview_url);
     if(preview&&product.preview_ready){
       const frame=node('iframe','theme-marketplace-frame');
       frame.title=product.name+' static theme preview';
       frame.loading='lazy';frame.tabIndex=-1;
       frame.setAttribute('sandbox','allow-scripts');
       frame.src=preview.toString();
       visual.append(frame);
     }else{
       visual.append(node('div','theme-marketplace-unavailable','Preview not built'));
     }
     visual.append(node('span','theme-marketplace-state',product.preview_ready?'Local preview':'Source only'));
     const body=node('div','theme-marketplace-body');
     body.append(node('span','theme-marketplace-category',product.category),node('h3','',product.name),node('p','',product.description));
     const meta=node('div','theme-marketplace-meta',product.package+' · v'+product.version);
     body.append(meta);
     const actions=node('div','theme-marketplace-actions');
     if(preview){
       const a=node('a','btn ghost small','View site');
       a.href=preview.toString();a.target='_blank';a.rel='noopener noreferrer';
       actions.append(a);
     }
     const download=sameOriginUrl(product.download_url);
     if(download && product.download_kind==='preview_zip'){
       const a=node('a','btn ghost small','Download preview ZIP');
       a.href=download.toString();
       a.setAttribute('download','');
       a.title='Read-only demo and CMS seed; not a production installer';
       actions.append(a);
     }
     const editor=sameOriginUrl(product.editor_url);
     if(editor){
       const a=node('a','btn small','Open in Studio');
       a.href=editor.toString();actions.append(a);
     }
     body.append(actions);
     const foot=node('p','theme-marketplace-disclaimer','Uninstalled product · CMS install and checkout not connected');
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
