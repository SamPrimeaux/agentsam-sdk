/* <agentsam-store-chat> - dependency-free storefront chat. Colors come from the
 * host theme tokens (--color-accent, --color-bg, --color-text) unless the
 * merchant sets explicit values in the embed editor. */
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export class AgentSamStoreChat extends HTMLElement {
  static get observedAttributes() { return ['config']; }
  connectedCallback() { this.render(); }
  attributeChangedCallback() { if (this.isConnected) this.render(); }
  get cfg() { try { return JSON.parse(this.getAttribute('config') || '{}'); } catch { return {}; } }
  render() {
    const c = this.cfg;
    if (c.enabled === false) { this.replaceChildren(); return; }
    const accent = c.accent || 'var(--color-accent, currentColor)';
    const bg = c.background || 'var(--color-bg, Canvas)';
    const fg = c.font_color || 'var(--color-text, CanvasText)';
    const [btnBg, btnFg] = c.invert_colors ? [fg, bg] : [accent, bg];
    const side = c.horizontal_position === 'left' ? 'left:16px' : c.horizontal_position === 'center' ? 'left:50%;transform:translateX(-50%)' : 'right:16px';
    const rise = { lowest: 16, higher: 72, highest: 128 }[c.vertical_position] ?? 16;
    const font = c.inherit_typography === false ? '' : 'font-family:inherit;';
    this.innerHTML = `<style>
      .asc{position:fixed;${side};bottom:${rise}px;z-index:2147483000;${font}font-size:${Number(c.font_size) || 16}px;color:${fg}}
      .asc-btn{display:flex;align-items:center;gap:8px;border:0;cursor:pointer;padding:12px 16px;border-radius:${Number(c.border_radius) || 16}px;background:${btnBg};color:${btnFg};font:inherit}
      .asc-panel{width:min(360px,calc(100vw - 32px));margin-bottom:12px;padding:16px;border-radius:${Number(c.border_radius) || 16}px;background:${bg};box-shadow:0 8px 32px rgb(0 0 0/.18)}
      .asc-panel[hidden]{display:none}.asc-log{max-height:240px;overflow:auto;margin:0 0 12px}.asc-log p{margin:0 0 8px}
      .asc-form{display:flex;gap:8px}.asc-form input{flex:1;padding:10px;border-radius:${Math.max(4, (Number(c.border_radius) || 16) - 6)}px;border:1px solid currentColor;background:transparent;color:inherit;font:inherit}
    </style><div class="asc"><div class="asc-panel" hidden role="dialog" aria-label="${esc(c.label || 'Chat')}">
      <div class="asc-log" aria-live="polite"><p>${esc(c.greeting)}</p></div>
      <form class="asc-form">${c.require_email ? '<input name="email" type="email" placeholder="Email" required>' : ''}<input name="message" placeholder="Ask anything..." required><button class="asc-btn" type="submit">Send</button></form>
    </div><button class="asc-btn asc-toggle" type="button" aria-expanded="false">${esc(c.label || 'Chat')}</button></div>`;
    const panel = this.querySelector('.asc-panel'), toggle = this.querySelector('.asc-toggle'), log = this.querySelector('.asc-log');
    toggle.addEventListener('click', () => { panel.hidden = !panel.hidden; toggle.setAttribute('aria-expanded', String(!panel.hidden)); });
    this.querySelector('form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const data = Object.fromEntries(new FormData(ev.currentTarget));
      log.insertAdjacentHTML('beforeend', `<p><strong>${esc(data.message)}</strong></p>`);
      ev.currentTarget.elements.message.value = '';
      try {
        if (c.endpoint) await fetch(c.endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...data, page: location.pathname }) });
      } catch { /* non-fatal: message stays visible, host can retry */ }
    });
  }
}
if (typeof customElements !== 'undefined' && !customElements.get('agentsam-store-chat')) customElements.define('agentsam-store-chat', AgentSamStoreChat);
