/**
 * Ember Supply — account / Cloudflare resource identity (not brand SSOT).
 * Branding → D1 company. Integrations → D1 agentsam_plugins.
 */
export const COMMERCE_ACCOUNT_ID = "demo-commerce-account";
export const COMMERCE_CLOUDFLARE_ACCOUNT_ID = COMMERCE_ACCOUNT_ID;
export const COMMERCE_SYSTEM_USER_ID = "au_commerce_system";

export const COMMERCE_WORKER_NAME = "ember";
export const COMMERCE_D1_BINDING = "DB";
export const COMMERCE_D1_DATABASE = "ember";
export const COMMERCE_R2_BINDING = "WEBSITE_ASSETS";
export const COMMERCE_R2_BUCKET = "ember";
export const COMMERCE_VECTORIZE_INDEX = "commerce-agentsam-bge-m3-1024";
export const COMMERCE_EMBED_MODEL = "@cf/baai/bge-m3";

/** @deprecated Prefer resolveGithubRepo(env) from lib/integration-config.js */
export const COMMERCE_GITHUB_REPO = "InnerAnimalMedia/commerce-demo";
/** @deprecated Prefer getCompanyDomain(env) from lib/company.js */
export const COMMERCE_APP_DOMAIN = "ember.example";

export const COMMERCE_PLATFORM_SCOPE = {
  account_id: COMMERCE_ACCOUNT_ID,
  cloudflare_account_id: COMMERCE_CLOUDFLARE_ACCOUNT_ID,
  worker: COMMERCE_WORKER_NAME,
  d1_binding: COMMERCE_D1_BINDING,
  d1_database: COMMERCE_D1_DATABASE,
  r2_binding: COMMERCE_R2_BINDING,
  r2_bucket: COMMERCE_R2_BUCKET,
};

export const COMMERCE_TOOL_SCOPE_NOTE =
  "AgentSam tools are limited to the Ember Supply account and its Worker, D1, R2, GitHub repository, and domain resources. Never access resources owned by another account.";

/** Studio workflows shown in the AgentSam drawer picker */
export const DRAWER_WORKFLOW_KEYS = [
  "commerce_content_studio",
  "commerce_creative_studio",
  "commerce_brand_refresh",
];
