/**
 * Portable OAuth consent view contract.
 *
 * company  = issuer branding SSOT
 * resource = protected API/MCP/product
 * client   = connecting app (ChatGPT, Claude, Cursor, etc.)
 */

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function nullable(value) {
  const v = clean(value);
  return v || null;
}

function safeHttpUrl(value) {
  const raw = nullable(value);
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (!['https:', 'http:'].includes(parsed.protocol)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function safeColor(value, fallback) {
  const raw = clean(value);
  return /^#[0-9a-f]{3,8}$/i.test(raw) ? raw : fallback;
}

export function normalizeOAuthConsentCompany(company = {}) {
  return Object.freeze({
    id: nullable(company.id),
    slug: nullable(company.slug),
    name: clean(company.name) || 'Your App',
    legalName: nullable(company.legalName ?? company.legal_name),
    logoUrl: safeHttpUrl(company.logoUrl ?? company.logo_url),
    faviconUrl: safeHttpUrl(company.faviconUrl ?? company.favicon_url),
    primaryColor: safeColor(company.primaryColor ?? company.primary_color, '#171717'),
    authBgColor: safeColor(company.authBgColor ?? company.auth_bg_color, '#0b1020'),
    websiteUrl: safeHttpUrl(company.websiteUrl ?? company.website_url),
    tagline: nullable(company.tagline),
  });
}

export function normalizeOAuthConsentResource(resource = {}) {
  const audience = clean(resource.audience);
  const displayName = clean(resource.displayName ?? resource.display_name);
  if (!audience) throw new Error('oauth_consent_resource_audience_required');
  if (!displayName) throw new Error('oauth_consent_resource_display_name_required');
  return Object.freeze({
    id: nullable(resource.id),
    audience,
    resourceType: clean(resource.resourceType ?? resource.resource_type) || 'mcp',
    displayName,
    description: nullable(resource.description),
    logoUrl: safeHttpUrl(resource.logoUrl ?? resource.logo_url),
    homepageUrl: safeHttpUrl(resource.homepageUrl ?? resource.homepage_url),
    metadata: resource.metadata && typeof resource.metadata === 'object' ? resource.metadata : {},
  });
}

export function normalizeOAuthConsentClient(client = {}) {
  const clientId = clean(client.clientId ?? client.client_id);
  const displayName = clean(client.displayName ?? client.display_name ?? client.name);
  if (!clientId) throw new Error('oauth_consent_client_id_required');
  if (!displayName) throw new Error('oauth_consent_client_display_name_required');
  return Object.freeze({
    clientId,
    displayName,
    logoUrl: safeHttpUrl(client.logoUrl ?? client.logo_url),
    homepageUrl: safeHttpUrl(client.homepageUrl ?? client.homepage_url),
  });
}

export function normalizeOAuthConsentScope(scope = {}, index = 0) {
  const key = clean(scope.scope);
  if (!key) throw new Error(`oauth_consent_scope_required:${index}`);
  const sensitivity = clean(scope.sensitivity);
  return Object.freeze({
    scope: key,
    label: clean(scope.label) || key,
    description: clean(scope.description) || key,
    category: clean(scope.category) || 'general',
    sensitivity: ['normal', 'elevated', 'sensitive'].includes(sensitivity) ? sensitivity : 'normal',
    required: Boolean(scope.required),
    sortOrder: Number.isFinite(Number(scope.sortOrder ?? scope.sort_order))
      ? Number(scope.sortOrder ?? scope.sort_order)
      : 50,
  });
}

export function buildOAuthConsentView(input = {}) {
  const issuer = normalizeOAuthConsentCompany(input.company || input.issuer || {});
  const resource = normalizeOAuthConsentResource(input.resource || {});
  const client = normalizeOAuthConsentClient(input.client || {});
  const scopes = (Array.isArray(input.scopes) ? input.scopes : [])
    .map(normalizeOAuthConsentScope)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.scope.localeCompare(b.scope));

  return Object.freeze({
    schemaVersion: 'agentsam.identity.oauth-consent.v1',
    issuer,
    resource,
    client,
    scopes,
    signedInEmail: nullable(input.signedInEmail ?? input.signed_in_email),
    authorization: Object.freeze({
      id: nullable(input.authorization?.id),
      expiresAt: input.authorization?.expiresAt ?? input.authorization?.expires_at ?? null,
    }),
    copy: Object.freeze({
      headline: `${resource.displayName} wants to connect to ${client.displayName}`,
      helper: resource.description || `${client.displayName} is requesting access to ${resource.displayName}.`,
      footer: `Authorization secured by ${issuer.name}`,
    }),
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function consentMark(entity, className) {
  const label = clean(entity?.displayName ?? entity?.name) || '?';
  if (entity?.logoUrl) {
    return `<img class="${className}" src="${escapeHtml(entity.logoUrl)}" alt="${escapeHtml(label)}" />`;
  }
  const initials = label
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] || '')
    .join('')
    .toUpperCase();
  return `<span class="${className} ${className}--fallback" aria-hidden="true">${escapeHtml(initials || '?')}</span>`;
}

/**
 * Render the portable OAuth consent card.
 *
 * Presentation is fixed/trusted code. D1/company supplies safe brand values,
 * never arbitrary CSS or HTML.
 */
export function renderOAuthConsentHtml(viewInput, options = {}) {
  const view = viewInput?.schemaVersion
    ? viewInput
    : buildOAuthConsentView(viewInput);

  const action = clean(options.action) || '/api/oauth/consent';
  const authorizationId = nullable(
    options.authorizationId ??
    options.authorization_id ??
    view.authorization?.id
  );
  const csrfToken = nullable(options.csrfToken ?? options.csrf_token);

  const issuerLogo = consentMark(
    { ...view.issuer, displayName: view.issuer.name },
    'consent-issuer-logo',
  );
  const resourceLogo = consentMark(view.resource, 'consent-resource-logo');
  const clientLogo = consentMark(view.client, 'consent-client-logo');

  const scopes = view.scopes.map((scope) => `
          <li class="consent-scope" data-sensitivity="${escapeHtml(scope.sensitivity)}">
            <span class="consent-scope-dot" aria-hidden="true"></span>
            <span class="consent-scope-copy">
              <strong>${escapeHtml(scope.label)}${scope.required ? ' <small>Required</small>' : ''}</strong>
              <span>${escapeHtml(scope.description)}</span>
            </span>
          </li>`).join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <title>${escapeHtml(view.copy.headline)}</title>
  ${view.issuer.faviconUrl ? `<link rel="icon" href="${escapeHtml(view.issuer.faviconUrl)}" />` : ''}
  <style>
    :root {
      --consent-brand: ${escapeHtml(view.issuer.primaryColor)};
      --consent-bg: ${escapeHtml(view.issuer.authBgColor)};
      --consent-ink: #171a1f;
      --consent-muted: #6d7480;
      --consent-line: #e7e9ed;
      --consent-panel: rgba(255,255,255,.97);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      padding: 28px;
      display: grid;
      place-items: center;
      background: var(--consent-bg);
      color: var(--consent-ink);
      font: 14px/1.45 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .consent-card {
      width: min(460px, 100%);
      overflow: hidden;
      border: 1px solid rgba(255,255,255,.48);
      border-radius: 18px;
      background: var(--consent-panel);
      box-shadow: 0 28px 90px rgba(0,0,0,.28);
      backdrop-filter: blur(18px);
    }
    .consent-issuer {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 18px 22px;
      border-bottom: 1px solid var(--consent-line);
      color: #68707b;
      font-size: 11px;
      font-weight: 750;
      letter-spacing: .12em;
      text-transform: uppercase;
    }
    .consent-issuer-logo,
    .consent-resource-logo,
    .consent-client-logo {
      display: grid;
      place-items: center;
      object-fit: contain;
      background: #fff;
      border: 1px solid #dfe3e8;
      border-radius: 10px;
      color: #30343a;
      font-weight: 800;
    }
    .consent-issuer-logo { width: 28px; height: 28px; font-size: 10px; }
    .consent-resource-logo { width: 44px; height: 44px; font-size: 11px; }
    .consent-client-logo { width: 28px; height: 28px; font-size: 10px; }
    .consent-main { padding: 22px; }
    .consent-resource {
      display: flex;
      gap: 12px;
      align-items: center;
      margin-bottom: 18px;
    }
    .consent-resource strong { display: block; font-size: 15px; }
    .consent-resource span {
      display: block;
      max-width: 330px;
      margin-top: 2px;
      overflow-wrap: anywhere;
      color: #747c87;
      font-size: 12px;
    }
    .consent-title {
      margin: 0 0 8px;
      font-size: 18px;
      line-height: 1.25;
      letter-spacing: -.015em;
    }
    .consent-helper { margin: 0 0 16px; color: var(--consent-muted); }
    .consent-client {
      display: flex;
      align-items: center;
      gap: 9px;
      margin: 0 0 16px;
      padding: 11px 12px;
      border-radius: 11px;
      background: #f5f6f8;
    }
    .consent-client strong { font-size: 13px; }
    .consent-signed-in {
      margin: 0 0 16px;
      color: #747c87;
      font-size: 12px;
    }
    .consent-signed-in b { color: #31363d; }
    .consent-section-label {
      margin: 16px 0 8px;
      color: #777f89;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: .1em;
      text-transform: uppercase;
    }
    .consent-scopes {
      margin: 0;
      padding: 0;
      list-style: none;
      border-top: 1px solid #edf0f2;
    }
    .consent-scope {
      display: grid;
      grid-template-columns: 10px 1fr;
      gap: 10px;
      padding: 12px 2px;
      border-bottom: 1px solid #edf0f2;
    }
    .consent-scope-dot {
      width: 7px;
      height: 7px;
      margin-top: 6px;
      border-radius: 50%;
      background: var(--consent-brand);
    }
    .consent-scope[data-sensitivity="sensitive"] .consent-scope-dot { background: #b7791f; }
    .consent-scope-copy strong { display: block; font-size: 13px; }
    .consent-scope-copy strong small {
      color: #777f89;
      font-size: 10px;
      font-weight: 650;
    }
    .consent-scope-copy > span {
      display: block;
      margin-top: 2px;
      color: #747c87;
      font-size: 12px;
    }
    .consent-actions {
      display: grid;
      gap: 8px;
      margin-top: 20px;
    }
    .consent-actions button {
      border: 0;
      border-radius: 9px;
      padding: 11px 14px;
      cursor: pointer;
      font: inherit;
      font-weight: 750;
    }
    .consent-authorize { background: var(--consent-brand); color: #fff; }
    .consent-cancel { background: transparent; color: #5f6670; }
    .consent-footer {
      padding: 14px 22px 18px;
      border-top: 1px solid #edf0f2;
      color: #8a929c;
      font-size: 11px;
      text-align: center;
    }
  </style>
</head>
<body>
  <article class="consent-card">
    <header class="consent-issuer">${issuerLogo}<span>${escapeHtml(view.issuer.name)}</span></header>
    <main class="consent-main">
      <div class="consent-resource">
        ${resourceLogo}
        <div>
          <strong>${escapeHtml(view.resource.displayName)}</strong>
          <span>${escapeHtml(view.resource.audience)}</span>
        </div>
      </div>

      <h1 class="consent-title">${escapeHtml(view.copy.headline)}</h1>
      <p class="consent-helper">${escapeHtml(view.copy.helper)}</p>

      <div class="consent-client">
        ${clientLogo}
        <strong>${escapeHtml(view.client.displayName)}</strong>
      </div>

      ${view.signedInEmail
        ? `<p class="consent-signed-in">Signed in as <b>${escapeHtml(view.signedInEmail)}</b></p>`
        : ''}

      <p class="consent-section-label">Access requested</p>
      <ul class="consent-scopes">${scopes || '<li class="consent-scope"><span class="consent-scope-dot"></span><span class="consent-scope-copy"><strong>No additional scopes</strong></span></li>'}</ul>

      <form class="consent-actions" action="${escapeHtml(action)}" method="post">
        ${authorizationId ? `<input type="hidden" name="authorization_id" value="${escapeHtml(authorizationId)}" />` : ''}
        ${csrfToken ? `<input type="hidden" name="csrf_token" value="${escapeHtml(csrfToken)}" />` : ''}
        <button class="consent-authorize" type="submit" name="decision" value="approve">Authorize</button>
        <button class="consent-cancel" type="submit" name="decision" value="deny">Cancel</button>
      </form>
    </main>
    <footer class="consent-footer">${escapeHtml(view.copy.footer)}</footer>
  </article>
</body>
</html>`;
}
