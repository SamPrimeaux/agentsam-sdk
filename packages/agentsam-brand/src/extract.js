/**
 * Color / token helpers — pure, deterministic.
 */

const HEX_RE = /#([0-9a-fA-F]{3,8})\b/g;
const RGB_RE = /\brgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)(?:\s*,\s*([0-9.]+))?\s*\)/gi;
const CSS_VAR_RE = /--([a-zA-Z0-9_-]+)\s*:\s*([^;}+]+)/g;
const TAILWIND_COLOR_RE = /\b(?:text|bg|border|ring|fill|stroke|from|via|to)-(?:\[(?:#[0-9a-fA-F]{3,8})\]|(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|100|200|300|400|500|600|700|800|900|950))\b/g;
const FONT_FAMILY_RE = /font-family\s*:\s*([^;}+]+)/gi;
const FONT_SIZE_RE = /font-size\s*:\s*([^;}+]+)/gi;
const RADIUS_RE = /border-radius\s*:\s*([^;}+]+)/gi;
const SHADOW_RE = /box-shadow\s*:\s*([^;}+]+)/gi;
const SPACING_RE = /(?:padding|margin|gap|letter-spacing)\s*:\s*([^;}+]+)/gi;

export function expandHex(hex) {
  const h = String(hex || '').replace(/^#/, '').toLowerCase();
  if (h.length === 3 || h.length === 4) {
    return `#${h.split('').map((c) => c + c).join('').slice(0, 6)}`;
  }
  if (h.length >= 6) return `#${h.slice(0, 6)}`;
  return null;
}

export function hexToRgbTuple(hex) {
  const full = expandHex(hex);
  if (!full) return null;
  const n = parseInt(full.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function normalizeColorValue(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (s.startsWith('#')) {
    const rgb = hexToRgbTuple(s);
    if (!rgb) return null;
    return { kind: 'color', value: expandHex(s), normalized_value: `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]})`, rgb };
  }
  const m = /^rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)/i.exec(s);
  if (m) {
    const rgb = [Math.round(Number(m[1])), Math.round(Number(m[2])), Math.round(Number(m[3]))];
    const hex = `#${rgb.map((n) => n.toString(16).padStart(2, '0')).join('')}`;
    return { kind: 'color', value: hex, normalized_value: `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]})`, rgb };
  }
  return { kind: 'color', value: s, normalized_value: s.toLowerCase(), rgb: null };
}

export function colorDistance(a, b) {
  if (!a?.rgb || !b?.rgb) return Infinity;
  const dr = a.rgb[0] - b.rgb[0];
  const dg = a.rgb[1] - b.rgb[1];
  const db = a.rgb[2] - b.rgb[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

export function extractFromText(text, path) {
  const colors = [];
  const cssVars = [];
  const typography = [];
  const spacing = [];
  const radius = [];
  const shadow = [];
  const tw = [];

  const lines = String(text || '').split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const lineNo = i + 1;

    for (const m of line.matchAll(HEX_RE)) {
      const norm = normalizeColorValue(`#${m[1]}`);
      if (norm) colors.push({ ...norm, evidence: [{ path, line: lineNo }] });
    }
    for (const m of line.matchAll(RGB_RE)) {
      const norm = normalizeColorValue(m[0]);
      if (norm) colors.push({ ...norm, evidence: [{ path, line: lineNo }] });
    }
    for (const m of line.matchAll(CSS_VAR_RE)) {
      cssVars.push({
        kind: 'css_var',
        name: `--${m[1]}`,
        value: m[2].trim(),
        evidence: [{ path, line: lineNo, symbol: `--${m[1]}` }],
      });
    }
    for (const m of line.matchAll(TAILWIND_COLOR_RE)) {
      tw.push({ kind: 'tailwind_color', value: m[0], evidence: [{ path, line: lineNo }] });
    }
    for (const m of line.matchAll(FONT_FAMILY_RE)) {
      typography.push({ kind: 'font_family', value: m[1].trim(), evidence: [{ path, line: lineNo }] });
    }
    for (const m of line.matchAll(FONT_SIZE_RE)) {
      typography.push({ kind: 'font_size', value: m[1].trim(), evidence: [{ path, line: lineNo }] });
    }
    for (const m of line.matchAll(RADIUS_RE)) {
      radius.push({ kind: 'radius', value: m[1].trim(), evidence: [{ path, line: lineNo }] });
    }
    for (const m of line.matchAll(SHADOW_RE)) {
      shadow.push({ kind: 'shadow', value: m[1].trim(), evidence: [{ path, line: lineNo }] });
    }
    for (const m of line.matchAll(SPACING_RE)) {
      spacing.push({ kind: 'spacing', value: m[1].trim(), evidence: [{ path, line: lineNo }] });
    }
  }

  return { colors, cssVars, typography, spacing, radius, shadow, tw };
}

export function isStylePath(relPath) {
  const p = String(relPath || '').toLowerCase();
  return (
    /\.(css|scss|sass|less)$/.test(p) ||
    /tailwind\.config\./.test(p) ||
    /theme\.(ts|js|json|cjs|mjs)$/.test(p) ||
    /tokens?\.(ts|js|json|css)$/.test(p)
  );
}

export function isComponentPath(relPath) {
  const p = String(relPath || '').toLowerCase();
  return /\.(tsx?|jsx?|vue|svelte)$/.test(p) && !/\.d\.ts$/.test(p) && !/node_modules/.test(p);
}

export function isAssetPath(relPath) {
  return /\.(svg|png|jpe?g|webp|ico|gif|woff2?|ttf|otf)$/i.test(relPath || '');
}
