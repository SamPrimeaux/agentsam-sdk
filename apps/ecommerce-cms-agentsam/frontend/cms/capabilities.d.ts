export declare const ECOMMERCE_CMS_CAPABILITIES: Readonly<{
  sites: Readonly<{ discover: true; select: true; create: false; delete: false }>;
  routes: Readonly<{ list: true; create: true; updateMeta: true; delete: true; preview: true; publish: true }>;
  groups: Readonly<{ organize: true; deriveFromSectionMetadata: true; reorder: true }>;
  sections: Readonly<{ create: true; update: true; delete: true; reorder: true; visibility: true; duplicate: true }>;
  blocks: Readonly<{ create: true; update: true; delete: true; reorder: true; duplicate: true }>;
  revisions: Readonly<{ compositionSnapshots: true; restoreComposition: true }>;
  theme: Readonly<{ tokens: true; templates: true; packages: true; importExport: true }>;
  media: Readonly<{ list: true; upload: true; update: true; delete: true }>;
  runtime: Readonly<{
    hostedD1R2: true;
    desktopAuthenticatedBridge: true;
    portableLocalCmsRuntime: true;
  }>;
}>;

export declare function assertEcommerceCmsAuthoringContract(): typeof ECOMMERCE_CMS_CAPABILITIES;
