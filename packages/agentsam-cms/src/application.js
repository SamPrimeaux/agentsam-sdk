/**
 * Merchant CMS application operations. This package owns behavior, NEVER database
 * provisioning. The installed ecommerce-cms-agentsam host owns repository mapping,
 * migrations, R2, tenant selection, and delivery of public storefronts.
 *
 * Host MUST make draft compare-and-swap and publish/rollback atomic. A successful
 * domain method does not imply persistence until the repository returns a receipt.
 */
export const CMS_PAGE_KINDS = Object.freeze([
  'home','page','product','collection','blog','article','cart','checkout',
  'search','password','404','customer-login','customer-register',
  'customer-recovery','customer-account'
]);

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const copy = value => structuredClone(value);
const fail = (code) => { throw Object.assign(new Error(code), { code }); };
const isKey = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value);
const isSlug = value => typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 160;
const isRoute = value => typeof value === 'string' && value.startsWith('/') &&
  !value.includes('//') && !value.includes('\\') && !value.includes('?') &&
  !value.includes('#') && !value.split('/').includes('..') && value.length <= 500 &&
  /^\/[a-zA-Z0-9/_-]*$/.test(value);
const string = (value, min = 1, max = 240) => typeof value === 'string' &&
  value.trim().length >= min && value.length <= max;
const required = (value, code, valid) => { if (!valid(value)) fail(code); return value; };
const validateSeo = seo => {
  if (!object(seo)) fail('cms_seo_object_required');
  const allowed = new Set(['title','description','canonical','robots','socialImageAssetId']);
  for (const [key,value] of Object.entries(seo)) {
    if (!allowed.has(key) || ['__proto__','constructor','prototype'].includes(key)) fail('cms_seo_field_invalid');
    if (key === 'canonical') {
      if (value !== null && (!string(value,1,2048) || !/^https?:\/\//.test(value))) fail('cms_seo_canonical_invalid');
    } else if (value !== null && (typeof value !== 'string' || value.length > (key === 'description' ? 1000 : 500)))
      fail('cms_seo_value_invalid');
  }
  return copy(seo);
};
const validateDraft = changes => {
  if (!object(changes) || !Object.keys(changes).length) fail('cms_page_changes_required');
  const allowed = new Set(['title','slug','routePath','pageType','templateSku','seo','navVisible','requiresAuth','metadata']);
  const out = {};
  for (const [key,value] of Object.entries(changes)) {
    if (!allowed.has(key)) fail('cms_page_field_not_editable');
    switch (key) {
      case 'title': required(value,'cms_page_title_invalid',v=>string(v,1,240)); break;
      case 'slug': required(value,'cms_page_slug_invalid',isSlug); break;
      case 'routePath': required(value,'cms_page_route_invalid',isRoute); break;
      case 'pageType': required(value,'cms_page_kind_invalid',v=>CMS_PAGE_KINDS.includes(v)); break;
      case 'templateSku': if (value !== null) required(value,'cms_template_invalid',isKey); break;
      case 'seo': out[key]=validateSeo(value); continue;
      case 'navVisible':
      case 'requiresAuth': if (typeof value !== 'boolean') fail('cms_page_boolean_invalid'); break;
      case 'metadata': if (!object(value)) fail('cms_page_metadata_invalid'); break;
    }
    out[key] = copy(value);
  }
  return out;
};
function ensureReceipt(value, scope, { pageId = null, themeId = null, publication = false } = {}) {
  if (!object(value) || value.ok !== true) fail('cms_repository_receipt_required');
  if (value.accountId != null && value.accountId !== scope.accountId) fail('cms_receipt_account_mismatch');
  if (value.siteId != null && value.siteId !== scope.siteId) fail('cms_receipt_site_mismatch');
  if (pageId && value.pageId !== pageId) fail('cms_receipt_page_mismatch');
  if (themeId && value.themeId !== themeId) fail('cms_receipt_theme_mismatch');
  if (publication && (!string(value.manifestObjectKey,1,2048) ||
      !string(value.manifestHash,32,128) || !Number.isInteger(value.releaseNumber) ||
      value.releaseNumber < 1)) fail('cms_publication_proof_required');
  return value;
}
const requiredRepositoryMethods = [
  'getSite','listPages','readPage','createPageDraft','updatePageDraft','duplicatePageDraft',
  'archivePage','history','restoreRevision','previewPage','publishPage','rollbackPage',
  'getPublication','listThemes','installTheme','publishTheme','listNavigation',
  'saveNavigation','listAssets'
];
/**
 * Host repository is a capability, not a database URL or SQL schema.
 * No user-supplied account or site ID may establish a trusted scope.
 */
export function createMerchantCms({ repository, resolveTrustedContext, authorize, createId = () => crypto.randomUUID() } = {}) {
  for (const key of requiredRepositoryMethods)
    if (typeof repository?.[key] !== 'function') throw new TypeError('cms_repository_missing_' + key);
  if (typeof resolveTrustedContext !== 'function' || typeof authorize !== 'function')
    throw new TypeError('cms_host_security_required');
  async function trusted(ctx, operation, effect, resource = {}) {
    const identity = await resolveTrustedContext(ctx);
    if (!identity || !isKey(identity.accountId) || !isKey(identity.siteId) ||
      !isKey(identity.actorId)) fail('cms_trusted_scope_required');
    const scope = Object.freeze({
      accountId: identity.accountId, siteId: identity.siteId, actorId: identity.actorId
    });
    const site = await repository.getSite(scope);
    if (!site || site.id !== scope.siteId ||
      (site.account_id ?? site.accountId) !== scope.accountId) fail('cms_site_not_owned');
    const decision = await authorize({operation,effect,identity:scope,resource:copy(resource)});
    if (decision !== true && decision?.allow !== true) fail('cms_access_denied');
    if (effect === 'publish' && (decision?.publicationApproved !== true))
      fail('cms_publication_approval_required');
    return scope;
  }
  const pageId = id => required(id, 'cms_page_id_invalid', isKey);
  const themeId = id => required(id, 'cms_theme_id_invalid', isKey);
  const version = n => required(n,'cms_expected_version_required',n=>Number.isInteger(n)&&n>=1);
  const writeKey = k => required(k,'cms_idempotency_key_required',k=>string(k,8,128));
  return Object.freeze({
    sites: Object.freeze({
      async current(ctx) {
        const scope = await trusted(ctx,'cms.site.read','read');
        return copy(await repository.getSite(scope));
      }
    }),
    pages: Object.freeze({
      async list(input = {}, ctx) {
        const { status = null, limit = 50, cursor = null } = input;
        if (status != null && !['draft','published','archived'].includes(status)) fail('cms_page_status_invalid');
        if (!Number.isInteger(limit) || limit < 1 || limit > 100) fail('cms_page_limit_invalid');
        const scope = await trusted(ctx,'cms.page.list','read');
        return repository.listPages(scope,{status,limit,cursor});
      },
      async read(input,ctx) {
        const id = pageId(input?.pageId);
        const scope = await trusted(ctx,'cms.page.read','read',{pageId:id});
        const page = await repository.readPage(scope,id);
        if (!page) fail('cms_page_not_found');
        return page;
      },
      async create(input,ctx) {
        const id = pageId(input?.pageId ?? ('cmsp_' + createId().replaceAll('-','')));
        const changes = validateDraft({
          title:input?.title,slug:input?.slug,routePath:input?.routePath,
          pageType:input?.pageType ?? 'page', ...(input?.templateSku === undefined ? {} : {templateSku:input.templateSku}),
          ...(input?.seo === undefined ? {} : {seo:input.seo})
        });
        const scope = await trusted(ctx,'cms.page.create','write',{pageId:id});
        return ensureReceipt(await repository.createPageDraft(scope,{
          pageId:id,...changes,idempotencyKey:writeKey(input?.idempotencyKey)
        }),scope,{pageId:id});
      },
      async update(input,ctx) {
        const id = pageId(input?.pageId), expectedVersion = version(input?.expectedVersion);
        const changes = validateDraft(input?.changes);
        const scope = await trusted(ctx,'cms.page.update','write',{pageId:id});
        return ensureReceipt(await repository.updatePageDraft(scope,{
          pageId:id,expectedVersion,changes,idempotencyKey:writeKey(input?.idempotencyKey)
        }),scope,{pageId:id});
      },
      async duplicate(input,ctx) {
        const id = pageId(input?.pageId), newId = pageId(input?.newPageId ?? ('cmsp_' + createId().replaceAll('-','')));
        if (id === newId) fail('cms_duplicate_same_id');
        const slug = required(input?.slug,'cms_page_slug_invalid',isSlug);
        const scope = await trusted(ctx,'cms.page.duplicate','write',{pageId:id});
        return ensureReceipt(await repository.duplicatePageDraft(scope,{
          pageId:id,newPageId:newId,slug,idempotencyKey:writeKey(input?.idempotencyKey)
        }),scope,{pageId:newId});
      },
      async archive(input,ctx) {
        const id = pageId(input?.pageId), expectedVersion=version(input?.expectedVersion);
        const scope = await trusted(ctx,'cms.page.archive','write',{pageId:id});
        return ensureReceipt(await repository.archivePage(scope,{pageId:id,expectedVersion}),scope,{pageId:id});
      },
      async revisions(input,ctx) {
        const id=pageId(input?.pageId);
        const scope=await trusted(ctx,'cms.revision.list','read',{pageId:id});
        return repository.history(scope,{pageId:id,limit:input?.limit ?? 30});
      },
      async restore(input,ctx) {
        const id=pageId(input?.pageId), expectedVersion=version(input?.expectedVersion);
        const revision=version(input?.revision);
        const scope=await trusted(ctx,'cms.revision.restore','write',{pageId:id});
        return ensureReceipt(await repository.restoreRevision(scope,{
          pageId:id,expectedVersion,revision
        }),scope,{pageId:id});
      },
      async preview(input,ctx) {
        const id=pageId(input?.pageId);
        const scope=await trusted(ctx,'cms.page.preview','read',{pageId:id});
        const result=await repository.previewPage(scope,{pageId:id});
        if (!result || result.published === true) fail('cms_preview_not_private');
        return result;
      },
      async publish(input,ctx) {
        const id=pageId(input?.pageId), expectedVersion=version(input?.expectedVersion);
        if (input?.confirmation !== true) fail('cms_publish_confirmation_required');
        const scope=await trusted(ctx,'cms.page.publish','publish',{pageId:id});
        return ensureReceipt(await repository.publishPage(scope,{
          pageId:id,expectedVersion,idempotencyKey:writeKey(input?.idempotencyKey)
        }),scope,{pageId:id,publication:true});
      },
      async rollback(input,ctx) {
        const id=pageId(input?.pageId), releaseNumber=version(input?.releaseNumber);
        if (input?.confirmation !== true) fail('cms_rollback_confirmation_required');
        const scope=await trusted(ctx,'cms.page.rollback','publish',{pageId:id});
        return ensureReceipt(await repository.rollbackPage(scope,{
          pageId:id,releaseNumber,idempotencyKey:writeKey(input?.idempotencyKey)
        }),scope,{pageId:id,publication:true});
      },
      async published(input,ctx) {
        const id=pageId(input?.pageId);
        const scope=await trusted(ctx,'cms.page.publication.read','read',{pageId:id});
        return repository.getPublication(scope,{pageId:id});
      }
    }),
    themes: Object.freeze({
      async list(ctx) {
        const scope=await trusted(ctx,'cms.theme.list','read');
        return repository.listThemes(scope);
      },
      async install(input,ctx) {
        const id=themeId(input?.themeId);
        const sourceRef=required(input?.sourceRef,'cms_theme_source_required',v=>string(v,1,2048));
        const sourceVersion=required(input?.sourceVersion,'cms_theme_version_required',v=>string(v,1,80));
        const scope=await trusted(ctx,'cms.theme.install','write',{themeId:id});
        return ensureReceipt(await repository.installTheme(scope,{
          themeId:id,sourceRef,sourceVersion,idempotencyKey:writeKey(input?.idempotencyKey)
        }),scope,{themeId:id});
      },
      async publish(input,ctx) {
        const id=themeId(input?.themeId), expectedVersion=version(input?.expectedVersion);
        if (input?.confirmation !== true) fail('cms_publish_confirmation_required');
        const scope=await trusted(ctx,'cms.theme.publish','publish',{themeId:id});
        return ensureReceipt(await repository.publishTheme(scope,{
          themeId:id,expectedVersion,idempotencyKey:writeKey(input?.idempotencyKey)
        }),scope,{themeId:id,publication:true});
      }
    }),
    navigation: Object.freeze({
      async list(ctx) {
        const scope=await trusted(ctx,'cms.navigation.list','read');
        return repository.listNavigation(scope);
      },
      async save(input,ctx) {
        const menuId=required(input?.menuId,'cms_navigation_id_invalid',isKey);
        const expectedVersion=version(input?.expectedVersion);
        if (!Array.isArray(input?.items) || input.items.length > 100) fail('cms_navigation_items_invalid');
        for (const item of input.items)
          if (!object(item) || !string(item.label,1,160) || !isRoute(item.path))
            fail('cms_navigation_item_invalid');
        const scope=await trusted(ctx,'cms.navigation.save','write',{menuId});
        return ensureReceipt(await repository.saveNavigation(scope,{
          menuId,expectedVersion,items:copy(input.items)
        }),scope);
      }
    }),
    assets: Object.freeze({
      async list(ctx) {
        const scope=await trusted(ctx,'cms.asset.list','read');
        return repository.listAssets(scope);
      }
    })
  });
}
