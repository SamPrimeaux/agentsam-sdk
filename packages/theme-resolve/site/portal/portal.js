/* Resolve Customer Portal — reusable preview templates shipped in Resolve.
 * This UI intentionally never authenticates, submits credentials, collects payment,
 * or reads real customer data. Host platform owns those operations.
 */
(() => {
  'use strict';
  const PREFIX = new URL(document.baseURI).pathname.replace(/\/+$/, '');
  const BRANDED_KEY = 'resolve.portal.preview.brand.v1';
  const DEMO_KEY = 'resolve.portal.preview.session.v1';
  const catalog = [
    {id:'coat-01',name:'The Kage Overcoat',price:640,category:'Outerwear',collection:'atelier',descriptor:'Tailored heavy wool · Espresso'},
    {id:'bag-02',name:'Forme Leather Carryall',price:395,category:'Accessories',collection:'objects',descriptor:'Full grain leather · Oxblood'},
    {id:'dress-03',name:'Evening Structure',price:520,category:'Ready to wear',collection:'after-dark',descriptor:'Sculptural silk blend · Noir'},
    {id:'coat-04',name:'Wool Studio Jacket',price:450,category:'Outerwear',collection:'atelier',descriptor:'Brushed wool · Stone'},
    {id:'bag-05',name:'Archive Mini Tote',price:285,category:'Accessories',collection:'objects',descriptor:'Italian leather · Smoke'},
    {id:'dress-06',name:'The Late Edition',price:495,category:'Ready to wear',collection:'after-dark',descriptor:'Fluid crepe · Midnight'}
  ];
  const defaults = {
    name:'RESOLVE', tagline:'Objects of lasting desire.',logo_url:'',
    accent:'#8b181b',backdrop_from:'#131720',backdrop_mid:'#412634',backdrop_to:'#84636b',
    glass_opacity:0.12,parallax_enabled:true,parallax_strength:18,
    signup_enabled:true,password_gate_enabled:false,show_guest_checkout:true
  };
  const app = document.getElementById('app');
  const qs = new URLSearchParams(location.search);
  const inEditor = qs.get('studio_preview') === '1' || window.top !== window;
  let brand = {...defaults};
  let demoActive = false;
  let cart = [];
  let saved = [];
  let mobileMenu = false;
  let activeFilter = 'All';
  let editorSectionSettings = {};
  let editorSelection = null;
  let state = {page:'collections',message:'',orderFilter:'all'};
  function readState() {
    try {const val=JSON.parse(localStorage.getItem(BRANDED_KEY)||'null');if(val&&typeof val==='object')brand=sanitizeBrand(val);}catch{}
    try {
      const val=JSON.parse(sessionStorage.getItem(DEMO_KEY)||'null');
      if(val&&typeof val==='object') {
        demoActive=val.demo===true;
        cart=Array.isArray(val.cart)?val.cart.filter(i=>catalog.some(p=>p.id===i.id)).map(i=>({id:i.id,quantity:Math.max(1,Math.min(20,Number(i.quantity)||1))})):[];
        saved=Array.isArray(val.saved)?val.saved.filter(i=>catalog.some(p=>p.id===i)):[];
      }
    }catch{}
  }
  function sanitizeBrand(v){
    const next={...defaults};
    if(typeof v.name==='string')next.name=v.name.slice(0,48).trim()||defaults.name;
    if(typeof v.tagline==='string')next.tagline=v.tagline.slice(0,130);
    if(typeof v.logo_url==='string'){
      try {
        const url=new URL(v.logo_url,location.origin);
        if(['https:','http:'].includes(url.protocol))next.logo_url=url.href;
      }catch{}
    }
    for(const k of ['accent','backdrop_from','backdrop_mid','backdrop_to']){
      if(/^#[0-9a-fA-F]{6}$/.test(v[k]))next[k]=v[k];
    }
    next.glass_opacity=Math.max(.04,Math.min(.33,Number(v.glass_opacity) || .12));
    next.parallax_strength=Math.max(0,Math.min(35,Number(v.parallax_strength) || 0));
    for(const key of ['parallax_enabled','signup_enabled','password_gate_enabled','show_guest_checkout'])
      if(typeof v[key]==='boolean')next[key]=v[key];
    return next;
  }
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function href(route){return PREFIX+'/'+route;}
  function currency(n){return '$'+Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});}
  function labelFor(s){return ({'collections':'Collections','collections/atelier':'The Atelier','customer/sign-in':'Sign in','customer/sign-up':'Create account','customer/account':'Account','customer/orders':'Orders','customer/saved':'Saved pieces','customer/profile':'My profile','cart':'Cart','password':'Password access'})[s]||'Collections';}
  function getRoute(){
    const path=decodeURIComponent(location.pathname).replace(/\/+$/,'');
    const rest=path.startsWith(PREFIX)?path.slice(PREFIX.length+1):'collections';
    const allowed=['collections','collections/atelier','customer/sign-in','customer/sign-up','customer/account','customer/orders','customer/saved','customer/profile','cart','password'];
    return allowed.includes(rest)?rest:'collections';
  }
  function persist() {
    sessionStorage.setItem(DEMO_KEY,JSON.stringify({demo:demoActive,cart,saved}));
  }
  function applyBrand(){
    const style=document.documentElement.style;
    for(const [name,key] of [['--accent','accent'],['--from','backdrop_from'],['--mid','backdrop_mid'],['--to','backdrop_to']])style.setProperty(name,brand[key]);
    style.setProperty('--glass',String(brand.glass_opacity));
    document.title=labelFor(state.page)+' · '+brand.name+' (preview)';
  }
  function brandLockup() {
    return '<span class="rp-logo-mark" aria-hidden="true">◆</span>' +
      (brand.logo_url?'<img src="'+esc(brand.logo_url)+'" alt="'+esc(brand.name)+' logo">':'<span>'+esc(brand.name)+'</span>')+
      '<span class="rp-logo-mark" aria-hidden="true">◆</span>';
  }
  function nav() {
    const account=demoActive?href('customer/account'):href('customer/sign-in');
    return '<header class="rp-nav" data-cms-section="header"><div class="rp-nav-inner">'+
      '<nav class="rp-nav-links" aria-label="Shop"><a href="'+href('collections')+'" data-nav>Collections</a>'+
      '<a href="'+href('collections/atelier')+'" data-nav>Wardrobe</a><a href="'+href('customer/saved')+'" data-nav>Wishlist</a></nav>'+
      '<a href="'+esc(new URL('../',document.baseURI).pathname)+'" class="rp-logo" aria-label="'+esc(brand.name)+' home">'+brandLockup()+'</a>'+
      '<div class="rp-nav-actions"><a href="'+href('password')+'" data-nav>Private access</a>'+
      '<a class="rp-account-link" href="'+account+'" data-nav>Account</a>'+
      '<a href="'+href('cart')+'" data-nav>Bag <span class="rp-pill">'+cart.reduce((s,i)=>s+i.quantity,0)+'</span></a>'+
      '<button class="rp-mobile-menu" type="button" data-action="mobile-menu" aria-expanded="'+mobileMenu+'" aria-label="Open navigation">☰</button></div></div>'+
      '<nav class="rp-mobile-links'+(mobileMenu?' open':'')+'" aria-label="Mobile shop"><a href="'+href('collections')+'" data-nav>Collections</a><a href="'+href('collections/atelier')+'" data-nav>Wardrobe</a>'+
      '<a href="'+account+'" data-nav>My account</a><a href="'+href('customer/saved')+'" data-nav>Saved pieces</a><a href="'+href('password')+'" data-nav>Private access</a></nav></header>';
  }
  function footer(){
    return '<footer class="rp-footer" data-cms-section="footer"><div>◆ '+esc(brand.name)+' <small>— '+esc(brand.tagline)+'</small></div>'+
      '<div><a href="'+href('collections')+'" data-nav>Shop</a> &nbsp; / &nbsp; <a href="'+href('customer/sign-in')+'" data-nav>Account</a>'+
      ' &nbsp; / &nbsp; <a href="'+href('cart')+'" data-nav>Bag</a></div><small>Interactive preview · No live authentication or payments</small></footer>';
  }
  function previewNote(){return '<span class="rp-preview-badge">◌ Interactive design preview · Sample content</span>';}
  function productCard(p){
    const inSaved=saved.includes(p.id);
    return '<article class="rp-product"><div class="rp-product-art"><span aria-hidden="true"></span>'+
      '<div class="rp-canvas-badge">'+esc(p.category)+'</div></div><div class="rp-product-info">'+
      '<h3>'+esc(p.name)+'</h3><p>'+esc(p.descriptor)+' &nbsp; · &nbsp; '+currency(p.price)+'</p>'+
      '<div class="rp-product-actions"><button data-action="add-cart" data-id="'+p.id+'" aria-label="Add '+esc(p.name)+' to bag">Add to bag +</button>'+
      '<button data-action="toggle-save" data-id="'+p.id+'" aria-label="'+(inSaved?'Remove':'Save')+' '+esc(p.name)+'">'+(inSaved?'♥':'♡')+'</button></div></div></article>';
  }
  function collectionPage(detail=false) {
    const collectionLinks=[
      {title:'The Atelier',caption:'Outerwear · 02',target:'collections/atelier',tag:'01 / Signature'},
      {title:'Objects',caption:'Leather & essentials',target:'collections/atelier',tag:'02 / Editions'},
      {title:'After Dark',caption:'Evening collection',target:'collections/atelier',tag:'03 / Private'}
    ];
    return '<main class="rp-page" id="content"><div class="rp-container">'+
      '<div class="rp-eyebrow">Resolve / The collection archive</div>'+
      '<div class="rp-shop-intro" data-cms-section="collection-hero"><h1 class="rp-serif">'+(detail?'The <em>Atelier.</em>':'The <em>collections.</em>')+'</h1>'+
      '<div><p class="rp-muted">Considered forms, uncompromising materials, and pieces intended to grow with you.</p>'+previewNote()+'</div></div>'+
      (detail?'<div class="rp-row"><strong>Curated collection · 6 pieces</strong><span class="rp-muted">Edition 01 · All pieces</span></div>'+
        '<div class="rp-filters" data-cms-section="filters" aria-label="Filter pieces">'+
        ['All','Outerwear','Accessories','Ready to wear'].map(filter=>'<button type="button" data-filter="'+filter+'" class="'+(filter===activeFilter?'active':'')+'">'+filter+'</button>').join('')+
        '</div><div class="rp-products" data-cms-section="product-grid" style="margin:30px 0">'+
        catalog.filter(p=>activeFilter==='All'||p.category===activeFilter).map(productCard).join('')+'</div>':
      '<div class="rp-collections" data-cms-section="collection-grid">'+collectionLinks.map(c=>
        '<a class="rp-collection-card" href="'+href(c.target)+'" data-nav><div class="rp-collection-visual"><div class="rp-canvas-badge">'+esc(c.tag)+'</div></div>'+
        '<div class="rp-collection-caption"><div><strong>'+esc(c.title)+'</strong><div><small>'+esc(c.caption)+'</small></div></div><span aria-hidden="true">↗</span></div></a>').join('')+'</div>')+
      '<div class="rp-panel" data-cms-section="editorial-cta" style="margin-top:65px;display:flex;justify-content:space-between;gap:25px;align-items:center;flex-wrap:wrap">'+
      '<div><div class="rp-eyebrow">From the archive</div><h2 style="font:400 40px/1.1 Cormorant Garamond,serif;margin:10px 0">A life beyond the season.</h2><p class="rp-muted">Get early access to private releases and members-only edits.</p></div>'+
      (brand.signup_enabled?'<a href="'+href('customer/sign-up')+'" data-nav class="rp-btn">Create your account ↗</a>':'<a href="'+href('customer/sign-in')+'" data-nav class="rp-btn">Customer sign in ↗</a>')+'</div></div></main>';
  }
  function authForm(route){
    const passwordGate=route==='password';
    const registration=route==='customer/sign-up';
    const heading=passwordGate?'The private <em>entrance.</em>':registration?'Join the <em>archive.</em>':'Welcome <em>back.</em>';
    const sub=passwordGate?'A private preview of a future password-protected collection.':registration?'Make a space for pieces worth remembering.':'Your personal edit, saved for whenever you return.';
    const title=passwordGate?'Private access':registration?'Create account':'Sign in';
    return '<main class="rp-auth-shell" id="content" data-rp-parallax data-cms-section="auth-backdrop">'+
      '<div class="rp-orb" aria-hidden="true"></div><div class="rp-orb two" aria-hidden="true"></div><div class="rp-orbit" aria-hidden="true"></div>'+
      '<div class="rp-auth-intro" data-cms-section="brand-lockup"><span class="rp-eyebrow">◆ '+esc(brand.name)+' / Customer experience</span>'+
      '<h1>'+heading+'</h1><p>'+esc(sub)+'</p><div class="rp-auth-micro">Limited editions &nbsp; · &nbsp; Personal archive &nbsp; · &nbsp; Thoughtful details</div></div>'+
      '<div class="rp-glass-card" data-cms-section="auth-form"><div class="rp-card-brand"><span class="rp-logo-mark">◆</span>'+
      (brand.logo_url?'<img src="'+esc(brand.logo_url)+'" alt="'+esc(brand.name)+'">':'<strong>'+esc(brand.name)+'</strong>')+'</div>'+
      '<h2>'+title+'</h2><p>'+(passwordGate?'Early access is managed by the store owner.':registration?'Keep your favourites, orders, and preferences together.':'Sign in to revisit your saved pieces and order history.')+'</p>'+
      '<div class="rp-auth-tabs"><a href="'+href('customer/sign-in')+'" data-nav class="'+(!registration?'active':'')+'">Sign in</a>'+
      (brand.signup_enabled?'<a href="'+href('customer/sign-up')+'" data-nav class="'+(registration?'active':'')+'">Sign up</a>':'<span style="padding:10px;text-align:center">Invitations only</span>')+'</div>'+
      '<form id="rp-auth-form" data-auth="'+route+'" novalidate>'+
      (registration?'<div class="rp-field"><label for="first-name">First name</label><input id="first-name" name="first_name" autocomplete="given-name" placeholder="Your name" required maxlength="70"></div>':'')+
      '<div class="rp-field"><label for="customer-email">Email address</label><input id="customer-email" name="email" type="email" autocomplete="email" placeholder="you@example.com" required></div>'+
      '<div class="rp-field"><label for="customer-password">Password</label>'+
      '<input id="customer-password" name="password" type="password" autocomplete="'+(registration?'new-password':'current-password')+'" minlength="8" required placeholder="'+(passwordGate?'Your private access password':'At least 8 characters')+'"></div>'+
      '<p class="rp-auth-error" id="rp-auth-feedback" role="status" aria-live="polite"></p>'+
      '<button class="rp-btn full" type="submit">'+(passwordGate?'Enter the archive':registration?'Create account':'Sign in')+' <span aria-hidden="true">→</span></button>'+
      '</form>'+
      '<div class="rp-demo-note">This is an interactive local design preview. Passwords are not transmitted or stored. Live sign-in, account creation, and private access require the authenticated customer backend.</div>'+
      '<button type="button" class="rp-btn full ghost" data-action="demo-sign-in">Explore returning customer preview ↗</button>'+
      '<p class="rp-auth-quiet">'+(registration?'Already have an account? <a href="'+href('customer/sign-in')+'" data-nav>Sign in</a>':
       'Need an account? <a href="'+href('customer/sign-up')+'" data-nav>Create one</a>')+'</p></div></main>';
  }
  function accountNav(){
    const pages=[['customer/account','Overview'],['customer/orders','Orders'],['customer/saved','Saved pieces'],['customer/profile','Profile']];
    return '<nav class="rp-account-nav" aria-label="Account pages">'+pages.map(([route,label])=>'<a href="'+href(route)+'" data-nav class="'+(state.page===route?'active':'')+'">'+label+'</a>').join('')+
      '<button type="button" data-action="demo-sign-out">Exit demo session</button></nav>';
  }
  function orderRows(){
    return [
      ['#RV-1039','Archive Mini Tote','24 Aug 2026','$285.00','Delivered'],
      ['#RV-0984','The Kage Overcoat','06 Jul 2026','$640.00','Delivered'],
      ['#RV-0882','Evening Structure','12 May 2026','$520.00','Delivered']
    ].map(([id,product,date,total,status])=>'<div class="rp-row"><div><b>'+id+' · '+product+'</b><br><small>'+date+'</small></div>'+
      '<div style="text-align:right"><b>'+total+'</b><br><small>'+status+'</small></div></div>').join('');
  }
  function accountPage(){
    const sub=state.page;
    if(!demoActive)return '<main id="content" class="rp-page"><div class="rp-container"><div class="rp-empty">'+
      '<span class="rp-eyebrow">Customer area</span><h2>Your private archive</h2><p class="rp-muted">Sign in to see your purchases, saved items and preferences.</p>'+
      '<a href="'+href('customer/sign-in')+'" class="rp-btn" data-nav>Sign in or create account</a> &nbsp; <button class="rp-btn ghost" data-action="demo-sign-in">Explore demo account</button></div></div></main>';
    let body='';
    if(sub==='customer/account') {
      body='<div class="rp-overview-cards" data-cms-section="account-summary"><div class="rp-stat"><b>03</b><span>Past orders · sample</span></div>'+
        '<div class="rp-stat"><b>'+String(saved.length).padStart(2,'0')+'</b><span>Saved pieces</span></div><div class="rp-stat"><b>'+cart.reduce((sum,x)=>sum+x.quantity,0)+'</b><span>Items in bag</span></div></div>'+
        '<div class="rp-panel" data-cms-section="recent-orders"><div class="rp-row"><h2>Recent orders</h2><a href="'+href('customer/orders')+'" data-nav class="rp-row-action">View all ↗</a></div>'+orderRows()+'</div>'+
        '<div class="rp-panel" data-cms-section="recommended"><div class="rp-row"><h2>Your edit</h2><a href="'+href('collections/atelier')+'" class="rp-row-action" data-nav>Shop the collection ↗</a></div><p class="rp-muted">Discover thoughtfully selected pieces and keep your favourites for later.</p></div>';
    } else if(sub==='customer/orders'){
      body='<div class="rp-panel" data-cms-section="order-history"><h2>Order history</h2><p class="rp-muted">Preview orders only. A live store will show orders owned by the authenticated account.</p>'+orderRows()+'</div>';
    } else if(sub==='customer/saved'){
      body=saved.length?'<div class="rp-products" data-cms-section="saved-products">'+catalog.filter(p=>saved.includes(p.id)).map(productCard).join('')+'</div>':
        '<div class="rp-empty" data-cms-section="saved-products"><h2>Nothing saved. Yet.</h2><p class="rp-muted">Keep your favourites here for another day.</p><a href="'+href('collections/atelier')+'" data-nav class="rp-btn">Discover the collection ↗</a></div>';
    } else {
      body='<div class="rp-panel" data-cms-section="profile-form"><h2>Personal details</h2><p class="rp-muted">This demo does not collect or persist personal information.</p>'+
        '<div class="rp-row"><div><b>Account name</b><br><small>Alex Morgan · sample customer</small></div><button class="rp-btn ghost" disabled>Edit · requires auth</button></div>'+
        '<div class="rp-row"><div><b>Email address</b><br><small>preview@example.com</small></div><span class="rp-tag">Demo</span></div>'+
        '<div class="rp-row" data-cms-section="email-preferences"><div><b>Email preferences</b><br><small>Manage newsletter and marketing permissions</small></div><span class="rp-tag">Not connected</span></div></div>';
    }
    return '<main id="content" class="rp-page"><div class="rp-container"><span class="rp-eyebrow">◆ '+esc(brand.name)+' / Personal archive</span>'+
      '<div data-cms-section="account-header"><h1 class="rp-serif">Welcome back, <em>Alex.</em></h1><p class="rp-muted">Your orders, favourites and details in one considered space.</p></div>'+
      previewNote()+'<div class="rp-account-layout" style="margin-top:35px">'+accountNav()+'<div>'+body+'</div></div></div></main>';
  }
  function cartPage(){
    const lines=cart.map(item=>{
      const p=catalog.find(product=>product.id===item.id);
      if(!p)return '';
      return '<div class="rp-cart-row"><div class="rp-cart-thumb"></div><div><b>'+esc(p.name)+'</b><br><small class="rp-muted">'+esc(p.descriptor)+'</small>'+
        '<p class="rp-muted">'+currency(p.price)+'</p><button type="button" data-action="remove-cart" data-id="'+p.id+'" style="border:0;background:none;padding:0;color:var(--accent)">Remove</button></div>'+
        '<div class="rp-cart-control"><button type="button" data-action="decrement-cart" data-id="'+p.id+'">−</button>'+item.quantity+
        '<button type="button" data-action="increment-cart" data-id="'+p.id+'">+</button></div></div>';
    }).join('');
    const subtotal=cart.reduce((sum,item)=>sum+(catalog.find(p=>p.id===item.id)?.price||0)*item.quantity,0);
    return '<main id="content" class="rp-page"><div class="rp-container"><div class="rp-eyebrow">Resolve / Your bag</div>'+
      '<h1 class="rp-serif" data-cms-section="cart-header">Your <em>selection.</em></h1>'+previewNote()+'<div class="rp-cart-layout" style="margin-top:30px">'+
      '<section data-cms-section="cart-items">'+(cart.length?lines:'<div class="rp-empty"><h2>Your bag is waiting.</h2><p class="rp-muted">Start with a piece you will keep.</p><a class="rp-btn" href="'+href('collections')+'" data-nav>Explore collections ↗</a></div>')+'</section>'+
      '<aside class="rp-summary" data-cms-section="order-summary"><span class="rp-eyebrow">Order summary</span><div class="rp-row"><b>Subtotal</b><strong>'+currency(subtotal)+'</strong></div>'+
      '<p class="rp-muted">Shipping and taxes are calculated by the live checkout.</p>'+
      '<button type="button" class="rp-btn full" data-action="checkout-preview" '+(!cart.length?'disabled':'')+'>Continue to checkout ↗</button>'+
      '<p class="rp-muted" style="font-size:11px">No payments are processed in this preview.</p></aside></div></div></main>';
  }
  function applyEditorSections(scroll=false) {
    document.querySelectorAll('[data-cms-section]').forEach(element=>{
      const id='resolve-'+(
        {'collections':'collections','collections/atelier':'collection','password':'password',
        'customer/sign-in':'sign-in','customer/sign-up':'sign-up','customer/account':'account',
        'customer/orders':'orders','customer/saved':'saved','customer/profile':'profile','cart':'cart'}[state.page]||'collections'
      )+':'+element.dataset.cmsSection;
      const config=editorSectionSettings[id]||{};
      element.style.display=config.visible===false?'none':'';
      element.style.paddingTop=config.padding?Math.max(0,Math.min(160,Number(config.padding)))+'px':'';
      element.style.paddingBottom=config.padding?Math.max(0,Math.min(160,Number(config.padding)))+'px':'';
      element.classList.toggle('rp-editor-selected',element.dataset.cmsSection===editorSelection);
      if(scroll&&element.dataset.cmsSection===editorSelection)
        element.scrollIntoView({block:'center',behavior:'smooth'});
    });
  }
  function render(){
    state.page=getRoute();
    applyBrand();
    let body;
    if(state.page.startsWith('customer/')&&!['customer/sign-in','customer/sign-up'].includes(state.page))body=accountPage();
    else if(['customer/sign-in','customer/sign-up','password'].includes(state.page))
      body=authForm(state.page==='customer/sign-up'&&!brand.signup_enabled?'customer/sign-in':state.page);
    else if(state.page==='cart')body=cartPage();
    else if(brand.password_gate_enabled&&!demoActive)body=authForm('password');
    else body=collectionPage(state.page==='collections/atelier');
    app.innerHTML=nav()+(state.message?'<div role="status" style="padding:12px 18px;background:#fff8f0;color:#69444d;text-align:center">'+esc(state.message)+'</div>':'')+body+footer();
    if(inEditor)app.dataset.previewOnly='true';
    applyEditorSections();
    if(window.parent!==window){
      window.parent.postMessage({type:'agentsam:resolve-portal-route',route:state.page},location.origin);
      const available={header:Boolean(document.querySelector('.rp-nav')),footer:Boolean(document.querySelector('.rp-footer'))};
      document.querySelectorAll('[data-cms-section]').forEach(el=>{available[el.dataset.cmsSection]=true;});
      window.parent.postMessage({type:'agentsam:resolve-portal-detected',available},location.origin);
    }
  }
  function navigate(route,replace=false){
    if(!route.startsWith(PREFIX+'/'))return;
    if(replace)history.replaceState(null,'',route);
    else history.pushState(null,'',route);
    state.message='';mobileMenu=false;
    render();window.scrollTo({top:0,behavior:'auto'});
  }
  function addCart(id,diff){
    const found=cart.find(p=>p.id===id);
    if(found)found.quantity=Math.max(0,Math.min(20,found.quantity+diff));
    else if(diff>0)cart.push({id,quantity:1});
    cart=cart.filter(p=>p.quantity>0);
    persist();state.message=diff>0?'Added to your preview bag.':'Bag updated.';render();
  }
  function wireEvents(){
    document.addEventListener('click',event=>{
      const link=event.target.closest('a[data-nav]');
      if(link && link.href.startsWith(location.origin+PREFIX+'/')){
        event.preventDefault();navigate(link.href);return;
      }
      const filter=event.target.closest('[data-filter]');
      if(filter){activeFilter=filter.dataset.filter;render();return;}
      const button=event.target.closest('[data-action]');
      if(!button)return;
      const {action,id}=button.dataset;
      if(action==='mobile-menu'){mobileMenu=!mobileMenu;render();return;}
      if(action==='add-cart'){addCart(id,1);return;}
      if(action==='increment-cart'){addCart(id,1);return;}
      if(action==='decrement-cart'){addCart(id,-1);return;}
      if(action==='remove-cart'){cart=cart.filter(p=>p.id!==id);persist();render();return;}
      if(action==='toggle-save'){
        saved=saved.includes(id)?saved.filter(k=>k!==id):saved.concat(id);
        persist();state.message=saved.includes(id)?'Saved to your preview archive.':'Removed from saved pieces.';render();return;
      }
      if(action==='demo-sign-in'){demoActive=true;persist();navigate(href('customer/account'));return;}
      if(action==='demo-sign-out'){demoActive=false;persist();navigate(href('customer/sign-in'));return;}
      if(action==='checkout-preview'){
        state.message=!brand.show_guest_checkout&&!demoActive
          ? 'Sign in to continue. Guest checkout is disabled in this preview.'
          : 'Checkout requires a live payment integration. Your preview cart has been retained.';
        render();window.scrollTo(0,0);
      }
    });
    document.addEventListener('submit',event=>{
      if(event.target.id!=='rp-auth-form')return;
      event.preventDefault();
      const form=event.target;
      const fields=[...form.querySelectorAll('[required]')];
      const issue=fields.find(el=>!el.value.trim()||!el.checkValidity());
      const feedback=document.getElementById('rp-auth-feedback');
      if(issue){feedback.textContent='Please enter '+(issue.labels?.[0]?.textContent||'a valid value')+'.';issue.focus();return;}
      feedback.textContent='Design preview only — no password was sent or account created. Choose “Explore returning customer preview” below.';
    });
    window.addEventListener('popstate',()=>{state.message='';render();});
    document.addEventListener('pointermove',event=>{
      if(!brand.parallax_enabled||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
      const shell=event.target.closest('[data-rp-parallax]');
      if(!shell)return;
      const rect=shell.getBoundingClientRect(),scale=brand.parallax_strength;
      const px=((event.clientX-rect.left)/Math.max(rect.width,1)-0.5)*scale;
      const py=((event.clientY-rect.top)/Math.max(rect.height,1)-0.5)*scale;
      shell.querySelectorAll('.rp-orb').forEach((orb,i)=>{
        orb.style.setProperty('--px',px*(i===0?1:-.45)+'px');
        orb.style.setProperty('--py',py*(i===0?1:-.45)+'px');
      });
    },{passive:true});
    window.addEventListener('message',event=>{
      if(event.origin!==location.origin||event.source!==window.parent)return;
      const msg=event.data;
      if(msg?.type!=='agentsam:resolve-portal-config')return;
      brand=sanitizeBrand({...brand,...msg.brand});
      if(msg.sections && typeof msg.sections==='object')editorSectionSettings=msg.sections;
      if(typeof msg.selected==='string')editorSelection=msg.selected;
      localStorage.setItem(BRANDED_KEY,JSON.stringify(brand));
      if(msg.route && typeof msg.route==='string' && ['collections','collections/atelier','password','customer/sign-in','customer/sign-up','customer/account','customer/orders','customer/saved','customer/profile','cart'].includes(msg.route)){
        history.replaceState(null,'',href(msg.route));
      }
      render();
      if(msg.scroll) applyEditorSections(true);
    });
    document.addEventListener('click',event=>{
      if(!inEditor)return;
      const section=event.target.closest('[data-cms-section]');
      if(section && window.parent!==window)
        window.parent.postMessage({type:'agentsam:resolve-portal-select',key:section.dataset.cmsSection},location.origin);
    },true);
  }
  readState();wireEvents();render();
  if(window.parent!==window)window.parent.postMessage({type:'agentsam:resolve-portal-ready',route:state.page},location.origin);
})();
