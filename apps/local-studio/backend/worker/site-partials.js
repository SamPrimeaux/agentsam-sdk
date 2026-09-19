/**
 * Canonical Site Partials & Edge HTMLRewriter Injection Service.
 *
 * Injects shared site partials (header.html, footer.html) from the
 * WEBSITE_ASSETS R2 bucket (agentsam-os-blueprint-content) into page HTML at serve time.
 * Layout in R2:
 *   sites/${siteSlug}/partials/header.html
 *   sites/${siteSlug}/partials/footer.html
 *
 * This keeps header/footer as one shared object per site, edited once,
 * never duplicated across individual pages or CMS page tables.
 */

export async function fetchSitePartial(env, siteSlug, partialName) {
  if (!env?.WEBSITE_ASSETS) return null;
  try {
    const key = `sites/${siteSlug}/partials/${partialName}.html`;
    const obj = await env.WEBSITE_ASSETS.get(key);
    if (!obj) return null;
    return await obj.text();
  } catch (err) {
    console.error(`Failed to fetch partial ${partialName} for site ${siteSlug}:`, err);
    return null;
  }
}

export async function putSitePartial(env, siteSlug, partialName, content) {
  if (!env?.WEBSITE_ASSETS) throw new Error('WEBSITE_ASSETS binding not available');
  const key = `sites/${siteSlug}/partials/${partialName}.html`;
  await env.WEBSITE_ASSETS.put(key, content, {
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
