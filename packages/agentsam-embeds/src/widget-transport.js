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
