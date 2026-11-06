/**
 * Stock page types every site is always offered (site → theme → stock).
 * inheritDefaultTemplates() adds these only where a site has no authored page.
 *
 * Rules this file keeps:
 *  - Copy is neutral and every string is an editable field. No brand, no fixtures.
 *  - Look is tokens only (--iam-ink / --iam-paper / --iam-accent / --iam-display).
 *  - Behavior never lives in a template. Forms declare data-adapter="domain.verb"
 *    and STOCK_ADAPTERS is the one map of what each adapter calls.
 *    backend:true means the route exists in backend/store/api.js (a test enforces it).
 */
export const STOCK_ADAPTERS = {
  'checkout.discount': { method: 'POST', path: '/api/store/discounts/validate', backend: true },
  'checkout.session': { method: 'POST', path: '/api/store/checkout/session', backend: true },
  'customer.sign-in': { method: 'POST', path: '/api/store/customer/sign-in', backend: false },
  'customer.sign-up': { method: 'POST', path: '/api/store/customer/sign-up', backend: false },
  'customer.sign-out': { method: 'POST', path: '/api/store/customer/sign-out', backend: false },
  'customer.session': { method: 'GET', path: '/api/store/customer/session', backend: false },
  'customer.orders': { method: 'GET', path: '/api/store/customer/orders', backend: false },
  'giftcard.purchase': { method: 'POST', path: '/api/store/gift-cards', backend: false },
  'access.verify': { method: 'POST', path: '/api/store/access', backend: false },
};

const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const text = (c, key, tag = 'span', attrs = '') =>
  `<${tag}${attrs} data-theme-project-field="${key}">${esc(c[key])}</${tag}>`;
const copyContent = copy => Object.fromEntries(Object.entries(copy).map(([key, [, value]]) => [key, value]));
const copyFields = copy => Object.entries(copy).map(([key, [label, , extra]]) => ({ key, label, type: 'text', ...extra }));
const link = field => ({ type: 'link', binding: { field, attribute: 'href' } });
const status = '<p class="stk-status" role="status" aria-live="polite" data-adapter-status></p>';
const failure = c => `<p class="stk-failure" hidden data-adapter-error data-theme-project-field="error">${esc(c.error)}</p>`;
const input = (c, { label, name, type = 'text', autocomplete, attrs = '' }) =>
  `<label class="stk-field">${text(c, label)}<input name="${name}" type="${type}"${autocomplete ? ` autocomplete="${autocomplete}"` : ''} required${attrs}></label>`;
const head = c => `${text(c, 'eyebrow', 'p', ' class="stk-eyebrow"')}${text(c, 'heading', 'h1')}${text(c, 'body', 'p', ' class="stk-lede"')}`;

const auth = ({ copy, adapter, redirect, inputs }) => {
  const c = copyContent(copy);
  return {
    content: c,
    fields: copyFields(copy),
    html: `<div class="stk-page stk-auth"><div class="stk-card">
      ${head(c)}
      <form class="stk-form" data-adapter="${adapter}" data-adapter-redirect="${redirect}">
        ${inputs.map(item => input(c, item)).join('')}
        ${text(c, 'button', 'button', ' type="submit" class="stk-btn"')}
        ${status}${failure(c)}
      </form>
      ${copy.alt_label ? text(c, 'alt_label', 'a', ` class="stk-alt" href="${esc(c.alt_href)}"`) : ''}
    </div></div>`,
  };
};

const signIn = auth({
  adapter: 'customer.sign-in', redirect: '/account',
  copy: {
    eyebrow: ['Eyebrow', 'Account'],
    heading: ['Heading', 'Sign in'],
    body: ['Description', 'Welcome back. Sign in to view your orders and details.'],
    email_label: ['Email label', 'Email'],
    password_label: ['Password label', 'Password'],
    button: ['Button label', 'Sign in'],
    alt_label: ['Secondary link label', 'New here? Create an account'],
    alt_href: ['Secondary link', '/sign-up', link('alt_label')],
    error: ['Error message', 'We couldn’t sign you in. Check your details and try again.'],
  },
  inputs: [
    { label: 'email_label', name: 'email', type: 'email', autocomplete: 'email' },
    { label: 'password_label', name: 'password', type: 'password', autocomplete: 'current-password' },
  ],
});

const signUp = auth({
  adapter: 'customer.sign-up', redirect: '/account',
  copy: {
    eyebrow: ['Eyebrow', 'Account'],
    heading: ['Heading', 'Create your account'],
    body: ['Description', 'Save your details for faster checkout and easy order tracking.'],
    name_label: ['Name label', 'Name'],
    email_label: ['Email label', 'Email'],
    password_label: ['Password label', 'Password'],
    button: ['Button label', 'Create account'],
    alt_label: ['Secondary link label', 'Already have an account? Sign in'],
    alt_href: ['Secondary link', '/sign-in', link('alt_label')],
    error: ['Error message', 'We couldn’t create your account. Check your details and try again.'],
  },
  inputs: [
    { label: 'name_label', name: 'name', autocomplete: 'name' },
    { label: 'email_label', name: 'email', type: 'email', autocomplete: 'email' },
    { label: 'password_label', name: 'password', type: 'password', autocomplete: 'new-password' },
  ],
});

const password = auth({
  adapter: 'access.verify', redirect: '/',
  copy: {
    eyebrow: ['Eyebrow', 'Private'],
    heading: ['Heading', 'This store is private'],
    body: ['Description', 'Enter the password to continue.'],
    password_label: ['Password label', 'Password'],
    button: ['Button label', 'Enter'],
    error: ['Error message', 'That password didn’t work. Try again.'],
  },
  inputs: [{ label: 'password_label', name: 'password', type: 'password', autocomplete: 'current-password' }],
});

const checkout = (() => {
  const copy = {
    eyebrow: ['Eyebrow', 'Checkout'],
    heading: ['Heading', 'Review and pay'],
    body: ['Description', 'Confirm your details. You’ll finish payment on a secure page.'],
    email_label: ['Email label', 'Email'],
    discount_label: ['Discount code label', 'Discount code'],
    apply_label: ['Apply button label', 'Apply'],
    button: ['Button label', 'Continue to payment'],
    secure_note: ['Payment note', 'Payment is completed on a secure page.'],
    summary_heading: ['Summary heading', 'Order summary'],
    subtotal_label: ['Subtotal label', 'Subtotal'],
    discount_row_label: ['Discount row label', 'Discount'],
    empty: ['Empty cart message', 'Your cart is empty.'],
    continue_label: ['Continue shopping label', 'Continue shopping'],
    continue_href: ['Continue shopping link', '/collections', link('continue_label')],
    error: ['Error message', 'We couldn’t start checkout. Please try again.'],
  };
  const c = copyContent(copy);
  return {
    content: c,
    fields: copyFields(copy),
    html: `<div class="stk-page stk-checkout">
      <header class="stk-head">${head(c)}</header>
      <div class="stk-checkout__grid">
        <form class="stk-card stk-form" data-adapter="checkout.session">
          ${input(c, { label: 'email_label', name: 'email', type: 'email', autocomplete: 'email' })}
          <div class="stk-promo">
            <label class="stk-field">${text(c, 'discount_label')}<input name="discount" type="text" autocomplete="off"></label>
            ${text(c, 'apply_label', 'button', ' type="button" class="stk-btn stk-btn--quiet" data-adapter="checkout.discount"')}
          </div>
          ${status}${failure(c)}
          ${text(c, 'button', 'button', ' type="submit" class="stk-btn"')}
          ${text(c, 'secure_note', 'p', ' class="stk-note"')}
        </form>
        <aside class="stk-card stk-summary" aria-label="${esc(c.summary_heading)}">
          ${text(c, 'summary_heading', 'h2')}
          <ul class="stk-lines" data-cart-lines></ul>
          ${text(c, 'empty', 'p', ' class="stk-empty" data-cart-empty')}
          ${text(c, 'continue_label', 'a', ` class="stk-alt" data-cart-empty-link href="${esc(c.continue_href)}"`)}
          <dl class="stk-totals">
            <div><dt data-theme-project-field="subtotal_label">${esc(c.subtotal_label)}</dt><dd data-cart-subtotal>—</dd></div>
            <div data-discount-row hidden><dt data-theme-project-field="discount_row_label">${esc(c.discount_row_label)}</dt><dd data-cart-discount></dd></div>
          </dl>
        </aside>
      </div>
    </div>`,
  };
})();

const account = (() => {
  const copy = {
    eyebrow: ['Eyebrow', 'Account'],
    heading: ['Heading', 'Your account'],
    body: ['Description', 'View your orders and manage your details.'],
    signed_in_label: ['Signed-in label', 'Signed in as'],
    orders_label: ['Orders link label', 'Your orders'],
    orders_href: ['Orders link', '/orders', link('orders_label')],
    sign_out_label: ['Sign-out button label', 'Sign out'],
    error: ['Error message', 'We couldn’t load your account. Please try again.'],
  };
  const c = copyContent(copy);
  return {
    content: c,
    fields: copyFields(copy),
    html: `<div class="stk-page stk-account">
      <header class="stk-head">${head(c)}</header>
      <div class="stk-card" data-adapter-view="customer.session" data-adapter-signin="/sign-in">
        ${text(c, 'signed_in_label', 'p', ' class="stk-eyebrow"')}
        <p class="stk-strong" data-bind="email">—</p>
        <nav class="stk-actions">
          ${text(c, 'orders_label', 'a', ` class="stk-alt" href="${esc(c.orders_href)}"`)}
          ${text(c, 'sign_out_label', 'button', ' type="button" class="stk-btn stk-btn--quiet" data-adapter="customer.sign-out" data-adapter-redirect="/"')}
        </nav>
      </div>
      ${status}${failure(c)}
    </div>`,
  };
})();

const orders = (() => {
  const copy = {
    eyebrow: ['Eyebrow', 'Orders'],
    heading: ['Heading', 'Your orders'],
    body: ['Description', 'Track what you’ve ordered.'],
    empty: ['Empty message', 'You haven’t placed any orders yet.'],
    error: ['Error message', 'We couldn’t load your orders. Please try again.'],
  };
  const c = copyContent(copy);
  return {
    content: c,
    fields: copyFields(copy),
    html: `<div class="stk-page stk-orders-page">
      <header class="stk-head">${head(c)}</header>
      <ul class="stk-orders" data-adapter-view="customer.orders" data-adapter-signin="/sign-in"></ul>
      ${text(c, 'empty', 'p', ' class="stk-empty" data-orders-empty hidden')}
      ${status}${failure(c)}
    </div>`,
  };
})();

const giftCard = (() => {
  const copy = {
    eyebrow: ['Eyebrow', 'Gift cards'],
    heading: ['Heading', 'Give a gift card'],
    body: ['Description', 'Send a gift card by email. The recipient chooses what to buy.'],
    amount_label: ['Amount label', 'Amount'],
    recipient_label: ['Recipient email label', 'Recipient email'],
    message_label: ['Message label', 'Message (optional)'],
    button: ['Button label', 'Purchase gift card'],
    error: ['Error message', 'We couldn’t complete that. Please try again.'],
  };
  const c = copyContent(copy);
  return {
    content: c,
    fields: copyFields(copy),
    html: `<div class="stk-page stk-auth"><div class="stk-card">
      ${head(c)}
      <form class="stk-form" data-adapter="giftcard.purchase" data-adapter-redirect="/">
        ${input(c, { label: 'amount_label', name: 'amount', type: 'number', attrs: ' min="5" step="1" value="50" inputmode="decimal"' })}
        ${input(c, { label: 'recipient_label', name: 'recipient_email', type: 'email', autocomplete: 'off' })}
        <label class="stk-field">${text(c, 'message_label')}<textarea name="message" rows="4"></textarea></label>
        ${text(c, 'button', 'button', ' type="submit" class="stk-btn"')}
        ${status}${failure(c)}
      </form>
    </div></div>`,
  };
})();

/** Keyed by page_type / template_key. */
export const STOCK_TEMPLATES = {
  checkout,
  customer_sign_in: signIn,
  customer_sign_up: signUp,
  customer_account: account,
  customer_orders: orders,
  gift_card: giftCard,
  password,
};

export const STOCK_TEMPLATE_STYLES = `
.stk-page{max-width:1120px;margin:auto;padding:clamp(40px,8vw,96px) clamp(20px,5vw,48px);min-height:55vh;color:var(--iam-ink);font-family:inherit}
.stk-page [hidden]{display:none!important}
.stk-auth{display:grid;place-items:center}
.stk-auth .stk-card{max-width:480px}
.stk-card{width:100%;padding:clamp(22px,4vw,40px);border:1px solid color-mix(in srgb,var(--iam-ink) 14%,transparent);border-radius:14px;background:color-mix(in srgb,var(--iam-paper) 94%,var(--iam-ink))}
.stk-head{margin-bottom:clamp(24px,4vw,40px)}
.stk-eyebrow{margin:0 0 12px;font-size:.72rem;letter-spacing:.15em;text-transform:uppercase;font-weight:650}
.stk-page h1{margin:0 0 14px;font-family:var(--iam-display);font-weight:500;letter-spacing:-.03em;line-height:1.1;font-size:clamp(2rem,5vw,3.25rem)}
.stk-page h2{margin:0 0 18px;font-family:var(--iam-display);font-weight:500;font-size:1.4rem}
.stk-lede,.stk-note,.stk-empty{margin:0 0 22px;line-height:1.65;color:color-mix(in srgb,var(--iam-ink) 68%,transparent)}
.stk-note{margin:14px 0 0;font-size:.85rem}
.stk-strong{margin:0 0 22px;font-size:1.15rem;font-weight:600;overflow-wrap:anywhere}
.stk-form{display:grid;gap:16px}
.stk-field{display:grid;gap:6px;font-size:.88rem}
.stk-field input,.stk-field textarea{font:inherit;padding:12px 14px;border:1px solid color-mix(in srgb,var(--iam-ink) 28%,transparent);border-radius:8px;background:transparent;color:inherit;max-width:100%;box-sizing:border-box}
.stk-field input:focus-visible,.stk-field textarea:focus-visible,.stk-btn:focus-visible,.stk-alt:focus-visible{outline:2px solid var(--iam-accent);outline-offset:2px}
.stk-btn{font:inherit;padding:13px 22px;border:1px solid var(--iam-accent);border-radius:8px;background:var(--iam-accent);color:var(--iam-paper);cursor:pointer}
.stk-btn--quiet{background:transparent;color:var(--iam-ink);border-color:color-mix(in srgb,var(--iam-ink) 28%,transparent)}
.stk-btn:disabled{opacity:.5;cursor:not-allowed}
.stk-alt{display:inline-block;margin-top:18px;color:var(--iam-ink);text-underline-offset:3px}
.stk-actions{display:flex;flex-wrap:wrap;gap:16px;align-items:center}
.stk-actions .stk-alt{margin-top:0}
.stk-status{min-height:1.4em;margin:0;font-size:.88rem}
.stk-status[data-state="error"]{color:var(--iam-danger,#b3261e)}
.stk-checkout__grid{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr);gap:clamp(20px,4vw,40px);align-items:start}
.stk-promo{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:end}
.stk-lines,.stk-orders{list-style:none;margin:0 0 18px;padding:0;display:grid;gap:12px}
.stk-lines li,.stk-orders li{display:flex;justify-content:space-between;gap:16px;padding-bottom:12px;border-bottom:1px solid color-mix(in srgb,var(--iam-ink) 12%,transparent)}
.stk-totals{margin:0;display:grid;gap:8px}
.stk-totals div{display:flex;justify-content:space-between;gap:16px}
.stk-totals dt,.stk-totals dd{margin:0}
@media(max-width:800px){.stk-checkout__grid{grid-template-columns:1fr}}
`.trim();

/**
 * Runs in the page. Plain function so it is linted and testable; it is serialized
 * into the template. Everything it touches is declared in the markup.
 */
function adapterRuntime(ADAPTERS) {
  const CART_KEY = 'agentsam.cart.v1', DISCOUNT_KEY = 'agentsam.discount.v1';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
  const cart = () => { const items = read(CART_KEY, []); return Array.isArray(items) ? items.filter(item => item && item.variant_id && item.qty > 0) : []; };
  const lineItems = () => cart().map(item => ({ variant_id: item.variant_id, qty: item.qty }));
  const money = (cents, currency) => { try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD' }).format((Number(cents) || 0) / 100); } catch { return String(cents); } };
  const scopeOf = node => node.closest('.stk-page') || document;
  const say = (scope, message, failed) => { const out = $('[data-adapter-status]', scope); if (!out) return; out.textContent = message || ''; out.dataset.state = failed ? 'error' : 'ok'; };
  const failure = scope => (($('[data-adapter-error]', scope) || {}).textContent || 'Something went wrong. Please try again.').trim();
  const go = url => { try { const target = new URL(url, location.href); if (target.origin === location.origin || target.protocol === 'https:') location.assign(target.href); } catch { /* ignore */ } };

  async function call(key, body) {
    const adapter = ADAPTERS[key], post = adapter.method === 'POST';
    const response = await fetch(adapter.path, {
      method: adapter.method, credentials: 'same-origin',
      headers: post ? { 'Content-Type': 'application/json' } : undefined,
      body: post ? JSON.stringify(body || {}) : undefined,
    });
    let data = null; try { data = await response.json(); } catch { /* empty body */ }
    if (!response.ok) { const error = new Error((data && data.error) || 'request_failed'); error.status = response.status; error.fromServer = Boolean(data && data.error); throw error; }
    return data || {};
  }

  function renderCart() {
    for (const page of $$('.stk-checkout')) {
      const items = cart(), list = $('[data-cart-lines]', page); list.replaceChildren();
      let subtotal = 0;
      for (const item of items) {
        const line = (Number(item.price_cents) || 0) * item.qty; subtotal += line;
        const row = document.createElement('li'), name = document.createElement('span'), price = document.createElement('span');
        name.textContent = (item.title || 'Item') + ' × ' + item.qty;
        price.textContent = item.price_cents == null ? '' : money(line, item.currency);
        row.append(name, price); list.append(row);
      }
      const has = items.length > 0, discount = read(DISCOUNT_KEY, null), row = $('[data-discount-row]', page);
      $('[data-cart-empty]', page).hidden = has; $('[data-cart-empty-link]', page).hidden = has;
      $('[data-cart-subtotal]', page).textContent = has ? money(subtotal) : '—';
      row.hidden = !(has && discount && discount.discount_cents > 0);
      if (!row.hidden) $('[data-cart-discount]', page).textContent = '−' + money(discount.discount_cents);
      $('form[data-adapter="checkout.session"] [type="submit"]', page).disabled = !has;
    }
  }

  document.addEventListener('submit', async event => {
    const form = event.target.closest && event.target.closest('form[data-adapter]'); if (!form) return;
    event.preventDefault();
    const scope = scopeOf(form), submit = $('[type="submit"]', form), key = form.dataset.adapter;
    if (submit) submit.disabled = true; say(scope, '…');
    try {
      let body = Object.fromEntries(new FormData(form));
      if (key === 'checkout.session') {
        const items = lineItems(); if (!items.length) throw new Error('empty_cart');
        const discount = read(DISCOUNT_KEY, null);
        body = { email: body.email, items, discount_code: (discount && discount.code) || body.discount || '' };
      }
      const data = await call(key, body);
      if (data.url) return go(data.url);
      if (form.dataset.adapterRedirect) return go(form.dataset.adapterRedirect);
      say(scope, '');
    } catch { say(scope, failure(scope), true); }
    finally { if (submit) submit.disabled = false; renderCart(); }
  });

  document.addEventListener('click', async event => {
    const target = event.target.closest && event.target.closest('[data-adapter]');
    if (!target || target.tagName === 'FORM') return;
    const scope = scopeOf(target), key = target.dataset.adapter;
    if (key === 'checkout.discount') {
      event.preventDefault();
      const data = new FormData(target.closest('form')), code = String(data.get('discount') || '').trim();
      if (!code) return;
      try {
        const result = await call(key, { code, email: String(data.get('email') || ''), items: lineItems() });
        localStorage.setItem(DISCOUNT_KEY, JSON.stringify({ code: result.code || code, discount_cents: result.discount_cents || 0 }));
        say(scope, result.message || '');
      } catch (error) { localStorage.removeItem(DISCOUNT_KEY); say(scope, error.fromServer ? error.message : failure(scope), true); }
      renderCart();
    } else if (key === 'customer.sign-out') {
      event.preventDefault();
      try { await call(key); go(target.dataset.adapterRedirect || '/'); } catch { say(scope, failure(scope), true); }
    }
  });

  async function load(view) {
    const key = view.dataset.adapterView, scope = scopeOf(view);
    try {
      const data = await call(key);
      if (key === 'customer.session') { const email = $('[data-bind="email"]', view); if (email) email.textContent = (data.customer && data.customer.email) || ''; }
      if (key === 'customer.orders') {
        view.replaceChildren();
        for (const order of data.orders || []) {
          const row = document.createElement('li'), label = document.createElement('span'), detail = document.createElement('span');
          label.textContent = '#' + (order.number || order.id);
          detail.textContent = [order.status, order.total_cents == null ? '' : money(order.total_cents, order.currency)].filter(Boolean).join(' · ');
          row.append(label, detail); view.append(row);
        }
        const empty = $('[data-orders-empty]', scope); if (empty) empty.hidden = Boolean(data.orders && data.orders.length);
      }
    } catch (error) {
      if (error.status === 401 && view.dataset.adapterSignin) return go(view.dataset.adapterSignin);
      say(scope, failure(scope), true);
    }
  }

  renderCart(); $$('[data-adapter-view]').forEach(load); addEventListener('storage', renderCart);
}

const RUNTIME_ADAPTERS = Object.fromEntries(Object.entries(STOCK_ADAPTERS).map(([key, { method, path }]) => [key, { method, path }]));
export const STOCK_ADAPTER_SCRIPT = '<script>(' + adapterRuntime.toString() + ')(' + JSON.stringify(RUNTIME_ADAPTERS) + ')</script>';
