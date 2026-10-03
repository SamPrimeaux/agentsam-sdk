/**
 * Fuel & Free Time — account / Cloudflare resource identity (not brand SSOT).
 * Branding → D1 company. Integrations → D1 agentsam_plugins.
 */
export const FNF_ACCOUNT_ID = "ede6590ac0d2fb7daf155b35653457b2";
export const FNF_CLOUDFLARE_ACCOUNT_ID = FNF_ACCOUNT_ID;
export const FNF_SYSTEM_USER_ID = "au_fnf_system";

export const FNF_WORKER_NAME = "fuelnfreetime";
export const FNF_D1_BINDING = "DB";
export const FNF_D1_DATABASE = "fuelnfreetime";
export const FNF_R2_BINDING = "WEBSITE_ASSETS";
export const FNF_R2_BUCKET = "fuelnfreetime";
export const FNF_VECTORIZE_INDEX = "fnf-agentsam-bge-m3-1024";
export const FNF_EMBED_MODEL = "@cf/baai/bge-m3";

/** @deprecated Prefer resolveGithubRepo(env) from lib/integration-config.js */
export const FNF_GITHUB_REPO = "SamPrimeaux/fuelnfreetime";
/** @deprecated Prefer getCompanyDomain(env) from lib/company.js */
export const FNF_APP_DOMAIN = "fuelnfreetime.com";

export const FNF_PLATFORM_SCOPE = {
  account_id: FNF_ACCOUNT_ID,
  cloudflare_account_id: FNF_CLOUDFLARE_ACCOUNT_ID,
  worker: FNF_WORKER_NAME,
  d1_binding: FNF_D1_BINDING,
  d1_database: FNF_D1_DATABASE,
  r2_binding: FNF_R2_BINDING,
  r2_bucket: FNF_R2_BUCKET,
};

export const FNF_TOOL_SCOPE_NOTE =
  "AgentSam tools are limited to the Fuel & Free Time account and its Worker, D1, R2, GitHub repository, and domain resources. Never access resources owned by another account.";

/** Studio workflows shown in the AgentSam drawer picker */
export const DRAWER_WORKFLOW_KEYS = [
  "fnf_content_studio",
  "fnf_creative_studio",
  "fnf_brand_refresh",
];
