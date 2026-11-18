/** Local Studio mounts Identity-owned first-run onboarding. Commerce supplies the site API. */
import { serveMerchantOnboarding } from '../../../../packages/identity/src/server/merchant-onboarding.js';

/** The host projects its own identity, sites, and editing routes in `config`.
 * The reusable CMS knows none of these paths or this Worker's asset layout. */
export function serveStudioMerchantStart(request, env, config) {
  return serveMerchantOnboarding(request, {
    assets:env.ASSETS,
    assetPrefix:'/identity/merchant-onboarding',
    config,
  });
}
