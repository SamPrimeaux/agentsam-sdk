/**
 * Theme portability gate shared by ALL website starter packages.
 *
 * This is not a registry. Source packages supply renderer-backed HTML and
 * their advertised pages. D1 cms_definitions and cms_section_blocks remain
 * the authority for installed definitions and merchant content.
 */
const issue=(code,detail)=>({code,detail});
const safeRoute=route=>typeof route==='string' &&
  /^\/(?:[a-zA-Z0-9._-]+\/?)*$/.test(route) &&
  !route.split('/').includes('..');

export function auditPortableThemeProject(project,{declaredPages=[]}={}) {
  const errors=[],warnings=[];
  const pages=Array.isArray(project?.pages)?project.pages:[];
  if(project?.schema!=='agentsam.theme-project.v1')
    errors.push(issue('project_schema','Not an AgentSam CMS starter'));
  if(!pages.length)errors.push(issue('no_pages','No renderable CMS pages'));
  if(declaredPages.length>pages.length)errors.push(issue('declared_pages_missing',
    'Package advertises '+declaredPages.length+' pages but only '+pages.length+' unique rendered pages were imported'));
  const slugs=new Set(),templateKeys=new Set();
  let sectionCount=0,blockCount=0,groupCount=0,fieldCount=0;
  for(const page of pages) {
    if(!page || typeof page.slug!=='string'||slugs.has(page.slug))
      errors.push(issue('invalid_page_identity',page?.slug||'missing'));
    slugs.add(page.slug);
    if(page.sourceRoute!=null&&!safeRoute(page.sourceRoute))
      errors.push(issue('unsafe_page_route',String(page.sourceRoute)));
    if(!page.template||!Array.isArray(page.sections)||page.sections.length===0) {
      errors.push(issue('empty_page',String(page.slug)));continue;
    }
    const pageSections=new Set();
    for(const section of page.sections) {
      sectionCount++;
      if(!section?.key||pageSections.has(section.key))
        errors.push(issue('duplicate_section_instance',page.slug+':'+section.key));
      pageSections.add(section.key);
      const id='source-'+page.slug+'-'+section.key;
      if(templateKeys.has(id))errors.push(issue('duplicate_module',id));
      templateKeys.add(id);
      if(!section?.html||!section?.schema||!section?.content)
        errors.push(issue('nonrenderable_section',page.slug+':'+section?.key));
      if(!['HEADER','BODY','FOOTER'].includes(section?.zone)||
          !section?.sourceKind||section?.schema?.zone!==section.zone)
        errors.push(issue('nonsemantic_section',page.slug+':'+section?.key));
      const fields=section.schema?.fields||[],blocks=section.schema?.blocks||[];
      fieldCount+=fields.length;
      blockCount+=blocks.length;
      groupCount+=blocks.filter(b=>b.kind==='group').length;
      if(!fields.length&&!blocks.length)
        warnings.push(issue('static_section',page.slug+':'+section.key));
      if(fields.some(f=>/^field_\d+$/.test(f.key)))
        warnings.push(issue('anonymous_legacy_fields',page.slug+':'+section.key));
      for(const block of blocks) {
        if(!block.key||!block.html||!Array.isArray(block.fields))
          errors.push(issue('nonportable_block',page.slug+':'+section.key));
      }
    }
  }
  if(Array.isArray(project?.sourceAssetErrors)&&project.sourceAssetErrors.length)
    errors.push(issue('missing_assets',project.sourceAssetErrors.join('; ').slice(0,220)));
  const summary={pages:pages.length,sections:sectionCount,blocks:blockCount,groups:groupCount,
    fields:fieldCount,advertisedPages:declaredPages.length};
  return {ok:errors.length===0,summary,errors,warnings};
}
