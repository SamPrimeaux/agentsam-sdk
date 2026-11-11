import { acceptSubmission, escapeHtml, submissionTransport, widgetConfig, widgetColor } from './widget-transport.js';

const fields = new Map([
  ['first_name', ['First name', 'given-name', 'text', 100]], ['last_name', ['Last name', 'family-name', 'text', 100]],
  ['email', ['Email', 'email', 'email', 254]], ['phone', ['Phone', 'tel', 'tel', 40]],
  ['message', ['Message', '', 'textarea', 2000]],
]);

export class AgentSamStoreForm extends HTMLElement {
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
    const signup = config.kind === 'signup';
    const included = new Set(Array.isArray(config.fields) ? config.fields : ['email', 'message']);
    if (signup) { included.add('email'); included.delete('message'); }
    const required = new Set(Array.isArray(config.required_fields) ? config.required_fields : []);
    if (signup) required.add('email');
    const inputs = [...fields].filter(([key]) => included.has(key)).map(([key, [label, autocomplete, type, length]]) =>
      '<label>'+label+(type === 'textarea'
        ? '<textarea name="'+key+'" rows="4" maxlength="'+length+'"'+(required.has(key)?' required':'')+'></textarea>'
        : '<input name="'+key+'" type="'+type+'" autocomplete="'+autocomplete+'" maxlength="'+length+'"'+(required.has(key)?' required':'')+'>')+'</label>').join('');
    const background = widgetColor(config.background, 'var(--color-bg, Canvas)');
    const foreground = widgetColor(config.font_color, 'var(--color-text, CanvasText)');
    const accent = widgetColor(config.accent, 'var(--color-accent, CanvasText)');
    root.innerHTML = `<style>
      :host{display:block;--asf-bg:${background};--asf-fg:${foreground};--asf-accent:${accent}}
      section{padding:clamp(14px,4vw,24px);background:var(--asf-bg);color:var(--asf-fg)}
      h2{margin:0 0 .4rem;font-size:1.2em}form,label{display:grid;gap:.35rem}form{gap:.75rem}
      input,textarea,button{font:inherit;color:inherit}input:not([type=checkbox]),textarea,button{box-sizing:border-box;min-height:44px;padding:.45rem;border:1px solid currentColor;border-radius:6px;background:transparent}
      button{background:${config.invert_colors ? 'var(--asf-bg)' : 'var(--asf-accent)'};color:${config.invert_colors ? 'var(--asf-fg)' : 'var(--asf-bg)'};cursor:pointer}button:disabled{opacity:.6}
      .consent{display:flex;align-items:center}.consent input{margin-inline-end:.4rem}
      :focus-visible{outline:2px solid currentColor;outline-offset:3px}
    </style><section aria-labelledby="form-title"><h2 id="form-title">${escapeHtml(config.heading || (signup?'Get updates':'Contact us'))}</h2>
    ${config.subtitle ? '<p>'+escapeHtml(config.subtitle)+'</p>' : ''}
    <form>${inputs}
    ${signup ? '<label class="consent"><input type="checkbox" name="consent" value="yes" required>'+escapeHtml(config.consent_text || 'I agree to receive updates.')+'</label>' : ''}
    <button type="submit">${escapeHtml(config.button_label || 'Send')}</button><span role="status"></span></form></section>`;
    const form = root.querySelector('form');
    const status = form.querySelector('[role="status"]');
    const button = form.querySelector('button');
    const transport = submissionTransport(this, config.endpoint);
    if (!transport) {
      button.disabled = true;
      status.textContent = 'Submissions are currently unavailable.';
    }
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!transport || button.disabled) return;
      const values = new FormData(form);
      if (signup && values.get('consent') !== 'yes') return;
      const data = Object.fromEntries([...fields.keys()].filter(key => included.has(key))
        .map(key => [key,String(values.get(key) || '').trim()]));
      const payload = signup
        ? {...data, kind:'signup', consent:true, campaign_ref:String(config.campaign_ref || '').slice(0,160)}
        : {...data, kind:'contact'};
      button.disabled = true;
      status.textContent = 'Sending…';
      try {
        const receipt = await acceptSubmission(transport, payload);
        form.reset();
        status.textContent = receipt.status === 'confirmation_required' ? 'Check your email to confirm.'
          : config.success_message || (signup ? 'Signup received.' : 'Message received.');
      } catch {
        status.textContent = 'Could not send. Your entries are still here.';
      } finally {
        button.disabled = false;
      }
    });
  }
}

if (!customElements.get('agentsam-store-form')) customElements.define('agentsam-store-form', AgentSamStoreForm);
