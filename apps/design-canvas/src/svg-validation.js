export const MAX_INLINE_SVG_BYTES = 256_000;

/** @param {unknown} value */
export function assertInlineSvgSource(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('svg_source_required');
  const source = value.trim();
  if (new TextEncoder().encode(source).byteLength > MAX_INLINE_SVG_BYTES) throw new Error('svg_source_too_large');
  if (!/<svg\b/i.test(source) || !/<\/svg\s*>/i.test(source)) throw new Error('svg_root_required');
  if (/<!DOCTYPE|<!ENTITY|<\?xml-stylesheet/i.test(source)) throw new Error('svg_declarations_unsupported');
  if (/<\s*(?:script|foreignObject|iframe|object|embed|image|audio|video|style|feImage)\b/i.test(source)) throw new Error('svg_embedded_content_unsupported');
  if (/\bstyle\s*=/i.test(source)) throw new Error('svg_style_attributes_unsupported');
  if (/\bon[a-z][a-z0-9_-]*\s*=/i.test(source) || /(?:javascript|vbscript|data|file)\s*:/i.test(source)) throw new Error('svg_active_content_unsupported');
  for (const match of source.matchAll(/\b(?:xlink:)?href\s*=\s*(["'])(.*?)\1/gi)) {
    if (!match[2].trim().startsWith('#')) throw new Error('svg_external_reference_unsupported');
  }
  for (const match of source.matchAll(/url\(\s*(["']?)(.*?)\1\s*\)/gi)) {
    if (!match[2].trim().startsWith('#')) throw new Error('svg_external_reference_unsupported');
  }
  return source;
}
