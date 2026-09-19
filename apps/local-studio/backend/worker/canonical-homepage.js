import { injectSitePartials } from './site-partials.js';

let cachedHtml = null;

const FALLBACK_HOMEPAGE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Agent Sam — Cloud Contained Sandboxes</title>
<meta name="description" content="npm i @inneranimalmedia/agentsam-sdk — sandboxes, tools, and promote-only paths for Agent Sam.">
</head>
<body data-footer-theme="dark" data-route="/agentsam">

<!-- AGENTSAM:IAM_HEADER:START -->
<!-- Injected at edge via HTMLRewriter from sites/{site}/partials/header.html -->
<!-- AGENTSAM:IAM_HEADER:END -->

<main id="top" class="iam-public-page agentsam-landing" data-route="/agentsam">
  <section class="hero" data-section-key="hero" aria-labelledby="hero-title">
    <div class="hero-copy">
      <div class="eyebrow">@inneranimalmedia/agentsam-sdk</div>
      <h1 id="hero-title">Ship Agent Sam with a real SDK computer</h1>
      <p>npm i @inneranimalmedia/agentsam-sdk — then give agents ephemeral sandboxes, scoped tools, terminals, and promote-only paths back into your Cloudflare stack.</p>
      <div class="hero-actions">
        <a class="btn btn-primary" href="#secure">Install the SDK</a>
        <a class="btn" href="/auth/login?next=/agentsam">Open Workbench</a>
      </div>
    </div>
  </section>
</main>

<!-- AGENTSAM:IAM_FOOTER:START -->
<!-- Injected at edge via HTMLRewriter from sites/{site}/partials/footer.html -->
<!-- AGENTSAM:IAM_FOOTER:END -->

</body>
</html>`;

/**
 * Loads the raw homepage HTML template.
 * Resolves from Cloudflare Workers static ASSETS binding first, then
 * local filesystem candidates when in test/node environment, and finally
 * falls back to embedded HTML.
 *
 * @param {object} env Worker environment bindings
 * @returns {Promise<string>}
 */
export async function getCanonicalHomepageHtml(env) {
  if (env?.ASSETS) {
    try {
      const res = await env.ASSETS.fetch(new Request('http://localhost/site/homepage.html'));
      if (res && res.status === 200) {
        return await res.text();
      }
    } catch {
      // Fall through to filesystem or embedded fallback
    }
  }

  if (cachedHtml) {
    return cachedHtml;
  }

  try {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const candidates = [
      path.resolve(process.cwd(), 'apps/local-studio/frontend/public/site/homepage.html'),
      path.resolve(process.cwd(), 'apps/frontend/public/site/homepage.html'),
      path.resolve(process.cwd(), '.output/public/site/homepage.html'),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        cachedHtml = fs.readFileSync(p, 'utf8');
        return cachedHtml;
      }
    }
  } catch {
    // Ignore dynamic import failure in non-Node environments
  }

  return FALLBACK_HOMEPAGE_HTML;
}

/**
 * Serves the canonical AgentSam SDK landing page at / with edge-injected site partials.
 * Guarantees content-type: text/html; charset=utf-8 so injectSitePartials() never no-ops.
 *
 * @param {Request} request Inbound HTTP request
 * @param {object} env Worker environment bindings
 * @param {string} [siteSlug='agentsam-sdk'] Canonical site identifier
 * @returns {Promise<Response>}
 */
export async function serveCanonicalHomepage(request, env, siteSlug = 'agentsam-sdk') {
  const html = await getCanonicalHomepageHtml(env);
  const response = new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=0, must-revalidate',
      'x-robots-tag': 'index, follow',
    },
  });

  return injectSitePartials(response, env, siteSlug);
}
