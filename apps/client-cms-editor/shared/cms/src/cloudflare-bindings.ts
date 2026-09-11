export type CmsCloudflareCapability =
  | 'cms-cloud'
  | 'iam'
  | 'workers-ai'
  | 'browser'
  | 'container'
  | 'encrypted-secrets'
  | 'acp';

export type CmsCloudflareBindingName =
  | 'DB'
  | 'WEBSITE_ASSETS'
  | 'SESSION_CACHE'
  | 'AGENTSAM_WAI'
  | 'MY_CONTAINER'
  | 'MYBROWSER'
  | 'IAM_CLIENT_ID'
  | 'IAM_CLIENT_SECRET'
  | 'IAM_ORIGIN'
  | 'SECRETS_ENCRYPTION_KEY'
  | 'ACP_CLIENT_ID'
  | 'ACP_CLIENT_SECRET';

export type CmsCloudflareBindingContract = {
  name: CmsCloudflareBindingName;
  capability: CmsCloudflareCapability;
  required: boolean;
  secret?: boolean;
  authority: 'metadata' | 'assets' | 'identity' | 'cache-only' | 'execution-only' | 'configuration';
  description: string;
};

export const CMS_CLOUDFLARE_BINDINGS: readonly CmsCloudflareBindingContract[] = [
  { name: 'DB', capability: 'cms-cloud', required: true, authority: 'metadata', description: 'D1 authority for CMS/account/publication metadata.' },
  { name: 'WEBSITE_ASSETS', capability: 'cms-cloud', required: true, authority: 'assets', description: 'R2 storage for CMS-managed media, theme assets, generated artifacts and publication snapshots.' },
  { name: 'SESSION_CACHE', capability: 'cms-cloud', required: false, authority: 'cache-only', description: 'Optional session/login acceleration cache. Never account or session authority.' },
  { name: 'IAM_CLIENT_ID', capability: 'iam', required: true, authority: 'configuration', description: 'Public IAM client identifier.' },
  { name: 'IAM_CLIENT_SECRET', capability: 'iam', required: true, secret: true, authority: 'identity', description: 'Confidential IAM client credential.' },
  { name: 'IAM_ORIGIN', capability: 'iam', required: true, authority: 'identity', description: 'Canonical IAM issuer/auth-service origin, not the current website origin by default.' },
  { name: 'AGENTSAM_WAI', capability: 'workers-ai', required: true, authority: 'execution-only', description: 'Workers AI binding when the user opts into Cloudflare AI.' },
  { name: 'MYBROWSER', capability: 'browser', required: true, authority: 'execution-only', description: 'Optional Browser Rendering / browser automation binding.' },
  { name: 'MY_CONTAINER', capability: 'container', required: true, authority: 'execution-only', description: 'Optional scoped execution runtime. It receives authenticated identity; it never establishes identity.' },
  { name: 'SECRETS_ENCRYPTION_KEY', capability: 'encrypted-secrets', required: true, secret: true, authority: 'configuration', description: 'Envelope-encryption key only where application-managed encrypted secrets are persisted.' },
  { name: 'ACP_CLIENT_ID', capability: 'acp', required: true, authority: 'configuration', description: 'ACP client identity when ACP is enabled.' },
  { name: 'ACP_CLIENT_SECRET', capability: 'acp', required: true, secret: true, authority: 'configuration', description: 'ACP confidential credential when ACP is enabled.' },
] as const;

export function cmsBindingsForCapabilities(capabilities: Iterable<CmsCloudflareCapability>) {
  const enabled = new Set(capabilities);
  return CMS_CLOUDFLARE_BINDINGS.filter((binding) => enabled.has(binding.capability));
}
