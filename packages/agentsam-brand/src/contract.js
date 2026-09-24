/**
 * Draft Brand Contract from scan + resolve (observed/inferred; declared empty until user answers).
 */
export function buildBrandContractDraft({ scan, resolved, brandId = 'brand:inferred' } = {}) {
  if (!scan || scan.capability !== 'brand.scan') throw new Error('contract_requires_scan');
  if (!resolved || resolved.capability !== 'brand.resolve') throw new Error('contract_requires_resolve');

  return {
    schema: 'agentsam.contract/v1',
    kind: 'brand',
    id: brandId,
    version: '0.1.0',
    status: 'draft',
    extends: [],
    origin: {
      mode: 'inferred',
      repository_snapshot: scan.repository?.snapshot_id || null,
      scan_content_hash: scan.content_hash,
      resolve_from: resolved.scan_content_hash,
    },
    confidence: resolved.confidence,
    preservation: resolved.preservation,
    visual_system: {
      colors: {
        observed: resolved.observed.colors,
        inferred: resolved.inferred.colors,
        declared: resolved.declared,
        resolved: resolved.resolved.colors,
      },
      typography: {
        observed: resolved.observed.typography,
        inferred: resolved.inferred.typography,
      },
    },
    components: {
      patterns: scan.patterns,
      inventory: Object.keys(scan.components || {}),
    },
    assets: scan.assets,
    ambiguities: resolved.ambiguities,
    metadata: {
      generated_by: 'brand.scan+brand.resolve',
      deterministic: true,
    },
  };
}

export function writeBrandArtifacts(rootFs, rootPath, { evidence, resolved, contract }) {
  const path = rootFs.path || null;
  // caller passes node:fs + path — keep pure write helper
  const fs = rootFs.fs || rootFs;
  const join = rootFs.join || ((...parts) => parts.join('/'));
  const dir = join(rootPath, '.agentsam', 'brand');
  fs.mkdirSync(dir, { recursive: true });
  if (evidence) fs.writeFileSync(join(dir, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  if (resolved) fs.writeFileSync(join(dir, 'resolved.json'), `${JSON.stringify(resolved, null, 2)}\n`);
  if (contract) fs.writeFileSync(join(dir, 'contract.json'), `${JSON.stringify(contract, null, 2)}\n`);
  return { dir, files: ['evidence.json', 'resolved.json', 'contract.json'].filter(Boolean) };
}
