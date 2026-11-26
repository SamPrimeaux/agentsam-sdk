import {
  escapeHtml,
  localPath,
  widgetColor,
  widgetConfig,
  widgetFont,
  widgetNumber,
  widgetText,
} from './widget-transport.js';

const ELEMENT_NAME = 'agentsam-customer-account-portal';

function currentStorePath(locationValue) {
  const path = locationValue
    ? `${locationValue.pathname || '/'}${locationValue.search || ''}`
    : '/';
  return localPath(path) || '/';
}

export function registerCustomerAccountPortal(registry = globalThis.customElements, HTMLElementBase = globalThis.HTMLElement) {
  if (!registry || !HTMLElementBase) return null;
  const existing = registry.get(ELEMENT_NAME);
  if (existing) return existing;

  class CustomerAccountPortal extends HTMLElementBase {
    static get observedAttributes() { return ['config']; }

    constructor() {
      super();
      this.portalRoot = this.attachShadow ? this.attachShadow({ mode: 'open' }) : this;
    }

    connectedCallback() {
      this.render();
    }

    attributeChangedCallback() {
      if (this.isConnected) this.render();
    }

    render() {
      const config = widgetConfig(this);
      if (config.enabled !== true) {
        if (this.portalRoot) this.portalRoot.innerHTML = '';
        return;
      }

      const loginLabel = widgetText(config.login_label, 'Sign in', 48);
      const signupLabel = widgetText(config.signup_label, 'Create account', 48);
      const showSignup = config.show_signup !== false;
      const style = config.style === 'link' ? 'link' : 'button';
      const alignment = ({ left: 'flex-start', center: 'center', right: 'flex-end' })[config.alignment] || 'flex-end';
      const accent = widgetColor(config.accent, 'var(--iam-embed-accent, #315a4a)');
      const background = config.background ? widgetColor(config.background, 'transparent') : 'transparent';
      const foreground = config.font_color ? widgetColor(config.font_color, 'currentColor') : 'currentColor';
      const inheritTypography = config.inherit_typography !== false;
      const fontFamily = inheritTypography ? 'inherit' : widgetFont(config.font_family || 'system');
      const fontSize = inheritTypography ? 'inherit' : `${widgetNumber(config.font_size, 12, 22, 16)}px`;
      const radius = widgetNumber(config.border_radius, 0, 32, 16);
      const next = currentStorePath(globalThis.location);
      const query = next === '/' ? '' : `?next=${encodeURIComponent(next)}`;
      const loginHref = `/auth/login${query}`;
      const signupHref = `/auth/signup${query}`;

      this.portalRoot.innerHTML = `
        <style>
          :host { display: block; min-width: 0; }
          .account-actions {
            display: flex;
            align-items: center;
            justify-content: ${alignment};
            flex-wrap: wrap;
            gap: 8px;
            min-width: 0;
            font-family: ${fontFamily};
            font-size: ${fontSize};
          }
          .account-link {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-height: 40px;
            padding: 9px 15px;
            border: 1px solid ${accent};
            border-radius: ${radius}px;
            color: ${foreground};
            background: ${background};
            font: inherit;
            font-weight: 600;
            line-height: 1.2;
            text-decoration: none;
            white-space: nowrap;
            transition: background-color 140ms ease, border-color 140ms ease, color 140ms ease;
          }
          .account-link--primary {
            color: #fff;
            background: ${accent};
          }
          .account-link--secondary { color: ${accent}; }
          .account-link--link {
            min-height: 32px;
            padding: 4px 2px;
            border-color: transparent;
            border-radius: 0;
            color: ${accent};
            background: transparent;
          }
          .account-link:hover { filter: brightness(.94); }
          .account-link:focus-visible { outline: 2px solid ${accent}; outline-offset: 3px; }
          @media (prefers-reduced-motion: reduce) {
            .account-link { transition: none; }
          }
        </style>
        <nav class="account-actions" aria-label="Customer account">
          <a class="account-link ${style === 'button' ? 'account-link--primary' : 'account-link--link'}" href="${escapeHtml(loginHref)}">${escapeHtml(loginLabel)}</a>
          ${showSignup ? `<a class="account-link ${style === 'button' ? 'account-link--secondary' : 'account-link--link'}" href="${escapeHtml(signupHref)}">${escapeHtml(signupLabel)}</a>` : ''}
        </nav>
      `;
    }
  }

  registry.define(ELEMENT_NAME, CustomerAccountPortal);
  return CustomerAccountPortal;
}

if (typeof globalThis.customElements !== 'undefined' && typeof globalThis.HTMLElement !== 'undefined') {
  registerCustomerAccountPortal();
}
