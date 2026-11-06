/**
 * One authoring capability registry for stocked website templates.
 *
 * Declares supported page kinds independently from the currently installed
 * theme, site content or catalog inventory. An installed project can override
 * a stock template without suppressing any other capability. No fixture IDs.
 */
export const SYSTEM_TEMPLATE_TYPES = Object.freeze([
  {key:'home',slug:'home',title:'Home page',icon:'home',category:'home',kind:'home'},
  {key:'product',slug:'product',title:'Default product',icon:'product',category:'products',kind:'product'},
  {key:'collection',slug:'collection',title:'Default collection',icon:'collection',category:'collections',kind:'collection'},
  {key:'page',slug:'page',title:'Default page',icon:'page',category:'pages',kind:'page'},
  {key:'blog',slug:'blog',title:'Default blog',icon:'blog',category:'blogs',kind:'blog'},
  {key:'article',slug:'article',title:'Default article',icon:'post',category:'posts',kind:'article'},
  {key:'search',slug:'search',title:'Search',icon:'search',category:'search',kind:'search'},
  {key:'cart',slug:'cart',title:'Cart',icon:'cart',category:'cart',kind:'cart'},
  {key:'checkout',slug:'checkout',title:'Checkout',icon:'checkout',category:'checkout',kind:'checkout'},
  {key:'account',slug:'account',title:'Customer account',icon:'checkout',category:'customer',kind:'customer_account'},
  {key:'sign-in',slug:'sign-in',title:'Sign in',icon:'checkout',category:'customer',kind:'customer_sign_in'},
  {key:'sign-up',slug:'sign-up',title:'Sign up',icon:'checkout',category:'customer',kind:'customer_sign_up'},
  {key:'orders',slug:'orders',title:'Orders',icon:'checkout',category:'customer',kind:'customer_orders'},
  {key:'gift-card',slug:'gift-card',title:'Gift card',icon:'gift',category:'gift-card',kind:'gift_card'},
  {key:'password',slug:'password',title:'Password',icon:'lock',category:'password',kind:'password'},
  {key:'404',slug:'404',title:'404 page',icon:'page',category:'404',kind:'not_found'},
  // Additional supported platform capabilities, not a separate copy of 13.
  {key:'collection-list',slug:'collection-list',title:'Collections list',icon:'collection',category:'collections',kind:'collection_list'},
  {key:'products-list',slug:'products-list',title:'Products list',icon:'product',category:'products',kind:'product_list'},
  {key:'contact',slug:'contact',title:'Contact',icon:'page',category:'pages',kind:'contact'},
]);

export function stockTemplateTypes() {
  return SYSTEM_TEMPLATE_TYPES.filter(item=>item.key!=='products-list');
}

export function templateNavigation() {
  const category = (id,title,icon,extra={})=>({id,title,icon,...extra,
    children:SYSTEM_TEMPLATE_TYPES.filter(item=>item.category===id)
      .map(item=>({title:item.title,template:item.key,origin:'stock'}))});
  return [
    {id:'home',title:'Home page',icon:'home',template:'home'},
    category('products','Products','product',{resource:'products'}),
    category('collections','Collections','collection',{resource:'collections'}),
    {id:'gift-card',title:'Gift card',icon:'gift',template:'gift-card'},
    {id:'cart',title:'Cart',icon:'cart',template:'cart'},
    {id:'checkout',title:'Checkout',icon:'checkout',template:'checkout'},
    category('customer','Customer accounts','checkout'),
    category('pages','Pages','page',{resource:'pages'}),
    category('blogs','Blogs','blog'),
    category('posts','Blog posts','post'),
    {id:'search',title:'Search',icon:'search',template:'search'},
    {id:'password',title:'Password',icon:'lock',template:'password'},
    {id:'404',title:'404 page',icon:'page',template:'404'},
    {id:'metaobject',title:'Create metaobject template',icon:'plus',template:'metaobject',create:true},
  ];
}
