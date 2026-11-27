import DOMPurify from 'dompurify';
import { assertInlineSvgSource } from './svg-validation.js';

/** Sanitize SVG for inline DOM rendering. External resources, embedded HTML and active content are rejected. */
export function sanitizeInlineSvg(value: string): string {
  const source = assertInlineSvgSource(value);
  const clean = DOMPurify.sanitize(source, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ['script', 'foreignObject', 'iframe', 'object', 'embed', 'image', 'audio', 'video', 'style', 'feImage', 'a'],
    FORBID_ATTR: ['style'],
    ALLOW_DATA_ATTR: false,
    RETURN_TRUSTED_TYPE: false,
  }) as string;
  if (!/^\s*(?:<\?xml[^>]*>\s*)?<svg\b/i.test(clean) || !/<\/svg\s*>\s*$/i.test(clean)) {
    throw new Error('svg_sanitization_failed');
  }
  return clean;
}
