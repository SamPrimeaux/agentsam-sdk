import fs from 'node:fs';
import path from 'node:path';

const TEXT_EXT = new Set([
  '.html', '.htm', '.css', '.scss',
  '.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx',
  '.vue', '.svelte',
]);

function bump(map, key, amount = 1) {
  if (!key) return;
  map.set(key, (map.get(key) || 0) + amount);
}

function namespaceOf(token) {
  const match = /^([a-z][a-z0-9]{1,15})[-_][a-z0-9]/i.exec(token);
  return match?.[1]?.toLowerCase() || null;
}

export function extractStyleEvidence(text) {
  const source = String(text || '');
  const namespaces = new Map();
  const namespaceSignals = new Map();
  const themePresets = new Map();
  const headerPresets = new Map();
  const dataAttributes = new Map();
  const stylesheets = new Map();
  const customProperties = new Map();

  const signal = (prefix, kind) => {
    if (!prefix || prefix.length < 2) return;
    bump(namespaces, prefix);
    const row = namespaceSignals.get(prefix) || {};
    row[kind] = (row[kind] || 0) + 1;
    namespaceSignals.set(prefix, row);
  };

  for (const match of source.matchAll(/\bclass\s*=\s*["']([^"']+)["']/gi)) {
    for (const token of match[1].split(/\s+/).filter(Boolean)) {
      signal(namespaceOf(token), 'class_tokens');
    }
  }

  for (const match of source.matchAll(/\.([a-zA-Z][\w-]*)/g)) {
    signal(namespaceOf(match[1]), 'css_selectors');
  }

  for (const match of source.matchAll(/--([a-zA-Z][a-zA-Z0-9_-]*)\s*:/g)) {
    const token = match[1].toLowerCase();
    bump(customProperties, '--' + token);
    signal(namespaceOf(token), 'custom_properties');
  }

  const literalAttributeValue = (value) => {
    const trimmed = String(value || '').trim();
    if (!trimmed || trimmed.includes('${') || trimmed.includes('{{') || trimmed.includes('<%')) return null;
    return trimmed;
  };

  for (const match of source.matchAll(/\bdata-theme-preset\s*=\s*["']([^"']+)["']/gi)) {
    bump(themePresets, literalAttributeValue(match[1]));
  }
  for (const match of source.matchAll(/\bdata-header-preset\s*=\s*["']([^"']+)["']/gi)) {
    bump(headerPresets, literalAttributeValue(match[1]));
  }
  for (const match of source.matchAll(/\b(data-[a-z0-9_-]+)(?:\s*=|\s|>)/gi)) {
    bump(dataAttributes, match[1].toLowerCase());
  }
  for (const match of source.matchAll(/<link\b[^>]*\brel\s*=\s*["']stylesheet["'][^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
    bump(stylesheets, match[1]);
  }
  for (const match of source.matchAll(/<link\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*\brel\s*=\s*["']stylesheet["'][^>]*>/gi)) {
    bump(stylesheets, match[1]);
  }

  const namespaceRows = [...namespaces.entries()]
    .map(([prefix, occurrences]) => {
      const signals = namespaceSignals.get(prefix) || {};
      const signalKinds = Object.keys(signals).length;
      const score = occurrences + (signalKinds * 3);
      return { prefix, occurrences, signal_kinds: signalKinds, signals, score };
    })
    .filter((row) => row.occurrences >= 2 || row.signal_kinds >= 2)
    .sort((a, b) => b.score - a.score || a.prefix.localeCompare(b.prefix));

  return {
    theme_presets: Object.fromEntries([...themePresets.entries()].sort()),
    header_presets: Object.fromEntries([...headerPresets.entries()].sort()),
    namespaces: namespaceRows,
    data_attributes: Object.fromEntries([...dataAttributes.entries()].sort()),
    stylesheets: Object.fromEntries([...stylesheets.entries()].sort()),
    custom_properties: Object.fromEntries([...customProperties.entries()].sort()),
  };
}

export function mergeStyleEvidence(target, incoming) {
  const merged = target || {
    theme_presets: {},
    header_presets: {},
    namespaces: {},
    data_attributes: {},
    stylesheets: {},
    custom_properties: {},
    files_scanned: 0,
  };
  merged.files_scanned += 1;

  for (const key of ['theme_presets', 'header_presets', 'data_attributes', 'stylesheets', 'custom_properties']) {
    for (const [name, count] of Object.entries(incoming[key] || {})) {
      merged[key][name] = (merged[key][name] || 0) + count;
    }
  }

  for (const row of incoming.namespaces || []) {
    const current = merged.namespaces[row.prefix] || {
      occurrences: 0,
      signal_kinds: new Set(),
      signals: {},
      score: 0,
    };
    current.occurrences += row.occurrences;
    for (const [kind, count] of Object.entries(row.signals || {})) {
      current.signals[kind] = (current.signals[kind] || 0) + count;
      current.signal_kinds.add(kind);
    }
    merged.namespaces[row.prefix] = current;
  }
  return merged;
}

export function finalizeStyleEvidence(merged) {
  const namespaces = Object.entries(merged?.namespaces || {})
    .map(([prefix, row]) => {
      const signalKinds = row.signal_kinds instanceof Set
        ? row.signal_kinds.size
        : Number(row.signal_kinds || 0);
      const score = row.occurrences + (signalKinds * 3);
      const classTokens = row.signals?.class_tokens || 0;
      const cssSelectors = row.signals?.css_selectors || 0;
      const customProperties = row.signals?.custom_properties || 0;
      return {
        prefix,
        occurrences: row.occurrences,
        signal_kinds: signalKinds,
        signals: row.signals,
        score,
        candidate: prefix.length >= 3
          && classTokens >= 2
          && cssSelectors >= 2
          && customProperties >= 2,
      };
    })
    .sort((a, b) => b.score - a.score || a.prefix.localeCompare(b.prefix));

  const explicitPresets = Object.keys(merged?.theme_presets || {});
  return {
    files_scanned: merged?.files_scanned || 0,
    theme_presets: merged?.theme_presets || {},
    header_presets: merged?.header_presets || {},
    namespaces,
    data_attributes: merged?.data_attributes || {},
    stylesheets: merged?.stylesheets || {},
    custom_properties: merged?.custom_properties || {},
    theme_candidate: explicitPresets.length > 0 || namespaces.some((row) => row.candidate),
  };
}

export function inspectStyleEvidenceFile(root, filePath, maxBytes = 512_000) {
  const ext = path.extname(filePath).toLowerCase();
  if (!TEXT_EXT.has(ext)) return null;
  const full = path.join(root, filePath);
  try {
    const stat = fs.statSync(full);
    if (!stat.isFile() || stat.size > maxBytes) return null;
    const text = fs.readFileSync(full, 'utf8');
    if (text.includes('\0')) return null;
    return extractStyleEvidence(text);
  } catch {
    return null;
  }
}
