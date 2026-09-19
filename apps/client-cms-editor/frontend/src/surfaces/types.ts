export type CmsWorkspaceSite = {
  slug: string;
  name?: string;
  domain?: string;
  hub_priority?: number;
  is_featured?: boolean;
  status?: string;
  theme?: Record<string, unknown>;
  project_id?: string;
  storefront_url?: string;
};

export type CmsWorkspaceContext = {
  workspace_id?: string;
  workspace_slug?: string;
  project_id?: string;
  project_slug?: string;
  project_name?: string;
  ui_label?: string;
  is_operator_hub?: boolean;
};

export type CmsDashboardSetupMode = 'loading' | 'active' | 'deploy' | 'pick-site';

export type CmsActivityRow = {
  id?: string;
  action?: string;
  resource_type?: string;
  resource_id?: string;
  created_at?: number | string;
  details?: string | Record<string, unknown>;
};

export type CmsModuleDef = {
  id: string;
  title: string;
  desc: string;
  sub?: string;
  path?: string;
  action?: 'structure' | 'import' | string;
  cta: string;
};

export type CmsQuickAction = {
  label: string;
  path?: string;
  action?: 'import' | string;
};
