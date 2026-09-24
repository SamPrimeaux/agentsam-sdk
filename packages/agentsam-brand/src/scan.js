import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  extractFromText,
  isAssetPath,
  isComponentPath,
  isStylePath,
} from './extract.js';

function sha256Json(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function emit(onEvent, type, payload = {}) {
  if (typeof onEvent === 'function') onEvent({ type, ...payload, at: Date.now() });
}

function mergeEvidenceItems(map, key, item) {
  const existing = map.get(key);
  if (!existing) {
    map.set(key, {
      ...item,
      occurrences: 1,
      evidence: [...(item.evidence || [])],
    });
    return;
  }
  existing.occurrences += 1;
  for (const e of item.evidence || []) {
    if (!existing.evidence.some((x) => x.path === e.path && x.line === e.line)) {
      existing.evidence.push(e);
    }
  }
}

function stableSortTokens(arr) {
  return [...arr].sort((a, b) => {
    const oc = (b.occurrences || 0) - (a.occurrences || 0);
    if (oc) return oc;
    return String(a.normalized_value || a.value).localeCompare(String(b.normalized_value || b.value));
  });
}

/**
 * brand.scan — deterministic evidence from repository.snapshot authority.
 * model_required: false · side_effects: none
 *
 * @param {{
 *   cwd?: string,
 *   snapshot?: object,
 *   repositorySnapshot?: (opts: object) => Promise<object>,
 *   onEvent?: (ev: object) => void,
 *   maxFiles?: number,
 * }} opts
 */
export async function brandScan(opts = {}) {
  const onEvent = opts.onEvent;
  emit(onEvent, 'operation.started', { capability: 'brand.scan' });
  emit(onEvent, 'operation.phase.started', { phase: 'repository_snapshot' });

  let snapshot = opts.snapshot;
  if (!snapshot) {
    if (typeof opts.repositorySnapshot !== 'function') {
      throw new TypeError('brandScan requires snapshot or repositorySnapshot()');
    }
    snapshot = await opts.repositorySnapshot({ cwd: opts.cwd || process.cwd() });
  }
  if (!snapshot?.snapshot_id || !snapshot?.tree?.paths || !snapshot?.tree?.merkle_root) {
    throw new Error('brand_scan_invalid_snapshot');
  }

  const root = fs.realpathSync(opts.cwd || process.cwd());
  const paths = snapshot.tree.paths;
  const maxFiles = opts.maxFiles ?? 2500;

  emit(onEvent, 'operation.phase.started', { phase: 'classify_sources' });

  const stylePaths = [];
  const componentPaths = [];
  const assetPaths = [];
  const configPaths = [];

  for (const rel of paths) {
    if (isStylePath(rel)) stylePaths.push(rel);
    else if (isAssetPath(rel)) assetPaths.push(rel);
    else if (isComponentPath(rel)) componentPaths.push(rel);
    else if (/(?:package\.json|components\.json|\.agentsam\/|theme)/i.test(rel)) configPaths.push(rel);
  }

  const colorMap = new Map();
  const cssVarMap = new Map();
  const typographyMap = new Map();
  const spacingMap = new Map();
  const radiusMap = new Map();
  const shadowMap = new Map();
  const twMap = new Map();
  const componentHints = new Map();

  const readList = [
    ...stylePaths,
    ...componentPaths.slice(0, Math.min(componentPaths.length, 400)),
  ].slice(0, maxFiles);

  emit(onEvent, 'operation.phase.started', { phase: 'token_extraction', total: readList.length });

  let read = 0;
  for (const rel of readList) {
    read += 1;
    if (read % 40 === 0) {
      emit(onEvent, 'operation.progress', {
        phase: 'token_extraction',
        current: read,
        total: readList.length,
        detail: rel,
      });
    }
    const abs = path.join(root, rel);
    let text = '';
    try {
      if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) continue;
      const size = fs.statSync(abs).size;
      if (size > 512 * 1024) continue;
      text = fs.readFileSync(abs, 'utf8');
    } catch {
      continue;
    }
    const extracted = extractFromText(text, rel);
    for (const c of extracted.colors) mergeEvidenceItems(colorMap, c.normalized_value, c);
    for (const v of extracted.cssVars) mergeEvidenceItems(cssVarMap, v.name, v);
    for (const t of extracted.typography) mergeEvidenceItems(typographyMap, `${t.kind}:${t.value}`, t);
    for (const s of extracted.spacing) mergeEvidenceItems(spacingMap, s.value, s);
    for (const r of extracted.radius) mergeEvidenceItems(radiusMap, r.value, r);
    for (const s of extracted.shadow) mergeEvidenceItems(shadowMap, s.value, s);
    for (const t of extracted.tw) mergeEvidenceItems(twMap, t.value, t);

    const base = path.basename(rel).replace(/\.[^.]+$/, '');
    if (/^(button|btn|header|footer|card|nav|modal|dialog|badge|alert)/i.test(base)) {
      const family = base.toLowerCase().replace(/(view|component|index)$/i, '') || base.toLowerCase();
      const prev = componentHints.get(family) || { family, paths: [], count: 0 };
      prev.count += 1;
      if (prev.paths.length < 8) prev.paths.push(rel);
      componentHints.set(family, prev);
    }
  }

  emit(onEvent, 'operation.phase.started', { phase: 'assemble_evidence' });

  const colors = stableSortTokens([...colorMap.values()]);
  const tokens = {
    colors,
    typography: stableSortTokens([...typographyMap.values()]),
    spacing: stableSortTokens([...spacingMap.values()]),
    radius: stableSortTokens([...radiusMap.values()]),
    shadow: stableSortTokens([...shadowMap.values()]),
    motion: [],
    breakpoints: [],
    css_variables: stableSortTokens([...cssVarMap.values()]),
    tailwind_colors: stableSortTokens([...twMap.values()]),
  };

  const components = Object.fromEntries(
    [...componentHints.values()]
      .sort((a, b) => b.count - a.count || a.family.localeCompare(b.family))
      .map((row) => [row.family, row]),
  );

  const conflicts = [];
  // near-duplicate color clusters (distance <= 12)
  for (let i = 0; i < Math.min(colors.length, 80); i += 1) {
    for (let j = i + 1; j < Math.min(colors.length, 80); j += 1) {
      const a = colors[i];
      const b = colors[j];
      if (!a.rgb || !b.rgb) continue;
      const d = Math.hypot(a.rgb[0] - b.rgb[0], a.rgb[1] - b.rgb[1], a.rgb[2] - b.rgb[2]);
      if (d > 0 && d <= 12) {
        conflicts.push({
          kind: 'near_duplicate_color',
          values: [a.value, b.value],
          distance: Number(d.toFixed(2)),
          occurrences: (a.occurrences || 0) + (b.occurrences || 0),
        });
      }
    }
  }
  conflicts.sort((a, b) => (b.occurrences || 0) - (a.occurrences || 0));

  const body = {
    schema_version: 1,
    capability: 'brand.scan',
    deterministic: true,
    model_required: false,
    side_effects: 'none',
    repository: {
      snapshot_id: snapshot.snapshot_id,
      content_hash: snapshot.content_hash,
      merkle_root: snapshot.tree.merkle_root,
      metadata_root: snapshot.tree.metadata_root,
      path_count: paths.length,
    },
    sources: {
      css: stylePaths.length,
      components: componentPaths.length,
      config: configPaths.length,
      assets: assetPaths.length,
      scanned_files: readList.length,
    },
    tokens,
    components,
    patterns: {
      button_families: Object.keys(components).filter((k) => /btn|button/.test(k)).length,
      header_families: Object.keys(components).filter((k) => /header|nav/.test(k)).length,
      card_families: Object.keys(components).filter((k) => /card/.test(k)).length,
    },
    copy: {},
    assets: {
      count: assetPaths.length,
      sample: assetPaths.slice(0, 24),
    },
    conflicts: conflicts.slice(0, 50),
    evidence: [],
    origin: {
      mode: 'observed',
      repository_snapshot: snapshot.snapshot_id,
    },
  };

  const contentHash = sha256Json({
    repository: body.repository,
    sources: body.sources,
    tokens: body.tokens,
    components: body.components,
    patterns: body.patterns,
    assets: body.assets,
    conflicts: body.conflicts,
  });

  const result = {
    ...body,
    content_hash: `sha256:${contentHash}`,
  };

  emit(onEvent, 'operation.completed', {
    capability: 'brand.scan',
    findings: colors.length + conflicts.length,
    content_hash: result.content_hash,
  });

  return result;
}
