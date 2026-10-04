import { brandResolve } from './resolve.js';
import { buildBrandContractDraft } from './contract.js';
import { brandPlan } from './plan.js';

function assertScan(scan) {
  if (!scan || scan.capability !== 'brand.scan') {
    throw new Error('brand_public_requires_brand_scan_evidence');
  }
  return scan;
}

function rows(value) {
  return Array.isArray(value) ? value : [];
}

function assetId(asset, index) {
  return String(
    asset?.id ?? asset?.asset_id ?? asset?.key ??
    asset?.path ?? asset?.url ?? `asset:${index + 1}`
  );
}

export function inspectBrandEvidence(scan, options = {}) {
  const valid = assertScan(scan);
  const resolved = brandResolve(valid, options.resolve || {});
  return {
    capability: 'brand.public.inspect',
    deterministic: true,
    model_required: false,
    side_effects: 'none',
    scan: valid,
    resolved,
    summary: {
      colors: valid.tokens?.colors?.length || 0,
      typography: valid.tokens?.typography?.length || 0,
      assets: rows(valid.assets).length,
      conflicts: rows(valid.conflicts).length,
      ambiguities: rows(resolved.ambiguities).length,
    },
  };
}

export function listBrandAssetEvidence(scan) {
  return rows(assertScan(scan).assets).map((asset, index) => ({
    id: assetId(asset, index),
    ...asset,
  }));
}

export function inspectBrandAssetEvidence(scan, wantedId) {
  const asset = listBrandAssetEvidence(scan)
    .find((row) => row.id === String(wantedId || ''));
  if (!asset) throw new Error('brand_asset_not_found');
  return {
    capability: 'brand.public.asset.inspect',
    deterministic: true,
    asset,
  };
}

export function findBrandUsageEvidence(scan, query) {
  const valid = assertScan(scan);
  const needle = String(query || '').trim().toLowerCase();
  if (!needle) throw new Error('brand_usage_query_required');

  const hits = [];
  const seen = new Set();

  function walk(value, path = '$') {
    if (value == null) return;
    if (typeof value === 'string') {
      if (value.toLowerCase().includes(needle)) {
        const key = `${path}:${value}`;
        if (!seen.has(key)) {
          seen.add(key);
          hits.push({ path, value });
        }
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((entry, index) => walk(entry, `${path}[${index}]`));
      return;
    }
    if (typeof value === 'object') {
      for (const [key, entry] of Object.entries(value)) {
        walk(entry, `${path}.${key}`);
      }
    }
  }

  walk({
    assets: valid.assets,
    components: valid.components,
    patterns: valid.patterns,
    tokens: valid.tokens,
  });

  return {
    capability: 'brand.public.usage.find',
    deterministic: true,
    query,
    hits: hits.slice(0, 250),
    truncated: hits.length > 250,
  };
}

export function draftBrandContractFromEvidence(scan, options = {}) {
  const valid = assertScan(scan);
  const resolved = options.resolved || brandResolve(valid, options.resolve || {});
  const contract = buildBrandContractDraft({
    scan: valid,
    resolved,
    brandId: options.brandId || 'brand:inferred',
  });
  return {
    capability: 'brand.public.contract.draft',
    deterministic: true,
    resolved,
    contract,
  };
}

export function buildBrandPlanFromEvidence(scan, options = {}) {
  const valid = assertScan(scan);
  const resolved = options.resolved || brandResolve(valid, options.resolve || {});
  const contract = options.contract || buildBrandContractDraft({
    scan: valid,
    resolved,
    brandId: options.brandId || 'brand:inferred',
  });
  return brandPlan({ scan: valid, resolved, contract });
}

function resolvedColors(contract) {
  const source = contract?.visual_system?.colors?.resolved || {};
  return new Set(
    Object.values(source)
      .map((row) => String(row?.value || '').trim().toLowerCase())
      .filter(Boolean)
  );
}

function observedFonts(contract) {
  return new Set(
    rows(contract?.visual_system?.typography?.observed)
      .filter((row) => row?.kind === 'font_family')
      .map((row) => String(row?.value || '').trim().toLowerCase())
      .filter(Boolean)
  );
}

export function evaluateBrandConsistency(contract, candidate = {}) {
  if (!contract || contract.kind !== 'brand') {
    throw new Error('brand_consistency_requires_brand_contract');
  }

  const colors = resolvedColors(contract);
  const fonts = observedFonts(contract);
  const checks = [
    ...rows(candidate.colors).map((value) => ({
      kind: 'color',
      value: String(value),
      accepted: colors.size ? colors.has(String(value).trim().toLowerCase()) : null,
    })),
    ...rows(candidate.fonts).map((value) => ({
      kind: 'font',
      value: String(value),
      accepted: fonts.size ? fonts.has(String(value).trim().toLowerCase()) : null,
    })),
  ];

  const definite = checks.filter((row) => row.accepted !== null);
  const score = definite.length
    ? definite.filter((row) => row.accepted).length / definite.length
    : null;

  return {
    capability: 'brand.public.consistency.evaluate',
    deterministic: true,
    score: score == null ? null : Number(score.toFixed(3)),
    verdict:
      score == null ? 'insufficient_evidence' :
      score >= 0.9 ? 'consistent' :
      score >= 0.6 ? 'review' : 'inconsistent',
    checks,
    evidence: {
      allowed_color_count: colors.size,
      allowed_font_count: fonts.size,
    },
  };
}
