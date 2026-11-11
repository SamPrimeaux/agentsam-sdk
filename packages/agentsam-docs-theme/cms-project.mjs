/**
 * Reusable, CMS-native documentation/cookbook project builder.
 *
 * This is the existing agentsam.theme-project.v1 contract: pages, reusable
 * sections, repeatable blocks, site-wide menus, design tokens and draft edits.
 * Nothing here owns a new database, renderer, account or publish endpoint.
 */
const ID=/^[a-z][a-z0-9_-]{1,80}$/;
const ROUTE=/^\/(?:[a-z0-9-]+\/)*$/;
const escape=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;')
  .replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#39;");
const field=(key,label,type='text',binding)=>({key,label,type,...(binding?{binding}:{})});
function assertRoute(path){if(!ROUTE.test(path))throw Error('documentation_route_invalid:'+path);return path;}
function assertId(value){if(!ID.test(value))throw Error('documentation_id_invalid:'+value);return value;}
const textField=(key,label)=>field(key,label,'textarea');
function section(key,name,kind,markup,fields,content,blocks=[],zone='BODY',globalKey=null) {
  return {key,name,type:kind,sourceKind:kind,zone,...(globalKey?{globalKey}:{}),
    status:'draft',version:0,sort_order:0,html:markup,
    content:{...content,__editor:{templateKey:key,visibility:{enabled:true},blocks:[]}},
    schema:{key,label:name,sourceKind:kind,zone,fields,settings:[],blocks,
      capabilities:{duplicate:!globalKey,reorder:!globalKey,reusable:true}}};
}
const linkBlock={
  key:'nav_link',label:'Navigation link',fields:[
    field('label','Label'),field('href','Page URL','link',{field:'label',attribute:'href'})
  ],settings:[],html:'<a class="iam-doc-link" data-theme-project-field="label" href="/"></a>',
  defaults:{label:'New page',href:'/'},
  capabilities:{duplicate:true,reorder:true,reusable:true}
};
const groupBlock={
  key:'nav_group',label:'Navigation group',fields:[field('label','Group name')],
  settings:[],html:'<span class="iam-doc-group" data-theme-project-field="label"></span>',
  defaults:{label:'Documentation'},
  capabilities:{duplicate:true,reorder:true,reusable:true}
};
function siteHeader(name,pages,homeRoute) {
  const chrome=section('site_header','Documentation header and navigation','documentation-navigation',
    '<div class="iam-doc-global"><header class="iam-doc-header"><a class="iam-doc-brand" data-theme-project-field="brand" href="/"></a>'+
    '<button class="iam-doc-menu" type="button" data-doc-menu aria-controls="iam-doc-sidebar" aria-expanded="false">Menu</button></header>'+
    '<aside class="iam-doc-sidebar" id="iam-doc-sidebar"><label class="iam-doc-search-label">Filter pages'+
    '<input type="search" data-doc-filter placeholder="Find a page"></label>'+
    '<nav aria-label="Documentation pages"><!--theme-block:nav-entries--></nav></aside>'+
    '<aside class="iam-doc-toc"><strong>On this page</strong><nav aria-label="On this page" data-doc-toc></nav></aside></div>',
    [field('brand','Site label'),field('brand_href','Home URL','link',{field:'brand',attribute:'href'})],
    {brand:name,brand_href:homeRoute},[groupBlock,linkBlock],'HEADER','site-header');
  let group='';
  let i=0;
  for(const page of pages){
    if(group!==page.category){
      group=page.category;
      const id='nav_group_'+(++i);
      chrome.content[id]={label:group};
      chrome.content.__editor.blocks.push({id,templateKey:'nav_group'});
    }
    const id='nav_link_'+(++i);
    chrome.content[id]={label:page.navTitle||page.title,href:page.route};
    chrome.content.__editor.blocks.push({id,templateKey:'nav_link'});
  }
  return chrome;
}
function siteFooter(name){
  return section('site_footer','Documentation footer','documentation-footer',
    '<footer class="iam-doc-footer"><span data-theme-project-field="copyright"></span>'+
    '<a data-theme-project-field="footer_label" href="/"></a></footer>',
    [field('copyright','Footer text'),field('footer_label','Footer link label'),
      field('footer_href','Footer URL','link',{field:'footer_label',attribute:'href'})],
    {copyright:name+' · Developer documentation',footer_label:'Overview',footer_href:'/'},
    [],'FOOTER','site-footer');
}
function intro(page){
  return section('document_intro','Article introduction','documentation-introduction',
    '<section class="iam-doc-intro"><p class="iam-doc-eyebrow" data-theme-project-field="category"></p>'+
    '<h1 data-theme-project-field="title"></h1>'+
    '<p class="iam-doc-summary" data-theme-project-field="summary"></p>'+
    '<p class="iam-doc-meta" data-theme-project-field="metadata"></p></section>',
    [field('category','Category'),field('title','Title'),
     textField('summary','Summary'),field('metadata','Version or status')],
    {category:page.category,title:page.title,summary:page.summary,metadata:page.metadata||''});
}
function paragraph(item,key){
  return section(key,'Article section: '+item.heading,'documentation-prose',
    '<section class="iam-doc-body-section"><h2 data-doc-heading data-theme-project-field="heading"></h2>'+
    '<p data-theme-project-field="body"></p></section>',
    [field('heading','Section heading'),textField('body','Body text')],
    {heading:item.heading,body:item.body||''});
}
function code(item,key){
  return section(key,'Code: '+(item.label||'Example'),'documentation-code',
    '<section class="iam-doc-code-section"><div class="iam-doc-code-top">'+
    '<span data-theme-project-field="label"></span><button type="button" data-doc-copy>Copy</button></div>'+
    '<pre><code data-theme-project-field="code"></code></pre></section>',
    [field('label','Code example label'),textField('code','Source code')],
    {label:item.label||'Example',code:item.code});
}
function callout(item,key){
  return section(key,item.title||'Expected result','documentation-callout',
    '<section class="iam-doc-callout"><h2 data-doc-heading data-theme-project-field="heading"></h2>'+
    '<p data-theme-project-field="body"></p></section>',
    [field('heading','Heading'),textField('body','Explanation')],
    {heading:item.title||'Expected result',body:item.body});
}
const cardBlock={
  key:'resource_link',label:'Resource link',fields:[
    field('title','Title'),textField('summary','Summary'),
    field('href','Page URL','link',{attribute:'href'})
  ],settings:[],html:'<a class="iam-doc-card" data-theme-project-field="href" href="/">'+
    '<strong data-theme-project-field="title"></strong>'+
    '<span class="iam-doc-card-summary" data-theme-project-field="summary"></span></a>',
  defaults:{title:'New resource',summary:'',href:'/'},
  capabilities:{duplicate:true,reorder:true,reusable:true}
};
function collection(item,key,pages){
  const sectionData=section(key,item.heading||'Explore the documentation','documentation-collection',
    '<section class="iam-doc-collection"><h2 data-doc-heading data-theme-project-field="heading"></h2>'+
    '<p data-theme-project-field="description"></p>'+
    '<div class="iam-doc-cards"><!--theme-block:resources--></div></section>',
    [field('heading','Heading'),textField('description','Description')],
    {heading:item.heading||'Explore',description:item.description||''},
    [cardBlock]);
  for(let i=0;i<(item.resources||[]).length;i++){
    const destination=pages.find(p=>p.slug===item.resources[i]);
    if(!destination)throw Error('documentation_link_target_missing:'+item.resources[i]);
    const id='resource_'+(i+1);
    sectionData.content[id]={title:destination.title,summary:destination.summary,href:destination.route};
    sectionData.content.__editor.blocks.push({id,templateKey:'resource_link'});
  }
  return sectionData;
}
function pageTemplate(page,styleUrls,runtimeUrl,body){
  const headLinks=styleUrls.map(url=>'<link rel="stylesheet" href="'+escape(url)+'">').join('');
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">'+
    '<meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<title>'+escape(page.title)+'</title><meta name="description" content="'+escape(page.summary)+'">'+
    headLinks+'</head><body class="iam-doc-portal">'+
    '<div class="iam-doc-grid"><!--theme-section:site_header-->'+
    '<main class="iam-doc-content" id="main-content">'+body.map(s=>'<!--theme-section:'+s.key+'-->').join('')+'</main>'+
    '<!--theme-section:site_footer--></div>'+
    '<script defer src="'+escape(runtimeUrl)+'"></script></body></html>';
}
export function createDocumentationProject({
  id,name,siteName,pages,stylesheets,runtimeUrl,
  tokens={},version='0.1.0'
}){
  assertId(id);if(!name||!siteName||!Array.isArray(pages)||!pages.length)throw Error('documentation_project_invalid');
  if(!Array.isArray(stylesheets)||!stylesheets.length||!runtimeUrl)throw Error('documentation_assets_required');
  for(const url of [...stylesheets,runtimeUrl]){
    if(typeof url!=='string'||!/^\/[a-z0-9/_\-.]+$/i.test(url)||url.includes('..')||url.includes('//'))
      throw Error('documentation_asset_path_invalid');
  }
  const seen=new Set(),routes=new Set();
  for(const page of pages){
    assertId(page.slug);assertRoute(page.route);
    if(seen.has(page.slug)||routes.has(page.route))throw Error('documentation_page_identity_duplicate');
    if(!page.title||!page.category||typeof page.summary!=='string'||!Array.isArray(page.content))
      throw Error('documentation_content_invalid');
    seen.add(page.slug);routes.add(page.route);
  }
  const globalHeader=siteHeader(siteName,pages,pages[0].route);
  const globalFooter=siteFooter(siteName);
  const projectPages=pages.map(page=>{
    const body=[intro(page)];
    let count=0;
    for(const item of page.content){
      const key='doc_'+(++count);
      if(item.type==='prose'&&item.heading)body.push(paragraph(item,key));
      else if(item.type==='code'&&typeof item.code==='string')body.push(code(item,key));
      else if(item.type==='callout'&&item.body)body.push(callout(item,key));
      else if(item.type==='collection')body.push(collection(item,key,pages));
      else throw Error('documentation_section_invalid:'+item.type);
    }
    return {
      slug:page.slug,title:page.title,page_type:page.type||'article',
      route:page.route,category:page.category,seo:{title:page.title,description:page.summary},
      status:'draft',template:pageTemplate(page,stylesheets,runtimeUrl,body),
      sections:[structuredClone(globalHeader),...body,structuredClone(globalFooter)]
        .map((section,index)=>({...section,sort_order:index}))
    };
  });
  return {schema:'agentsam.theme-project.v1',id,name,version,revision:0,
    sourcePackage:'@inneranimalmedia/agentsam-docs-theme',
    sourceThemeId:'documentation',sourcePackageVersion:version,
    tokens:{...tokens},pages:projectPages};
}
