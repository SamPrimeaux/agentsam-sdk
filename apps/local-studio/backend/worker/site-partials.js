/**
 * Canonical Site Partials & Edge HTMLRewriter Injection Service.
 *
 * SSOT: WEBSITE_ASSETS R2 (logical role; binding name is alias-resolved).
 * Layout:
 *   sites/${siteSlug}/partials/header.html
 *   sites/${siteSlug}/partials/footer.html
 *
 * Header/footer are shared objects per site — not duplicated in D1 page rows.
 * D1 stores editable field metadata; this R2 layer stores the HTML code sections.
 */
import { resolveWebsiteAssets, websitePartialKey } from './bindings.js';

function requireWebsiteAssets(env) {
  const resolved = resolveWebsiteAssets(env);
  if (!resolved) {
    throw new Error(
      'WEBSITE_ASSETS role unavailable — bind an R2 bucket as WEBSITE_ASSETS (or alias SITE_ASSETS/CMS_ASSETS/CONTENT)'
    );
  }
  return resolved;
}

export async function fetchSitePartial(env, siteSlug, partialName) {
  const resolved = resolveWebsiteAssets(env);
  if (!resolved) return null;
  try {
    const key = websitePartialKey(siteSlug, partialName);
    const obj = await resolved.binding.get(key);
    if (!obj) return null;
    return await obj.text();
  } catch (err) {
    console.error(`Failed to fetch partial ${partialName} for site ${siteSlug}:`, err);
    return null;
  }
}

export async function putSitePartial(env, siteSlug, partialName, content) {
  const { binding } = requireWebsiteAssets(env);
  const key = websitePartialKey(siteSlug, partialName);
  await binding.put(key, content, {
    httpMetadata: { contentType: 'text/html; charset=utf-8' },
  });
  return { ok: true, key };
}

/**
 * Injects header.html and footer.html into an HTML Response using HTMLRewriter.
 *
 * @param {Response} response Original HTML response
 * @param {object} env Worker environment bindings (WEBSITE_ASSETS)
 * @param {string} siteSlug Canonical site identifier (e.g. 'agentsam-sdk')
 * @returns {Promise<Response>} Transformed response with edge-injected partials
 */
export async function injectSitePartials(response, env, siteSlug = 'agentsam-sdk') {
  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  if (!contentType.includes('text/html')) {
    return response;
  }

  const [headerHtml, footerHtml] = await Promise.all([
    fetchSitePartial(env, siteSlug, 'header'),
    fetchSitePartial(env, siteSlug, 'footer'),
  ]);

  if (!headerHtml && !footerHtml) {
    return response;
  }

  // Use Cloudflare Workers / Node HTMLRewriter
  if (typeof HTMLRewriter === 'undefined') {
    // If HTMLRewriter is not globally available in the runtime, perform string injection fallback
    let text = await response.text();
    if (headerHtml) {
      if (text.includes('<!-- AGENTSAM:IAM_HEADER:START -->')) {
        text = text.replace(
          /<!-- AGENTSAM:IAM_HEADER:START -->[\s\S]*?<!-- AGENTSAM:IAM_HEADER:END -->/,
          headerHtml
        );
      } else {
        text = text.replace(/<body([^>]*)>/i, `<body$1>\n${headerHtml}`);
      }
    }
    if (footerHtml) {
      if (text.includes('<!-- AGENTSAM:IAM_FOOTER:START -->')) {
        text = text.replace(
          /<!-- AGENTSAM:IAM_FOOTER:START -->[\s\S]*?<!-- AGENTSAM:IAM_FOOTER:END -->/,
          footerHtml
        );
      } else {
        text = text.replace(/<\/body>/i, `${footerHtml}\n</body>`);
      }
    }
    const headers = new Headers(response.headers);
    headers.delete('content-length');
    headers.set('x-site-partials-engine', 'string-replace');
    return new Response(text, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  let rewriter = new HTMLRewriter();

  if (headerHtml) {
    rewriter = rewriter.on('body', {
      element(el) {
        el.prepend(headerHtml, { html: true });
      },
    });
  }

  if (footerHtml) {
    rewriter = rewriter.on('body', {
      element(el) {
        el.append(footerHtml, { html: true });
      },
    });
  }

  const rewritten = rewriter.transform(response);
  const outHeaders = new Headers(rewritten.headers);
  outHeaders.set('x-site-partials-engine', 'htmlrewriter');
  return new Response(rewritten.body, {
    status: rewritten.status,
    statusText: rewritten.statusText,
    headers: outHeaders,
  });
}
