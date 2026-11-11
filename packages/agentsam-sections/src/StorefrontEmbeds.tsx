import { useId, useRef, useState, type CSSProperties, type FormEvent } from 'react';

export type StorefrontSubmission =
  | { kind: 'contact'; email: string; name: string; message: string }
  | { kind: 'inbox'; email: string; message: string }
  | { kind: 'signup'; email: string; consent: true };

export type StorefrontReceipt = { id: string; status: 'received' | 'confirmation_required' };
export type SubmitStorefront = (submission: StorefrontSubmission) => Promise<StorefrontReceipt>;

export interface StorefrontProduct {
  id: string;
  label: string;
  href: string;
}

const chatFields = {
  enabled: { label: 'Show online store chat', type: 'boolean', default: false },
  greeting: { label: 'Greeting message', type: 'textarea', default: 'How can we help?' },
  label: { label: 'Launcher label', type: 'text', default: 'Chat' },
  style: { label: 'Launcher style', type: 'choice', options: ['button', 'message-bar'], default: 'button' },
  icon: { label: 'Icon', type: 'choice', options: ['bubble', 'mail', 'none'], default: 'bubble' },
  position: { label: 'Horizontal position', type: 'choice', options: ['left', 'center', 'right'], default: 'right' },
  elevation: { label: 'Vertical position', type: 'choice', options: ['low', 'middle', 'high'], default: 'low' },
  showProducts: { label: 'Show featured products', type: 'boolean', default: false },
  productIds: { label: 'Featured products', type: 'product-list', default: [] },
  background: { label: 'Background', type: 'color', default: '#ffffff' },
  foreground: { label: 'Text color', type: 'color', default: '#201e1b' },
  invertLauncher: { label: 'Invert launcher colors', type: 'boolean', default: true },
  inheritFont: { label: 'Inherit theme typography', type: 'boolean', default: true },
  fontSize: { label: 'Widget font size', type: 'number', min: 14, max: 22, default: 16 },
  radius: { label: 'Corner radius', type: 'number', min: 0, max: 28, default: 16 },
} as const;

export const storefrontEmbedDefinitions = {
  inbox: { key: 'online_store_chat', version: 1, name: 'Online store chat', placement: 'overlay', fields: chatFields },
  forms: { key: 'contact_form', version: 1, name: 'Contact form', placement: 'inline' },
  growth: { key: 'newsletter_subscribe', version: 1, name: 'Email subscriptions', placement: 'inline' },
} as const;

export interface OnlineStoreChatSettings {
  enabled: boolean;
  greeting: string;
  label: string;
  style: 'button' | 'message-bar';
  icon: 'bubble' | 'mail' | 'none';
  position: 'left' | 'center' | 'right';
  elevation: 'low' | 'middle' | 'high';
  showProducts: boolean;
  productIds: readonly string[];
  background: string;
  foreground: string;
  invertLauncher: boolean;
  inheritFont: boolean;
  fontSize: number;
  radius: number;
}

const chatDefaults: OnlineStoreChatSettings = {
  enabled: false, greeting: chatFields.greeting.default, label: chatFields.label.default,
  style: 'button', icon: 'bubble', position: 'right', elevation: 'low', showProducts: false,
  productIds: [], background: chatFields.background.default, foreground: chatFields.foreground.default,
  invertLauncher: true, inheritFont: true, fontSize: 16, radius: 16,
};

function color(value: string, fallback: string) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function productHref(href: string) {
  // Product targets are supplied by the merchant host, on the same storefront.
  return /^\/(?![\/\\])[^\\\u0000-\u0020]*$/.test(href) ? href : null;
}

function SubmissionFields({
  kind, submit, buttonLabel, consentLabel,
}: {
  kind: StorefrontSubmission['kind'];
  submit?: SubmitStorefront;
  buttonLabel: string;
  consentLabel?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; error: boolean }>();
  const running = useRef(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!submit || running.current) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const email = String(values.get('email') ?? '').trim();
    const message = String(values.get('message') ?? '').trim();
    if (!email || (kind !== 'signup' && !message) || (kind === 'signup' && values.get('consent') !== 'yes')) {
      setFeedback({ text: 'Complete the required fields.', error: true });
      return;
    }
    let submission: StorefrontSubmission;
    if (kind === 'signup') submission = { kind, email, consent: true };
    else if (kind === 'contact') submission = { kind, email, name: String(values.get('name') ?? '').trim(), message };
    else submission = { kind, email, message };

    running.current = true;
    setBusy(true);
    setFeedback(undefined);
    try {
      const receipt = await submit(submission);
      if (!receipt?.id || !['received', 'confirmation_required'].includes(receipt.status)) throw new Error('Invalid receipt');
      form.reset();
      setFeedback({
        text: receipt.status === 'confirmation_required' ? 'Check your email to confirm.'
          : kind === 'signup' ? 'Signup received.' : 'Message received.',
        error: false,
      });
    } catch {
      setFeedback({ text: 'We could not send this. Your entries are still here. Try again.', error: true });
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  return <form className="ase-form" onSubmit={handleSubmit}>
    {kind === 'contact' && <label>Name<input name="name" autoComplete="name" maxLength={100} /></label>}
    <label>Email<input name="email" type="email" autoComplete="email" maxLength={254} required /></label>
    {kind === 'signup'
      ? <label className="ase-consent"><input type="checkbox" name="consent" value="yes" required />{consentLabel || 'Email me news and offers.'}</label>
      : <label>Message<textarea name="message" maxLength={2000} rows={4} required /></label>}
    <button type="submit" disabled={!submit || busy}>{busy ? 'Sending…' : buttonLabel}</button>
    {!submit && <p role="status">Submissions are currently unavailable.</p>}
    {feedback && <p role={feedback.error ? 'alert' : 'status'}>{feedback.text}</p>}
  </form>;
}

export function StorefrontForm({
  kind = 'contact', heading, description, submit, buttonLabel, consentLabel,
}: {
  kind?: 'contact' | 'signup';
  heading: string;
  description?: string;
  submit?: SubmitStorefront;
  buttonLabel?: string;
  consentLabel?: string;
}) {
  const headingId = useId();
  return <section className="ase-form-section" aria-labelledby={headingId}>
    <h2 id={headingId}>{heading}</h2>
    {description && <p>{description}</p>}
    <SubmissionFields kind={kind} submit={submit} consentLabel={consentLabel}
      buttonLabel={buttonLabel || (kind === 'signup' ? 'Subscribe' : 'Send message')} />
  </section>;
}

export function OnlineStoreChat({
  settings, products = [], submit,
}: {
  settings: Partial<OnlineStoreChatSettings>;
  products?: readonly StorefrontProduct[];
  submit?: SubmitStorefront;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const heading = useId();
  const dialogId = useId();
  const config = { ...chatDefaults, ...settings };
  if (!config.enabled) return null;
  const style = {
    '--ase-bg': color(config.background, chatDefaults.background),
    '--ase-fg': color(config.foreground, chatDefaults.foreground),
    '--ase-radius': Math.max(0, Math.min(28, config.radius)) + 'px',
    '--ase-bottom': ({ low: '16px', middle: '44px', high: '72px' })[config.elevation],
    '--ase-font': config.inheritFont ? 'inherit' : 'system-ui, sans-serif',
    '--ase-size': Math.max(14, Math.min(22, config.fontSize)) + 'px',
  } as CSSProperties;
  const featured = config.showProducts
    ? products.filter(item => config.productIds.includes(item.id) && productHref(item.href)).slice(0, 4)
    : [];
  return <div className="ase-chat" data-position={config.position} data-invert={config.invertLauncher}
      data-style={config.style} style={style}>
    <button type="button" className="ase-launcher" aria-haspopup="dialog" aria-controls={dialogId}
      ref={launcher} onClick={() => dialog.current?.showModal()}>
      {config.icon !== 'none' && <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d={config.icon === 'mail' ? 'M3 6h18v12H3z M3 7l9 6 9-6' : 'M4 5h16v11H9l-5 3V5z'} />
      </svg>}
      {config.label || chatDefaults.label}
    </button>
    <dialog className="ase-dialog" id={dialogId} aria-labelledby={heading} ref={dialog} onClose={() => launcher.current?.focus()}>
      <header><h2 id={heading}>Store inbox</h2><button type="button" aria-label="Close chat"
        onClick={() => dialog.current?.close()}>×</button></header>
      <p>{config.greeting}</p>
      {featured.length > 0 && <ul aria-label="Featured products">{featured.map(item =>
        <li key={item.id}><a href={item.href}>{item.label}</a></li>)}</ul>}
      <SubmissionFields kind="inbox" submit={submit} buttonLabel="Send message" />
    </dialog>
  </div>;
}

export function OnlineStoreChatFields({
  settings, onChange, products = [],
}: {
  settings: Partial<OnlineStoreChatSettings>;
  onChange: (settings: OnlineStoreChatSettings) => void;
  products?: readonly StorefrontProduct[];
}) {
  const values = { ...chatDefaults, ...settings };
  const update = <K extends keyof OnlineStoreChatSettings>(key: K, value: OnlineStoreChatSettings[K]) =>
    onChange({ ...values, [key]: value });
  const fields = Object.entries(chatFields) as [keyof OnlineStoreChatSettings, typeof chatFields[keyof typeof chatFields]][];
  return <div className="ase-fields" aria-label="Online store chat settings">
    {fields.map(([key, field]) => {
      const value = values[key];
      if (field.type === 'product-list') {
        if (!values.showProducts) return null;
        return <fieldset key={key}><legend>{field.label}</legend>
          {products.length === 0 && <p>No published products are available.</p>}
          {products.map(product => <label key={product.id}><input type="checkbox"
            checked={values.productIds.includes(product.id)}
            onChange={event => update('productIds', event.currentTarget.checked
              ? [...values.productIds, product.id]
              : values.productIds.filter(id => id !== product.id))} />{product.label}</label>)}
        </fieldset>;
      }
      return <label key={key}>{field.label}
        {field.type === 'boolean' ? <input type="checkbox" checked={value === true}
          onChange={event => update(key, event.currentTarget.checked)} />
          : field.type === 'choice' ? <select value={String(value)}
            onChange={event => update(key, event.currentTarget.value as OnlineStoreChatSettings[typeof key])}>
            {field.options.map(option => <option key={option} value={option}>{option.replaceAll('-', ' ')}</option>)}
          </select>
          : field.type === 'textarea' ? <textarea value={String(value)} rows={3} maxLength={300}
            onChange={event => update(key, event.currentTarget.value)} />
          : field.type === 'number' ? <input type="number" min={field.min} max={field.max} value={Number(value)}
            onChange={event => {
              const next = event.currentTarget.valueAsNumber;
              if (Number.isFinite(next)) update(key, Math.max(field.min, Math.min(field.max, next)));
            }} />
          : <input type={field.type} value={String(value)} maxLength={40}
            onChange={event => update(key, event.currentTarget.value)} />}
      </label>;
    })}
  </div>;
}
