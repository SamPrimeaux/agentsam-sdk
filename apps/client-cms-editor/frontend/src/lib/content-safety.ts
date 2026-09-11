const RICH_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'BR', 'P', 'UL', 'OL', 'LI', 'H2', 'H3', 'A']);

export function escapeCmsText(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function safeCmsAssetUrl(value: unknown) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (raw.startsWith('/') || raw.startsWith('./') || raw.startsWith('../') || raw.startsWith('blob:')) {
    return raw.replaceAll("'", '%27').replace(/[\r\n]/g, '');
  }
  if (/^data:image\/(?:png|jpeg|jpg|gif|webp);/i.test(raw)) {
    return raw.replaceAll("'", '%27').replace(/[\r\n]/g, '');
  }
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    return url.toString().replaceAll("'", '%27').replace(/[\r\n]/g, '');
  } catch {
    return '';
  }
}

export function safeCmsCssValue(value: unknown) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (/[{};]/.test(raw) || /<\/?(?:style|script)/i.test(raw) || /url\s*\(/i.test(raw)) return '';
  return raw.replace(/[\r\n]/g, ' ');
}

export function sanitizeCmsRichText(value: unknown) {
  const raw = String(value ?? '');
  if (!raw) return '';
  if (typeof DOMParser === 'undefined') return escapeCmsText(raw);

  const doc = new DOMParser().parseFromString(`<body>${raw}</body>`, 'text/html');
  const walk = (node: Element) => {
    for (const child of Array.from(node.children)) {
      if (!RICH_TAGS.has(child.tagName)) {
        child.replaceWith(...Array.from(child.childNodes));
        continue;
      }
      const originalHref = child.tagName === 'A' ? ((child as HTMLAnchorElement).getAttribute('href') || '') : '';
      for (const attr of Array.from(child.attributes)) child.removeAttribute(attr.name);
      if (child.tagName === 'A') {
        const safe = safeCmsAssetUrl(originalHref);
        if (safe) {
          child.setAttribute('href', safe);
          child.setAttribute('rel', 'noopener noreferrer');
        }
      }
      walk(child);
    }
  };
  walk(doc.body);
  return doc.body.innerHTML;
}
