export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

export function widgetConfig(element) {
  try {
    const config = JSON.parse(element.getAttribute('config') || '{}');
    return config && typeof config === 'object' && !Array.isArray(config) ? config : {};
  } catch {
    return {};
  }
}

export function widgetColor(value, fallback) {
  return typeof value === 'string' && /^#[a-f\d]{6}$/i.test(value) ? value : fallback;
}

export function widgetNumber(value, min, max, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

export function localPath(value) {
  return typeof value === 'string' && /^\/(?![\/\\])[^\\\u0000-\u0020]*$/.test(value) ? value : '';
}

export function submissionTransport(element, endpoint) {
  if (typeof element.submitMessage === 'function') return data => element.submitMessage(data);
  const path = localPath(endpoint);
  if (!path) return null;
  return async data => {
    const response = await fetch(path, {
      method:'POST', credentials:'same-origin', redirect:'error',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({...data,page:location.pathname}),
    });
    if (!response.ok) throw new Error('Submission failed');
    return response.json();
  };
}

export async function acceptSubmission(transport, data) {
  const receipt = await transport(data);
  if (!receipt || typeof receipt.id !== 'string' || !receipt.id.trim() ||
      !['received', 'confirmation_required'].includes(receipt.status)) {
    throw new Error('Invalid submission receipt');
  }
  return receipt;
}

/** Site-local path or https URL for a merchant-supplied image; anything else is dropped. */
export function widgetImage(value) {
  if (typeof value !== 'string') return '';
  const candidate = value.trim();
  if (localPath(candidate)) return candidate;
  try {
    const url = new URL(candidate);
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

/** Trimmed, length-capped label text with a fallback for empty values. */
export function widgetText(value, fallback, max = 120) {
  const text = typeof value === 'string' ? value.trim().slice(0, max) : '';
  return text || fallback;
}

const FONT_STACKS = new Map([
  ['system', 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif'],
  ['serif', 'Georgia,"Times New Roman",serif'],
  ['rounded', 'ui-rounded,"SF Pro Rounded","Nunito","Segoe UI",sans-serif'],
  ['mono', 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace'],
]);
export const WIDGET_FONT_FAMILIES = ['inherit', ...FONT_STACKS.keys()];

/**
 * `inherit` follows the host theme. The legacy `inherit_typography:false`
 * flag keeps meaning "system font" when no explicit family is chosen.
 */
export function widgetFont(family, inheritTypography) {
  if (FONT_STACKS.has(family)) return FONT_STACKS.get(family);
  return inheritTypography === false ? FONT_STACKS.get('system') : 'inherit';
}
