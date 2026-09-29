export type CmsEditorZone = 'HEADER' | 'BODY' | 'FOOTER' | 'TEMPLATE';
export type CmsEditorStatus = 'live' | 'draft' | 'new';
export type CmsEditorTargetKind = 'page' | 'section' | 'block';

export type CmsEditorBlock = {
  id: string;
  sectionId: string;
  type: string;
  visible: boolean;
  data: Record<string, any>;
  sortOrder: number;
};

export type CmsEditorSection = {
  id: string;
  name: string;
  type: string;
  zone: CmsEditorZone;
  visible: boolean;
  color: string;
  fields: Record<string, any>;
  css?: Record<string, any>;
  blocks: CmsEditorBlock[];
};

export type CmsEditorPage = {
  id: string;
  title: string;
  slug: string;
  status: CmsEditorStatus;
  type: string;
  parent?: string;
  sections: CmsEditorSection[];
  metaTitle: string;
  metaDescription: string;
};

export type CmsEditorSiteTheme = {
  cssVars: Record<string, string>;
};

export type CmsEditorSiteSchemas = {
  protocol_version: number;
  sections: unknown[];
  blocks: unknown[];
  fields?: unknown[];
};

export type CmsEditorSite = {
  id: string;
  name: string;
  initials: string;
  domain: string;
  edited: string;
  color: string;
  pages: CmsEditorPage[];
  /** Site-level theme authority (starter pack + editor). */
  theme?: CmsEditorSiteTheme;
  /** Site-level schema registry (starter pack + editor). */
  schemas?: CmsEditorSiteSchemas;
};

/** Site metadata without hydrated page trees (aggregate reads use loadSite). */
export type CmsSiteRecord = Omit<CmsEditorSite, 'pages'>;

export type CmsSiteCreateInput = {
  id?: string;
  name: string;
  domain?: string;
  initials?: string;
  color?: string;
  theme?: CmsEditorSiteTheme;
  schemas?: CmsEditorSiteSchemas;
};

export type CmsSiteUpdatePatch = Partial<
  Pick<CmsEditorSite, 'name' | 'initials' | 'domain' | 'edited' | 'color' | 'theme' | 'schemas'>
>;

export type CmsEditorSelection = {
  kind: CmsEditorTargetKind;
  pageId: string | null;
  sectionId: string | null;
  blockId: string | null;
  fieldPath: string | null;
};

export const emptyCmsEditorSelection = (): CmsEditorSelection => ({
  kind: 'page', pageId: null, sectionId: null, blockId: null, fieldPath: null,
});
