/**
 * Worker-side asset storage bootstrap. Values come from what the Worker already has:
 * the company record (site domain), the request origin as a fallback, and declared
 * deployment vars. Nothing here names a customer.
 *
 *   ASSET_PUBLIC_BASE_URL  optional custom CDN hostname for the bucket
 *   CLOUDFLARE_ACCOUNT_ID  optional; only used for reporting
 */
import { getCompany, companyDomain } from "../lib/company.js";
import { assetStorage, configureAssetStorage, isAssetStorageConfigured } from "./config.js";

/**
 * Idempotent. The first caller in an isolate configures storage; later calls return it.
 * Without a company domain or a request there is nothing safe to derive, so it stays
 * unconfigured and asset code fails loudly rather than guessing.
 */
export async function ensureAssetStorage(env, request = null) {
  if (isAssetStorageConfigured()) return assetStorage();
  let base = null;
  const domain = companyDomain(await getCompany(env));
  if (domain) base = `https://${domain}`;
  else if (request) base = new URL(request.url).origin;
  if (!base) return null;
  // Another request may have configured it while we awaited the company lookup.
  if (isAssetStorageConfigured()) return assetStorage();
  return configureAssetStorage({
    workerMediaBaseUrl: `${base}/media`,
    publicBaseUrl: env?.ASSET_PUBLIC_BASE_URL || null,
    accountId: env?.CLOUDFLARE_ACCOUNT_ID || null,
  });
}
