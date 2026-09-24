import { colorDistance, normalizeColorValue } from './extract.js';

/**
 * brand.resolve — cluster observed evidence into inferred roles (still non-mutating).
 */
export function brandResolve(scanResult, options = {}) {
  if (!scanResult || scanResult.capability !== 'brand.scan') {
    throw new Error('brand_resolve_requires_brand_scan');
  }

  const colors = scanResult.tokens?.colors || [];
  const clusters = [];
  const used = new Set();
  const threshold = options.colorDistance ?? 12;

  for (let i = 0; i < colors.length; i += 1) {
    if (used.has(i)) continue;
    const seed = colors[i];
    const members = [seed];
    used.add(i);
    for (let j = i + 1; j < colors.length; j += 1) {
      if (used.has(j)) continue;
      if (colorDistance(seed, colors[j]) <= threshold) {
        members.push(colors[j]);
        used.add(j);
      }
    }
    members.sort((a, b) => (b.occurrences || 0) - (a.occurrences || 0));
    const primary = members[0];
    clusters.push({
      role_hint: inferColorRole(primary, members),
      value: primary.value,
      normalized_value: primary.normalized_value,
      aliases: members.slice(1).map((m) => m.value),
      occurrences: members.reduce((n, m) => n + (m.occurrences || 0), 0),
      confidence: Math.min(0.99, 0.55 + Math.min(members.length, 6) * 0.07 + Math.min(primary.occurrences || 0, 40) * 0.005),
      members: members.map((m) => ({
        value: m.value,
        occurrences: m.occurrences,
        evidence: (m.evidence || []).slice(0, 5),
      })),
    });
  }

  clusters.sort((a, b) => b.occurrences - a.occurrences);

  const typography = scanResult.tokens?.typography || [];
  const typeRoles = {};
  for (const row of typography) {
    const key = row.kind === 'font_family' ? 'families' : row.kind === 'font_size' ? 'sizes' : 'other';
    (typeRoles[key] ||= []).push({
      value: row.value,
      occurrences: row.occurrences,
      evidence: (row.evidence || []).slice(0, 3),
    });
  }

  const ambiguities = clusters
    .filter((c) => c.aliases.length >= 1 && c.occurrences >= 8)
    .slice(0, 12)
    .map((c) => ({
      kind: 'color_merge_candidate',
      primary: c.value,
      aliases: c.aliases,
      occurrences: c.occurrences,
      question: `Are ${[c.value, ...c.aliases.slice(0, 3)].join(', ')} the same brand color?`,
    }));

  return {
    schema_version: 1,
    capability: 'brand.resolve',
    deterministic: true,
    model_required: false,
    side_effects: 'none',
    repository: scanResult.repository,
    scan_content_hash: scanResult.content_hash,
    observed: {
      colors: colors.map((c) => c.value),
      typography: typography.map((t) => ({ kind: t.kind, value: t.value })),
    },
    inferred: {
      colors: Object.fromEntries(
        clusters.slice(0, 24).map((c, idx) => [
          c.role_hint || `cluster_${idx + 1}`,
          {
            candidates: [c.value, ...c.aliases],
            confidence: Number(c.confidence.toFixed(3)),
            occurrences: c.occurrences,
          },
        ]),
      ),
      typography: typeRoles,
      components: scanResult.patterns || {},
    },
    declared: {},
    resolved: {
      colors: Object.fromEntries(
        clusters.slice(0, 24).map((c, idx) => [
          c.role_hint || `cluster_${idx + 1}`,
          {
            value: c.value,
            aliases: c.aliases,
            confidence: Number(c.confidence.toFixed(3)),
          },
        ]),
      ),
    },
    ambiguities,
    confidence: {
      colors: colors.length ? Number(Math.min(0.99, 0.7 + colors.length * 0.005).toFixed(3)) : 0,
      typography: typography.length ? Number(Math.min(0.95, 0.55 + typography.length * 0.02).toFixed(3)) : 0,
      voice: 0.2,
    },
    preservation: {
      visual_identity: 'high',
      component_api: 'high',
      layout_structure: 'medium',
    },
    origin: {
      mode: 'inferred',
      repository_snapshot: scanResult.repository?.snapshot_id || null,
    },
  };
}

function inferColorRole(primary, members) {
  const blob = JSON.stringify(members).toLowerCase();
  const [r, g, b] = primary.rgb || [128, 128, 128];
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  if (/accent|primary|brand|orange|red|blue|indigo/.test(blob) && lum > 0.15 && lum < 0.85) return 'accent_candidate';
  if (lum < 0.18) return 'surface_dark';
  if (lum > 0.85) return 'surface_light';
  if (Math.abs(r - g) < 12 && Math.abs(g - b) < 12) return 'neutral';
  return 'chromatic';
}

export function parseDeclaredColor(value) {
  return normalizeColorValue(value);
}
