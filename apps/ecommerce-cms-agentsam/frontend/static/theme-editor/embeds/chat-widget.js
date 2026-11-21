import {
  acceptSubmission, escapeHtml, localPath, submissionTransport, widgetColor, widgetConfig, widgetFont,
  widgetImage, widgetNumber, widgetText,
} from './widget-transport.js';

const ICONS = {
  chat_bubble: '<path d="M4 5h16v11H9l-5 3V5z"/>',
  message: '<path d="M3 6h18v12H3z M3 7l9 6 9-6"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 4 2.83c-1 .38-1 1.17-1 2.17m0 2v1"/>',
};
const svg = (name, size) => `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7">${ICONS[name] || ICONS.chat_bubble}</svg>`;

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
    const weight = widgetNumber(config.heading_weight, 400, 800, 600);
    const family = widgetFont(config.font_family, config.inherit_typography);
    const offset = new Map([['lowest', 16], ['higher', 52], ['highest', 88]]).get(config.vertical_position) ?? 16;
    const position = config.horizontal_position === 'left' ? 'left:16px' :
      config.horizontal_position === 'center' ? 'left:50%;transform:translateX(-50%)' : 'right:16px';
    const text = (key, fallback, max) => widgetText(config[key], fallback, max);
    const label = escapeHtml(text('label', 'Chat', 24));
    const image = widgetImage(config.image);
    const imageLauncher = config.icon === 'image' && image;
    const launcherBackground = widgetColor(config.icon_background, '') ||
      (config.invert_colors ? 'var(--asc-bg)' : 'var(--asc-accent)');
    const launcherForeground = widgetColor(config.icon_color, '') ||
      (config.invert_colors ? 'var(--asc-fg)' : 'var(--asc-bg)');
    const filled = config.header_style !== 'plain';
    const featured = config.show_featured_products && Array.isArray(config.featured_products) && Array.isArray(this.products)
      ? this.products.filter(product => product && config.featured_products.includes(product.id) && localPath(product.href)).slice(0, 4)
      : [];
    const avatar = image
      ? `<img src="${escapeHtml(image)}" alt="" width="36" height="36">`
      : svg(config.icon, 20);
    const launcherMark = imageLauncher
      ? `<img class="mark" src="${escapeHtml(image)}" alt="" width="24" height="24">`
      : svg(config.icon, 19);
    const successMessage = text('success_message', 'Message received.', 160);
    root.innerHTML = `<style>
      :host{--asc-bg:${background};--asc-fg:${foreground};--asc-accent:${accent};--asc-radius:${radius}px}
      button,input,textarea{font:inherit;color:inherit}button{cursor:pointer;min-height:44px}
      .anchor{position:fixed;${position};bottom:calc(${offset}px + env(safe-area-inset-bottom,0px));font-family:${family}}
      .launcher{z-index:20;display:flex;align-items:center;gap:.45rem;padding:8px 16px;max-width:calc(100vw - 32px);border:1px solid currentColor;border-radius:var(--asc-radius);background:${launcherBackground};color:${launcherForeground}}
      .launcher.bar{min-width:min(13rem,calc(100vw - 32px))}
      .mark{width:24px;height:24px;border-radius:50%;object-fit:cover}
      dialog{inset:auto;margin:0;box-sizing:border-box;width:min(360px,calc(100vw - 32px));max-height:calc(100dvh - ${offset}px - 24px);padding:0;overflow:hidden;border:1px solid currentColor;border-radius:var(--asc-radius);background:var(--asc-bg);color:var(--asc-fg);font-size:${fontSize}px;box-shadow:0 10px 38px #0003}
      dialog[open]{display:flex;flex-direction:column}
      dialog::backdrop{background:#0003}
      header{display:flex;align-items:center;gap:.65rem;padding:12px 8px 12px 14px;${filled
        ? 'background:var(--asc-accent);color:var(--asc-bg)'
        : 'border-bottom:1px solid color-mix(in srgb,currentColor 18%,transparent)'}}
      .avatar{flex:none;display:grid;place-items:center;width:36px;height:36px;border-radius:50%;overflow:hidden;background:color-mix(in srgb,currentColor 16%,transparent)}
      .avatar img{width:100%;height:100%;object-fit:cover}
      header h2{flex:1;min-width:0;font-size:1.1em;font-weight:${weight};margin:0;overflow-wrap:anywhere}
      header button{min-width:44px;background:transparent;border:0;font-size:1.4em;color:inherit}
      header button:focus-visible{outline-offset:-6px;border-radius:50%}
      .body{display:grid;gap:.75rem;padding:14px;overflow:auto}
      .thread{display:grid;gap:.5rem}
      .bubble{max-width:85%;margin:0;padding:.55rem .75rem;border-radius:calc(var(--asc-radius) * .75);background:color-mix(in srgb,var(--asc-fg) 9%,var(--asc-bg));white-space:pre-wrap;overflow-wrap:anywhere}
      .bubble.me{justify-self:end;background:var(--asc-accent);color:var(--asc-bg)}
      ul{margin:0;padding-left:1.1rem}
      form,label{display:grid;gap:.4rem}form{gap:.65rem}
      label{font-size:.85em}
      input,textarea{min-height:44px;padding:.45rem .6rem;font-size:1rem;border:1px solid color-mix(in srgb,currentColor 35%,transparent);border-radius:calc(var(--asc-radius) * .4);background:transparent}
      form button{background:var(--asc-accent);color:var(--asc-bg);border:1px solid transparent;border-radius:calc(var(--asc-radius) * .4);font-weight:${weight}}
      form button:disabled{opacity:.6}
      [role="status"]:empty{display:none}
      :focus-visible{outline:2px solid currentColor;outline-offset:3px}
    </style>
    <button class="anchor launcher${config.style === 'message_bar' ? ' bar' : ''}" type="button" aria-haspopup="dialog" aria-controls="chat" aria-expanded="false">
      ${launcherMark}${label}
    </button>
    <dialog id="chat" class="anchor" aria-labelledby="chat-title">
      <header><span class="avatar">${avatar}</span><h2 id="chat-title">${escapeHtml(text('header_label', 'Chat with us', 60))}</h2><button type="button" aria-label="Close chat">×</button></header>
      <div class="body">
        <div class="thread" role="log" aria-live="polite">
          <p class="bubble">${escapeHtml(text('greeting', 'How can we help?', 400))}</p>
        </div>
        ${featured.length ? '<ul aria-label="Featured products">'+featured.map(product =>
          '<li><a href="'+escapeHtml(product.href)+'">'+escapeHtml(product.label)+'</a></li>').join('')+'</ul>' : ''}
        <form>
          ${config.require_email ? `<label>${escapeHtml(text('email_label', 'Email', 40))}<input name="email" type="email" autocomplete="email" maxlength="254" required></label>` : ''}
          <label>${escapeHtml(text('message_label', 'Message', 40))}<textarea name="message" maxlength="2000" rows="3" placeholder="${escapeHtml(widgetText(config.placeholder, '', 80))}" required></textarea></label>
          <button type="submit">${escapeHtml(text('send_label', 'Send message', 32))}</button>
          <span role="status"></span>
        </form>
      </div>
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
    const thread = root.querySelector('.thread');
    const button = form.querySelector('button');
    const status = form.querySelector('[role="status"]');
    const transport = submissionTransport(this, config.endpoint);
    const bubble = (content, mine) => {
      const node = document.createElement('p');
      node.className = mine ? 'bubble me' : 'bubble';
      node.textContent = content;
      thread.append(node);
      node.scrollIntoView?.({block:'nearest'});
    };
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
        form.elements.message.value = '';
        status.textContent = '';
        bubble(message, true);
        bubble(successMessage, false);
      } catch {
        status.textContent = 'Could not send. Your message is still here.';
      } finally {
        button.disabled = false;
      }
    });
  }
}

if (!customElements.get('agentsam-store-chat')) customElements.define('agentsam-store-chat', AgentSamStoreChat);
