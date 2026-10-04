export const ECOMMERCE_CMS_CAPABILITIES = Object.freeze({
  sites: Object.freeze({ discover: true, select: true, create: false, delete: false }),

  // Routes/pages are containers and publication targets, not the primary editing primitive.
  routes: Object.freeze({ list: true, create: true, updateMeta: true, delete: true, preview: true, publish: true }),

  // Primary authoring primitives.
  groups: Object.freeze({ organize: true, deriveFromSectionMetadata: true, reorder: true }),
  sections: Object.freeze({ create: true, update: true, delete: true, reorder: true, visibility: true, duplicate: true }),
  blocks: Object.freeze({ create: true, update: true, delete: true, reorder: true, duplicate: true }),

  revisions: Object.freeze({ compositionSnapshots: true, restoreComposition: true }),
  theme: Object.freeze({ tokens: true, templates: true, packages: true, importExport: true }),
  media: Object.freeze({ list: true, upload: true, update: true, delete: true }),

  runtime: Object.freeze({
    hostedD1R2: true,
    desktopAuthenticatedBridge: true,
    portableLocalCmsRuntime: true,
  }),
});

export function assertEcommerceCmsAuthoringContract() {
  const required = [
    ECOMMERCE_CMS_CAPABILITIES.routes.preview,
    ECOMMERCE_CMS_CAPABILITIES.routes.publish,
    ECOMMERCE_CMS_CAPABILITIES.groups.organize,
    ECOMMERCE_CMS_CAPABILITIES.sections.create,
    ECOMMERCE_CMS_CAPABILITIES.sections.update,
    ECOMMERCE_CMS_CAPABILITIES.sections.delete,
    ECOMMERCE_CMS_CAPABILITIES.sections.reorder,
    ECOMMERCE_CMS_CAPABILITIES.blocks.create,
    ECOMMERCE_CMS_CAPABILITIES.blocks.update,
    ECOMMERCE_CMS_CAPABILITIES.blocks.delete,
    ECOMMERCE_CMS_CAPABILITIES.blocks.reorder,
    ECOMMERCE_CMS_CAPABILITIES.revisions.compositionSnapshots,
    ECOMMERCE_CMS_CAPABILITIES.media.upload,
  ];
  if (required.some((value) => value !== true)) {
    throw new Error('ecommerce_cms_authoring_contract_incomplete');
  }
  return ECOMMERCE_CMS_CAPABILITIES;
}
