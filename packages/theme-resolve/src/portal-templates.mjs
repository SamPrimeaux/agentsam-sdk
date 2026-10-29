/**
 * Canonical, installable Resolve portal template definitions.
 * A template is a CMS page *draft specification*, not an auth/user record.
 * Product inventory and real customer/order data must be joined by the host.
 */
export const RESOLVE_PORTAL_PREFIX='/themes/resolve/demo/portal';
export const RESOLVE_PORTAL_TEMPLATES=Object.freeze([
  {slug:'resolve-collections',path:'collections',title:'Collections',template_key:'resolve/collections',
    sections:['collection-hero','collection-grid','editorial-cta']},
  {slug:'resolve-collection',path:'collections/atelier',title:'Collection detail',template_key:'resolve/collection',
    sections:['collection-hero','product-grid','filters']},
  {slug:'resolve-leather',path:'collections/leather',title:'Leather collection',template_key:'resolve/collection',
    sections:['collection-hero','product-grid','filters']},
  {slug:'resolve-knitwear',path:'collections/knitwear',title:'Knitwear collection',template_key:'resolve/collection',
    sections:['collection-hero','product-grid','filters']},
  {slug:'resolve-page',path:'pages/about',title:'Standard page',template_key:'resolve/page',
    sections:['page-hero','page-body','page-cta']},
  {slug:'resolve-products',path:'products',title:'Products',template_key:'resolve/products',
    sections:['product-hero','filters','product-grid']},
  {slug:'resolve-product',path:'products/sable-blazer',title:'Product detail',template_key:'resolve/product',
    sections:['product-gallery','product-info','product-actions','recommendations']},
  {slug:'resolve-gift-card',path:'gift-card',title:'Gift card',template_key:'resolve/gift-card',
    sections:['gift-hero','gift-options','gift-form']},
  {slug:'resolve-search',path:'search',title:'Search',template_key:'resolve/search',
    sections:['search-header','search-form','search-results']},
  {slug:'resolve-checkout',path:'checkout',title:'Checkout',template_key:'resolve/checkout',
    sections:['checkout-header','contact-form','order-summary','checkout-payment']},
  {slug:'resolve-blogs',path:'blogs',title:'Editorial & stories',template_key:'resolve/blogs',
    sections:['editorial-heading','editorial-list']},
  {slug:'resolve-article',path:'blogs/material-patina',title:'Blog article',template_key:'resolve/article',
    sections:['article-title','article-cover','article-body']},
  {slug:'resolve-404',path:'404',title:'404 page',template_key:'resolve/404',
    sections:['error-heading','error-cta']},
  {slug:'resolve-metaobject',path:'metaobject',title:'Metaobject template',template_key:'resolve/metaobject',
    sections:['metaobject-header','metaobject-fields']},
  {slug:'resolve-password',path:'password',title:'Password portal',template_key:'resolve/password',
    sections:['auth-backdrop','brand-lockup','password-form']},
  {slug:'resolve-sign-in',path:'customer/sign-in',title:'Customer sign in',template_key:'resolve/customer-sign-in',
    sections:['auth-backdrop','brand-lockup','auth-form']},
  {slug:'resolve-sign-up',path:'customer/sign-up',title:'Customer sign up',template_key:'resolve/customer-sign-up',
    sections:['auth-backdrop','brand-lockup','auth-form']},
  {slug:'resolve-account',path:'customer/account',title:'My account',template_key:'resolve/customer-account',
    sections:['account-header','account-summary','recent-orders','recommended']},
  {slug:'resolve-orders',path:'customer/orders',title:'Order history',template_key:'resolve/customer-orders',
    sections:['account-header','order-history']},
  {slug:'resolve-saved',path:'customer/saved',title:'Saved items',template_key:'resolve/customer-saved',
    sections:['account-header','saved-products']},
  {slug:'resolve-profile',path:'customer/profile',title:'Profile & preferences',template_key:'resolve/customer-profile',
    sections:['account-header','profile-form','email-preferences']},
  {slug:'resolve-cart',path:'cart',title:'Your cart',template_key:'resolve/cart',
    sections:['cart-header','cart-items','order-summary']},
]);

export const RESOLVE_PORTAL_BRAND=Object.freeze({
  name:'RESOLVE',
  tagline:'Objects of lasting desire.',
  logo_url:'',
  accent:'#8b181b',
  backdrop_from:'#0b0b0b',
  backdrop_mid:'#231418',
  backdrop_to:'#493036',
  glass_opacity:0.1,
  parallax_enabled:true,
  parallax_strength:18,
  show_guest_checkout:true,
  signup_enabled:true,
  password_gate_enabled:false
});
export function portalTemplateForSlug(slug){
  return RESOLVE_PORTAL_TEMPLATES.find(item=>item.slug===slug)||null;
}
export function portalTemplateForPath(path){
  return RESOLVE_PORTAL_TEMPLATES.find(item=>item.path===path)||null;
}
export function portalHref(path='collections'){
  return RESOLVE_PORTAL_PREFIX+'/'+String(path).replace(/^\/+|\/+$/g,'');
}
/** One stable section key per page, with draft-only install metadata. */
export function portalCmsPage(template){
  if(!template) return null;
  return {
    id:'preview-'+template.slug,
    slug:template.slug,
    title:template.title,
    page_type:'standard',
    status:'draft',
    template_key:template.template_key,
    metadata_json:JSON.stringify({theme:'resolve',preview_only:true,path:template.path}),
    content_authority:'cms-draft',
    sections:template.sections.map((key,index)=>({
      id:'preview-'+template.slug+'-'+key,
      key,section_key:key,section_type:key,sort_order:index,status:'draft',
      content:{heading:template.title,__editor:{visibility:{enabled:true},templateKey:key}}
    }))
  };
}
