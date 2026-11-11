import {
  acceptSubmission, escapeHtml, localPath, submissionTransport, widgetColor, widgetConfig, widgetNumber,
} from './widget-transport.js';

export class AgentSamStoreChat extends HTMLElement {
  static get observedAttributes() { return ['config']; }

  constructor() {
    super();
    this.attachShadow({mode:'open'});
  }

  connectedCallback() { this.render(); }
  attributeChangedCallback() { if (this.isConnected) this.render(); }

  render() {
    const config = widgetConfig(this);
    const root = this.shadowRoot;
    if (config.enabled !== true) { root.replaceChildren(); return; }
    const foreground = widgetColor(config.font_color, 'var(--color-text, CanvasText)');
    const background = widgetColor(config.background, 'var(--color-bg, Canvas)');
    const accent = widgetColor(config.accent, 'var(--color-accent, CanvasText)');
    const radius = widgetNumber(config.border_radius, 0, 32, 16);
    const fontSize = widgetNumber(config.font_size, 12, 24, 16);
    const offset = new Map([['lowest', 16], ['higher', 52], ['highest', 88]]).get(config.vertical_position) ?? 16;
    const position = config.horizontal_position === 'left' ? 'left:16px' :
      config.horizontal_position === 'center' ? 'left:50%;transform:translateX(-50%)' : 'right:16px';
    const label = escapeHtml(config.label || 'Chat');
    const icon = config.icon === 'message'
      ? '<path d="M3 6h18v12H3z M3 7l9 6 9-6"/>'
      : config.icon === 'help'
        ? '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 4 2.83c-1 .38-1 1.17-1 2.17m0 2v1"/>'
        : '<path d="M4 5h16v11H9l-5 3V5z"/>';
    const featured = config.show_featured_products && Array.isArray(config.featured_products) && Array.isArray(this.products)
      ? this.products.filter(product => product && config.featured_products.includes(product.id) && localPath(product.href)).slice(0, 4)
      : [];
    root.innerHTML = `<style>
      :host{--asc-bg:${background};--asc-fg:${foreground};--asc-accent:${accent};--asc-radius:${radius}px}
      button,input,textarea{font:inherit;color:inherit}button{cursor:pointer;min-height:44px}
      .anchor{position:fixed;${position};bottom:calc(${offset}px + env(safe-area-inset-bottom,0px))}
      .launcher{z-index:20;display:flex;align-items:center;gap:.45rem;padding:8px 16px;max-width:calc(100vw - 32px);border:1px solid currentColor;border-radius:var(--asc-radius);background:${config.invert_colors ? 'var(--asc-bg)' : 'var(--asc-accent)'};color:${config.invert_colors ? 'var(--asc-fg)' : 'var(--asc-bg)'}}
      .launcher.bar{min-width:min(13rem,calc(100vw - 32px))}
      dialog{inset:auto;margin:0;box-sizing:border-box;width:min(360px,calc(100vw - 32px));max-height:calc(100dvh - ${offset}px - 24px);overflow:auto;padding:16px;border:1px solid currentColor;border-radius:var(--asc-radius);background:var(--asc-bg);color:var(--asc-fg);font-family:${config.inherit_typography === false ? 'system-ui,sans-serif' : 'inherit'};font-size:${fontSize}px;box-shadow:0 10px 38px #0003}
      dialog::backdrop{background:#0003}
      header{display:flex;justify-content:space-between;align-items:center;gap:1rem}
      header h2{font-size:1.15em;margin:0}header button{min-width:44px;background:transparent;border:0;font-size:1.3em}
      form,label{display:grid;gap:.45rem}form{gap:.75rem}input,textarea{min-height:44px;padding:.45rem;border:1px solid currentColor;border-radius:5px;background:transparent}
      form button{background:var(--asc-fg);color:var(--asc-bg);border:1px solid currentColor;border-radius:5px}form button:disabled{opacity:.6}
      :focus-visible{outline:2px solid currentColor;outline-offset:3px}
    </style>
    <button class="anchor launcher${config.style === 'message_bar' ? ' bar' : ''}" type="button" aria-haspopup="dialog" aria-controls="chat" aria-expanded="false">
      <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7">${icon}</svg>${label}
    </button>
    <dialog id="chat" class="anchor" aria-labelledby="chat-title">
      <header><h2 id="chat-title">Store inbox</h2><button type="button" aria-label="Close chat">×</button></header>
      <p>${escapeHtml(config.greeting || 'How can we help?')}</p>
      ${featured.length ? '<ul aria-label="Featured products">'+featured.map(product =>
        '<li><a href="'+escapeHtml(product.href)+'">'+escapeHtml(product.label)+'</a></li>').join('')+'</ul>' : ''}
      <form>
        ${config.require_email ? '<label>Email<input name="email" type="email" autocomplete="email" maxlength="254" required></label>' : ''}
        <label>Message<textarea name="message" maxlength="2000" rows="3" required></textarea></label>
        <button type="submit">Send message</button>
        <span role="status"></span>
      </form>
    </dialog>`;
    const dialog = root.querySelector('dialog');
    const launcher = root.querySelector('.launcher');
    launcher.addEventListener('click', () => {
      dialog.showModal();
      launcher.setAttribute('aria-expanded', 'true');
    });
    dialog.addEventListener('close', () => {
      launcher.setAttribute('aria-expanded', 'false');
      launcher.focus();
    });
    root.querySelector('header button').addEventListener('click', () => dialog.close());
    const form = root.querySelector('form');
    const button = form.querySelector('button');
    const status = form.querySelector('[role="status"]');
    const transport = submissionTransport(this, config.endpoint);
    if (!transport) {
      button.disabled = true;
      status.textContent = 'Messaging is currently unavailable.';
    }
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!transport || button.disabled) return;
      const fields = new FormData(form);
      const message = String(fields.get('message') || '').trim();
      if (!message) { status.textContent = 'Enter a message.'; return; }
      button.disabled = true;
      status.textContent = 'Sending…';
      try {
        await acceptSubmission(transport, {kind:'inbox', email:String(fields.get('email') || '').trim(), message});
        form.reset();
        status.textContent = 'Message received.';
      } catch {
        status.textContent = 'Could not send. Your message is still here.';
      } finally {
        button.disabled = false;
      }
    });
  }
}

if (!customElements.get('agentsam-store-chat')) customElements.define('agentsam-store-chat', AgentSamStoreChat);
