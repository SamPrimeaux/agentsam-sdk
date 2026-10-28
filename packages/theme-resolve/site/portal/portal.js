/* Resolve Customer Portal — reusable preview templates shipped in Resolve.
 * This UI intentionally never authenticates, submits credentials, collects payment,
 * or reads real customer data. Host platform owns those operations.
 */
(() => {
  'use strict';
  const PREFIX = new URL(document.baseURI).pathname.replace(/\/+$/, '');
  const BRANDED_KEY = 'resolve.portal.preview.brand.v1';
  const DEMO_KEY = 'resolve.portal.preview.session.v1';
  // Shared read-only demo catalog extracted from Resolve's original React bundle.
  const catalog = Array.isArray(window.ResolveOriginalCatalog)
    ? window.ResolveOriginalCatalog : [];
  const defaults = {
    name:'RESOLVE', tagline:'Objects of lasting desire.',logo_url:'',
    accent:'#8b181b',backdrop_from:'#0b0b0b',backdrop_mid:'#231418',backdrop_to:'#493036',
    glass_opacity:0.1,parallax_enabled:true,parallax_strength:18,
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
  let activeFilter = 'ALL';
  let editorSectionSettings = {};
  let editorPageSlug = null;
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
    const allowed=['collections','collections/atelier','collections/leather','collections/knitwear','pages/about','products','products/sable-blazer','gift-card','search','checkout','blogs','blogs/material-patina','404','metaobject','customer/sign-in','customer/sign-up','customer/account','customer/orders','customer/saved','customer/profile','cart','password'];
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
    return '<header class="rp-nav" data-cms-section="header"><div class="rp-nav-shell"><div class="rp-nav-inner">'+
      '<button class="rp-icon rp-mobile-menu" type="button" data-action="mobile-menu" aria-expanded="'+mobileMenu+'" aria-label="Open menu">☰</button>'+
      '<nav class="rp-nav-links" aria-label="Shop"><a href="'+href('collections')+'" data-nav>Shop</a>'+
      '<a href="'+href('collections/atelier')+'" data-nav>Wardrobe</a><a href="'+href('collections/atelier')+'" data-nav>Bundles</a>'+
      '<a href="'+esc(new URL('../',document.baseURI).pathname)+'#editorial" aria-label="Original Resolve editorial">Editorial</a></nav>'+
      '<a href="'+esc(new URL('../',document.baseURI).pathname)+'" class="rp-logo" aria-label="'+esc(brand.name)+' home">'+brandLockup()+'</a>'+
      '<div class="rp-nav-actions"><a class="rp-currency" href="#" aria-label="Currency in USD">◎ USD ($)</a>'+
      '<a class="rp-search-link" href="'+href('search')+'" data-nav aria-label="Search">⌕</a>'+
      '<a class="rp-account-link" href="'+account+'" data-nav>Account</a>'+
      '<a class="rp-bag" href="'+href('cart')+'" data-nav aria-label="Shopping bag">▣ BAG ('+cart.reduce((s,i)=>s+i.quantity,0)+')</a>'+
      '</div></div></div>'+
      '<nav class="rp-mobile-links'+(mobileMenu?' open':'')+'" aria-label="Mobile shop">'+
      '<a href="'+href('collections')+'" data-nav>Shop</a><a href="'+href('collections/atelier')+'" data-nav>Wardrobe</a>'+
      '<a href="'+href('customer/saved')+'" data-nav>Saved pieces</a><a href="'+account+'" data-nav>My account</a>'+
      '<a href="'+href('password')+'" data-nav>Private access</a></nav></header>';
  }
  function footer(){
    return '<footer class="rp-footer" data-cms-section="footer"><div class="rp-footer-grid">'+
      '<div class="rp-footer-brand"><span class="rp-eyebrow">A WORLD OF ITS OWN</span>'+
      '<div class="rp-footer-wordmark">'+esc(brand.name)+'</div><p>'+esc(brand.tagline)+'</p>'+
      '<small>FLORENCE · LONDON · PARIS · NEW YORK</small></div>'+
      '<div><h4>COLLECTIONS</h4><a href="'+href('collections')+'" data-nav>Autumn / Winter 26</a>'+
      '<a href="'+href('collections/atelier')+'" data-nav>The Atelier</a><a href="'+href('customer/saved')+'" data-nav>Wishlist</a></div>'+
      '<div><h4>CLIENT SERVICES</h4><a href="'+href('customer/account')+'" data-nav>Your Account</a>'+
      '<a href="'+href('customer/orders')+'" data-nav>Orders</a><a href="'+href('cart')+'" data-nav>Shopping Bag</a></div>'+
      '<div><h4>THE HOUSE</h4><a href="'+esc(new URL('../',document.baseURI).pathname)+'#editorial">Editorial</a>'+
      '<a href="'+href('password')+'" data-nav>Private Access</a><small>Interactive local preview · Not connected to customers or payments</small></div>'+
      '</div><div class="rp-footer-bottom"><span>© 2026 '+esc(brand.name)+' — MADE TO ENDURE</span>'+
      '<span>DESIGNED WITH INTENTION · BUILT FOR MEMORY</span></div></footer>';
  }
  function previewNote(){return '<span class="rp-preview-badge">LOCAL EDITORIAL DEMO · SAMPLE CONTENT</span>';}
  function mediaFor(id){
    const product=catalog.find(p=>p.id===id);
    // Only asset filenames shipped with the canonical Resolve theme are allowed.
    const filename=product?.image && /^media-[a-f0-9]+\.webp$/.test(product.image)
      ? product.image : 'media-216610d365.webp';
    return new URL('../assets/generated/'+filename,document.baseURI).pathname;
  }
  function productCard(p){
    const inSaved=saved.includes(p.id);
    return '<article class="rp-product"><div class="rp-product-art"><img src="'+esc(mediaFor(p.id))+'" alt="Resolve editorial preview for '+esc(p.name)+'" loading="lazy">'+
      '<div class="rp-canvas-badge">'+esc(p.category)+'</div></div><div class="rp-product-info">'+
      '<h3>'+(p.id==='sable-blazer'?'<a href="'+href('products/sable-blazer')+'" data-nav>'+esc(p.name)+' ↗</a>':esc(p.name))+'</h3><p>'+esc(p.description.slice(0,88)+(p.description.length>88?'…':''))+' &nbsp; · &nbsp; '+currency(p.price)+'</p>'+
      '<div class="rp-product-actions"><button data-action="add-cart" data-id="'+p.id+'" aria-label="Add '+esc(p.name)+' to bag">Add to bag +</button>'+
      '<button data-action="toggle-save" data-id="'+p.id+'" aria-label="'+(inSaved?'Remove':'Save')+' '+esc(p.name)+'">'+(inSaved?'♥':'♡')+'</button></div></div></article>';
  }
  function collectionPage(detail=false) {
    const collectionLinks=[
      {title:'THE ATELIER',caption:'Tailoring · Outerwear',target:'collections/atelier',tag:'01 / Signature'},
      {title:'LEATHER STUDIES',caption:'Leather & construction',target:'collections/leather',tag:'02 / Editions'},
      {title:'KNITWEAR EDIT',caption:'Merino & layering',target:'collections/knitwear',tag:'03 / Private'}
    ];
    return '<main class="rp-page" id="content"><div class="rp-container">'+
      '<div class="rp-eyebrow">◆ THE RESOLVE ARCHIVE / COLLECTIONS</div>'+
      '<div class="rp-shop-intro" data-cms-section="collection-hero"><h1 class="rp-serif rp-collection-title">'+(detail?(state.page.endsWith('/leather')?'LEATHER STUDIES':state.page.endsWith('/knitwear')?'THE KNITWEAR EDIT':'THE ATELIER'):'THE COLLECTIONS')+'</h1>'+
      '<div><p class="rp-muted">Considered forms, uncompromising materials, and pieces intended to grow with you.</p>'+previewNote()+'</div></div>'+
      (detail?'<div class="rp-row"><strong>Curated collection · 6 pieces</strong><span class="rp-muted">Edition 01 · All pieces</span></div>'+
        '<div class="rp-filters" data-cms-section="filters" aria-label="Filter pieces">'+
        ['ALL','OUTERWEAR','TOPS','BOTTOMS','DRESSES','LEATHER','FOOTWEAR'].map(filter=>'<button type="button" data-filter="'+filter+'" class="'+(filter===activeFilter?'active':'')+'">'+filter+'</button>').join('')+
        '</div><div class="rp-products" data-cms-section="product-grid" style="margin:30px 0">'+
        catalog.filter(p=>activeFilter==='ALL'||p.category===activeFilter).map(productCard).join('')+'</div>':
      '<div class="rp-collections" data-cms-section="collection-grid">'+collectionLinks.map(c=>
        '<a class="rp-collection-card" href="'+href(c.target)+'" data-nav><div class="rp-collection-visual"><img src="'+esc(mediaFor(['sable-blazer','leather-tee','merino-turtleneck'][collectionLinks.indexOf(c)]))+'" alt="Resolve archival fashion editorial" loading="lazy"><div class="rp-canvas-badge">'+esc(c.tag)+'</div></div>'+
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
      ['#RV-1039','LEATHER TEE','24 Aug 2026','$325.00','Delivered'],
      ['#RV-0984','SABLE BLAZER','06 Jul 2026','$480.00','Delivered'],
      ['#RV-0882','MATRIX MINI DRESS','12 May 2026','$185.00','Delivered']
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
  function utilityPage(route){
    const intro=(kicker,title,description)=>
      '<div class="rp-eyebrow">'+esc(kicker)+'</div><div class="rp-shop-intro" data-cms-section="'+
      (route==='products'?'product-hero':route==='gift-card'?'gift-hero':route==='checkout'?'checkout-header':
       route==='search'?'search-header':route==='blogs'?'editorial-heading':route==='blogs/material-patina'?'article-title':
       route==='404'?'error-heading':'metaobject-header')+'"><h1 class="rp-serif">'+esc(title)+'</h1>'+
      '<p class="rp-muted">'+esc(description)+'</p></div>';
    let content='';
    if(route==='products'){
      content=intro('THE RESOLVE WARDROBE','ALL PIECES','The archive, considered in detail.')+
        '<div class="rp-filters" data-cms-section="filters">'+['ALL','OUTERWEAR','TOPS','BOTTOMS','DRESSES','LEATHER','FOOTWEAR'].map(filter=>
          '<button type="button" data-filter="'+filter+'" class="'+(filter===activeFilter?'active':'')+'">'+filter+'</button>').join('')+'</div>'+
        '<div class="rp-products" data-cms-section="product-grid" style="margin-top:35px">'+
        catalog.filter(p=>activeFilter==='ALL'||p.category===activeFilter).map(productCard).join('')+'</div>';
    }else if(route==='products/sable-blazer'){
      const p=catalog.find(item=>item.id==='sable-blazer')||catalog[0];
      content='<div class="rp-pdp" data-cms-section="product-gallery"><img src="'+esc(mediaFor(p.id))+
        '" alt="Resolve original editorial image"><div data-cms-section="product-info">'+
        '<span class="rp-eyebrow">AUTUMN / WINTER 26 · SIGNATURE PIECE</span>'+
        '<h1 class="rp-serif">'+esc(p.name)+'</h1><p class="rp-muted">'+esc(p.description.slice(0,88)+(p.description.length>88?'…':''))+'</p>'+
        '<p class="rp-pdp-price">'+currency(p.price)+'</p><p class="rp-muted">An archival piece from the original Resolve preview catalog.</p>'+
        '<div data-cms-section="product-actions"><button type="button" class="rp-btn" data-action="add-cart" data-id="'+p.id+'">Add to bag ↗</button>'+
        '<button type="button" class="rp-btn ghost" data-action="toggle-save" data-id="'+p.id+'">Save to archive ♡</button></div></div></div>'+
        '<div data-cms-section="recommendations"><h2 class="rp-subheading">EXPLORE THE EDIT</h2><div class="rp-products">'+catalog.slice(1,4).map(productCard).join('')+'</div></div>';
    }else if(route==='gift-card'){
      content=intro('AN OFFERING OF CHOICE','THE GIFT CARD','An invitation to discover something truly lasting.')+
        '<div class="rp-utility-grid"><div class="rp-editorial-photo"><img src="'+esc(mediaFor('leather-tee'))+'" alt="Resolve leather accessories editorial"></div>'+
        '<div class="rp-panel" data-cms-section="gift-options"><h2>AN INVITATION TO CHOOSE.</h2><p class="rp-muted">Gift card values and fulfillment will connect to the store product catalog.</p>'+
        '<div class="rp-filters">'+[50,100,250,500].map(n=>'<button type="button" data-gift="'+n+'">$'+n+'</button>').join('')+'</div>'+
        '<div data-cms-section="gift-form"><button type="button" class="rp-btn full" data-action="preview-only">Add gift card · Preview</button></div></div></div>';
    }else if(route==='search'){
      content=intro('THE RESOLVE ARCHIVE','SEARCH THE COLLECTION','Find your next enduring piece.')+
        '<form class="rp-search-form" data-cms-section="search-form"><label for="rp-search-query">Search by name, category or material</label>'+
        '<input id="rp-search-query" name="search" placeholder="Search the archive..." autocomplete="off" value="'+esc(state.search||'')+'">'+
        '<button class="rp-btn" type="submit">Search ↗</button></form>'+
        '<div class="rp-products" data-cms-section="search-results">'+
        catalog.filter(p=>(p.name+' '+p.category+' '+p.descriptor).toLowerCase().includes((state.search||'').toLowerCase())).map(productCard).join('')+'</div>';
    }else if(route==='checkout'){
      content=intro('THE RESOLVE PRIVATE CHECKOUT','YOUR ORDER','Review your details and selected pieces before payment.')+
        '<div class="rp-cart-layout"><div class="rp-panel" data-cms-section="contact-form"><h2>CONTACT & DELIVERY</h2>'+
        '<p class="rp-muted">Customer details and secure checkout are intentionally not collected in local preview.</p>'+
        '<label class="rp-disabled-field">Email <input disabled value="" placeholder="Enabled when customer accounts are connected"></label>'+
        '<label class="rp-disabled-field">Shipping address <input disabled placeholder="Available after checkout integration"></label>'+
        '<div class="rp-panel" data-cms-section="checkout-payment"><h2>PAYMENT</h2><p>Stripe payment element is not active in this preview.</p></div></div>'+
        '<aside class="rp-summary" data-cms-section="order-summary"><h2>ORDER SUMMARY</h2><p class="rp-muted">Cart items: '+cart.reduce((n,i)=>n+i.quantity,0)+
        '</p><strong>'+currency(cart.reduce((n,i)=>n+(catalog.find(p=>p.id===i.id)?.price||0)*i.quantity,0))+
        '</strong><button class="rp-btn full" type="button" data-action="preview-only">Payment unavailable · Preview</button></aside></div>';
    }else if(route==='pages/about'){
      content=intro('THE RESOLVE ATELIER','A WORLD OF ITS OWN','An editorial page template for stories, services and brand information.')+
        '<div class="rp-utility-grid"><div class="rp-editorial-photo" data-cms-section="page-hero"><img src="'+esc(mediaFor('leather-tee'))+'" alt="Resolve editorial feature"></div>'+
        '<div class="rp-panel" data-cms-section="page-body"><span class="rp-eyebrow">CONSIDERED DETAILS</span><h2>MADE TO ENDURE.</h2>'+
        '<p class="rp-muted">Every piece begins with a question of form, movement and memory. This local page template can be renamed, extended and edited from the CMS.</p>'+
        '<div data-cms-section="page-cta"><a href="'+href('collections')+'" data-nav class="rp-btn">EXPLORE THE ARCHIVE</a></div></div></div>';
    }else if(route==='blogs'){
      content=intro('THE DISPATCH · RESOLVE ATELIER','THE EDITORIAL ARCHIVE','Ideas, materials and conversations that outlive seasons.')+
        '<div class="rp-utility-grid" data-cms-section="editorial-list"><a href="'+href('blogs/material-patina')+'" data-nav class="rp-editorial-photo">'+
        '<img src="'+esc(mediaFor('matrix-mini-dress'))+'" alt="Resolve editorial preview"><strong>THE ART OF MATERIAL PATINA ↗</strong></a>'+
        '<div class="rp-panel"><span class="rp-eyebrow">AUGUST 29, 2026 · 5 MIN READ</span><h2>THE ART OF MATERIAL PATINA</h2>'+
        '<p class="rp-muted">Why we choose untreated, full-grain skins that remember every fold, crease, and midnight drive of their wearer.</p>'+
        '<a href="'+href('blogs/material-patina')+'" data-nav class="rp-btn">READ ESSAY ↗</a></div></div>';
    }else if(route==='blogs/material-patina'){
      content=intro('THE DISPATCH · 5 MIN READ','THE ART OF MATERIAL PATINA','August 29, 2026 · Editorial')+
        '<div class="rp-editorial-photo rp-article-cover" data-cms-section="article-cover"><img src="'+esc(mediaFor('sharp-leather-trench'))+'" alt="Resolve editorial feature"></div>'+
        '<div class="rp-article-body" data-cms-section="article-body"><p>Some things become more personal the longer you live with them.</p>'+
        '<p>This is a local editorial excerpt, not a replacement for the full Resolve article. Manage the published story through the CMS article editor.</p>'+
        '<a href="'+href('blogs')+'" data-nav class="rp-btn ghost">← BACK TO THE DISPATCH</a></div>';
    }else if(route==='404'){
      content=intro('NO SUCH PLACE','PAGE NOT FOUND','The destination you requested does not exist in this archive.')+
        '<div data-cms-section="error-cta"><a href="'+href('collections')+'" data-nav class="rp-btn">RETURN TO THE ARCHIVE ↗</a></div>';
    }else{
      content=intro('CMS STRUCTURED CONTENT','METAOBJECT TEMPLATE','A reusable content type with editable fields and storefront presentation.')+
        '<div class="rp-panel" data-cms-section="metaobject-fields"><h2>STRUCTURED CONTENT</h2>'+
        '<p class="rp-muted">Define title, image, related collection, rich text and published state. This is a local template representation; field schema and database bindings still require a tenant-authorized adapter.</p>'+
        '<span class="rp-tag">CMS DRAFT · PREVIEW ONLY</span></div>';
    }
    return '<main id="content" class="rp-page"><div class="rp-container">'+content+'</div></main>';
  }

  function cartPage(){
    const lines=cart.map(item=>{
      const p=catalog.find(product=>product.id===item.id);
      if(!p)return '';
      return '<div class="rp-cart-row"><div class="rp-cart-thumb"></div><div><b>'+esc(p.name)+'</b><br><small class="rp-muted">'+esc(p.description.slice(0,88)+(p.description.length>88?'…':''))+'</small>'+
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
    const routeSlug={'collections':'collections','collections/atelier':'collection','collections/leather':'leather','collections/knitwear':'knitwear',
        'products':'products','products/sable-blazer':'product',
        'gift-card':'gift-card','search':'search','checkout':'checkout','pages/about':'page',
        'blogs':'blogs','blogs/material-patina':'article','404':'404','metaobject':'metaobject',
        'password':'password','customer/sign-in':'sign-in','customer/sign-up':'sign-up',
        'customer/account':'account','customer/orders':'orders','customer/saved':'saved',
        'customer/profile':'profile','cart':'cart'}[state.page]||'collections';
    const namespace=editorPageSlug?.startsWith('resolve-draft-')?editorPageSlug:'resolve-'+routeSlug;
    const container=document.querySelector('main .rp-container')||document.querySelector('main');
    if(container){
      container.querySelectorAll('[data-rp-added-section]').forEach(el=>el.remove());
      const extras=editorSectionSettings[namespace+':_extra'];
      if(Array.isArray(extras)) extras.slice(0,20).forEach(section=>{
        if(!/^custom-[a-z-]+-[a-z0-9]+$/.test(section.key))return;
        const conf=editorSectionSettings[namespace+':'+section.key]||{};
        const div=document.createElement('section');
        div.className='rp-added-section rp-panel';
        div.dataset.rpAddedSection='true';
        div.dataset.cmsSection=section.key;
        const heading=document.createElement('h2');
        heading.textContent=conf.heading||section.label;
        const description=document.createElement('p');
        description.className='rp-muted';
        description.textContent=conf.description||'A curated section from the Resolve archive.';
        div.append(heading,description);
        if(section.type==='media-feature'||section.type==='collection-strip'){
          const img=document.createElement('img');
          img.src=new URL('../assets/generated/media-a70660bfa9.webp',document.baseURI).pathname;
          img.alt='Resolve archival editorial';
          img.loading='lazy';div.append(img);
        }
        if(section.type==='newsletter-callout'){
          const label=document.createElement('label');label.textContent='Email address (preview only)';
          const inp=document.createElement('input');inp.type='email';inp.disabled=true;inp.placeholder='Newsletter integration required';
          label.append(inp);div.append(label);
        }
        const button=document.createElement('span');button.className='rp-btn';button.textContent=conf.button_label||'EXPLORE THE EDIT';
        div.append(button);container.append(div);
      });
    }
    document.querySelectorAll('[data-cms-section]').forEach(element=>{
      const id=namespace+':'+element.dataset.cmsSection;
      const config=editorSectionSettings[id]||{};
      element.style.display=config.visible===false?'none':'';
      element.style.paddingTop=config.padding?Math.max(0,Math.min(160,Number(config.padding)))+'px':'';
      element.style.paddingBottom=config.padding?Math.max(0,Math.min(160,Number(config.padding)))+'px':'';
      if(!element.hasAttribute('data-rp-added-section')){
        if(config.heading){
          const heading=element.matches('h1,h2,h3')?element:element.querySelector('h1,h2,h3');
          if(heading)heading.textContent=config.heading;
        }
        if(config.description){
          const description=element.querySelector('p.rp-muted,p');
          if(description)description.textContent=config.description;
        }
        if(config.button_label){
          const button=element.querySelector('.rp-btn');
          if(button)button.textContent=config.button_label;
        }
      }
      if(config.media && /^media-[a-f0-9]+\.webp$/.test(config.media)){
        const image=element.querySelector('img');
        if(image)image.src=new URL('../assets/generated/'+config.media,document.baseURI).pathname;
      }
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
    else if(['products','products/sable-blazer','gift-card','search','checkout','blogs','blogs/material-patina','404','metaobject','pages/about'].includes(state.page))body=utilityPage(state.page);
    else if(brand.password_gate_enabled&&!demoActive)body=authForm('password');
    else body=collectionPage(state.page.startsWith('collections/'));
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
    if(route.endsWith('/collections/atelier'))activeFilter='OUTERWEAR';
    else if(route.endsWith('/collections/leather'))activeFilter='LEATHER';
    else if(route.endsWith('/collections/knitwear'))activeFilter='TOPS';
    else if(route.endsWith('/products'))activeFilter='ALL';
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
      if(action==='preview-only'){
        state.message='This interface is ready for design review. Live payment, product or form records are not connected.';
        render();window.scrollTo(0,0);return;
      }
      if(action==='checkout-preview'){
        if(!brand.show_guest_checkout&&!demoActive){
          navigate(href('customer/sign-in'));
          state.message='Sign in is required by the current preview settings. Real authentication is not connected.';
        }else{
          navigate(href('checkout'));
          state.message='Checkout design preview only — payment is disabled and your sample bag is preserved.';
        }
        render();window.scrollTo(0,0);
      }
    });
    document.addEventListener('submit',event=>{
      if(event.target.classList.contains('rp-search-form')){
        event.preventDefault();
        state.search=(new FormData(event.target).get('search')||'').toString().slice(0,100);
        render();return;
      }
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
      window.ResolveThemeSettingsPreview?.apply(msg.themeSettings||{});
      editorPageSlug=typeof msg.pageSlug==='string' && /^resolve-draft-[a-z0-9-]+$/.test(msg.pageSlug)
        ? msg.pageSlug : null;
      if(typeof msg.selected==='string')editorSelection=msg.selected;
      localStorage.setItem(BRANDED_KEY,JSON.stringify(brand));
      if(msg.route && typeof msg.route==='string' && ['collections','collections/atelier','collections/leather','collections/knitwear','pages/about','products','products/sable-blazer','gift-card','search','checkout','blogs','blogs/material-patina','404','metaobject','pages/about','password','customer/sign-in','customer/sign-up','customer/account','customer/orders','customer/saved','customer/profile','cart'].includes(msg.route)){
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
  readState();
  if(state.page==='collections')activeFilter='ALL';
  if(getRoute()==='collections/atelier')activeFilter='OUTERWEAR';
  if(getRoute()==='collections/leather')activeFilter='LEATHER';
  if(getRoute()==='collections/knitwear')activeFilter='TOPS';
  wireEvents();render();
  if(window.parent!==window)window.parent.postMessage({type:'agentsam:resolve-portal-ready',route:state.page},location.origin);
})();
