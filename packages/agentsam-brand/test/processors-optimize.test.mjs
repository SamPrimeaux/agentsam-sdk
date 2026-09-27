import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';

import {
  REJECTED_PROCESSORS,
  PROCESSOR_CAPABILITIES,
  planProcessorOrder,
  discoverProcessors,
  getProcessor,
  buildSemanticSlug,
  buildDerivativeFilename,
  validateDeliveryName,
  applySemanticNaming,
  optimizePolicyForRole,
  optimizeBrandAsset,
  normalizeAssetNode,
} from '../src/index.js';

const require = createRequire(import.meta.url);

describe('image processor contract', () => {
  it('rejects abandoned @squoosh/cli npm as a processor id', () => {
    assert.equal(REJECTED_PROCESSORS['squoosh-npm'].status, 'rejected');
    assert.equal(REJECTED_PROCESSORS['squoosh-npm'].package, '@squoosh/cli');
    assert.throws(
      () => getProcessor('@squoosh/cli'),
      (err) => err.code === 'processor_rejected',
    );
  });

  it('lists sharp / squoosh / native / cloudflare capabilities', () => {
    assert.ok(PROCESSOR_CAPABILITIES.sharp);
    assert.ok(PROCESSOR_CAPABILITIES.squoosh.note.includes('NOT @squoosh/cli'));
    assert.ok(PROCESSOR_CAPABILITIES.cloudflare.note.includes('DERIVABLE'));
    const disc = discoverProcessors();
    assert.ok(Array.isArray(disc.processors));
    assert.ok(disc.rejected.length >= 1);
    assert.ok(disc.available.includes('sharp') || disc.available.includes('squoosh') || disc.available.includes('native'));
  });

  it('plans processor order by job requirements', () => {
    const hero = planProcessorOrder({ format: 'avif' });
    assert.ok(hero.preferred.includes('sharp') || hero.preferred.includes('squoosh'));
    const jxl = planProcessorOrder({ format: 'jxl' });
    assert.equal(jxl.preferred[0], 'squoosh');
    const edge = planProcessorOrder({ delivery: 'cloudflare-images' });
    assert.equal(edge.preferred[0], 'cloudflare');
  });
});

describe('semantic naming', () => {
  it('builds readable slugs without keyword stuffing', () => {
    const slug = buildSemanticSlug({
      brandId: 'anything-floors-more',
      role: 'hero.primary',
      subject: ['showroom', 'hardwood'],
      page: 'home',
    });
    assert.ok(slug.includes('anything-floors-more') || slug.includes('floors'));
    assert.ok(slug.includes('hero') || slug.includes('primary'));
    assert.ok(!slug.includes('best'));
    assert.ok(!slug.includes('cheap'));
    const bad = validateDeliveryName('best-cheap-flooring-floor-installation-company-near-me-hero');
    assert.ok(bad.warnings.includes('keyword_stuffing') || bad.warnings.includes('too_many_segments'));
  });

  it('derivative filenames use width + format', () => {
    assert.equal(
      buildDerivativeFilename('acme-showroom-hero', { width: 1280, format: 'avif' }),
      'acme-showroom-hero-1280.avif',
    );
  });

  it('applySemanticNaming keeps asset id stable', () => {
    const named = applySemanticNaming(
      { id: 'ast_abc123', role: 'logo.primary' },
      { brandId: 'acme', subject: ['mark'] },
    );
    assert.equal(named.id, 'ast_abc123');
    assert.ok(named.naming.slug);
  });
});

describe('optimize policy + asset schema', () => {
  it('role policies differ for logo vs hero', () => {
    const logo = optimizePolicyForRole('logo.primary', { alpha: true });
    const hero = optimizePolicyForRole('hero.landscape', {});
    assert.ok(logo.lossless_preferred);
    assert.ok(hero.formats.includes('avif'));
    assert.ok(!logo.formats.includes('avif') || logo.formats[0] === 'png');
  });

  it('normalizeAssetNode includes semantic / naming / seo / providerMetadata', () => {
    const node = normalizeAssetNode({ id: 'ast_1', role: 'hero.primary' });
    assert.ok(node.semantic);
    assert.ok(node.naming);
    assert.ok(node.seo);
    assert.ok(node.providerMetadata);
  });
});

describe('optimizeBrandAsset (sharp)', () => {
  it('encodes a tiny PNG without exposing squoosh npm', async () => {
    let sharp;
    try {
      sharp = require('sharp');
    } catch {
      return; // skip if sharp missing in env
    }

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-opt-'));
    const src = path.join(dir, 'IMG_7382.png');
    await sharp({
      create: {
        width: 64,
        height: 64,
        channels: 3,
        background: { r: 37, g: 99, b: 235 },
      },
    }).png().toFile(src);

    const result = await optimizeBrandAsset({
      sourcePath: src,
      role: 'hero.landscape',
      brandId: 'acme',
      outDir: path.join(dir, 'out'),
      processor: 'sharp',
      semantic: { subject: ['workspace'], page: 'home', section: 'hero' },
    });

    assert.equal(result.ok, true);
    assert.ok(result.candidates.some((c) => c.status === 'generated'));
    assert.ok(result.naming?.slug || result.asset?.naming?.slug);
    assert.ok(result.comparison?.optimized?.bytes < result.comparison?.original?.bytes
      || result.candidates.some((c) => c.format === 'webp' || c.format === 'avif'));
    // Engines used must not be abandoned npm package
    for (const c of result.candidates.filter((x) => x.status === 'generated')) {
      assert.notEqual(c.processor, 'squoosh-npm');
      assert.ok(['sharp', 'squoosh', 'native'].includes(c.processor));
    }
    assert.ok(result.processors.rejected.some((r) => r.package === '@squoosh/cli'));

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('cloudflare target returns edge plans without local encode', async () => {
    let sharp;
    try {
      sharp = require('sharp');
    } catch {
      return;
    }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-cf-'));
    const src = path.join(dir, 'logo.png');
    await sharp({
      create: {
        width: 32,
        height: 32,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    }).png().toFile(src);

    const result = await optimizeBrandAsset({
      sourcePath: src,
      role: 'logo.primary',
      target: 'cloudflare',
      brandId: 'acme',
    });
    assert.equal(result.ok, true);
    assert.equal(result.delivery.provider, 'cloudflare-images');
    assert.ok(result.candidates.every((c) => c.derivative_kind === 'edge' || c.materialized === false));
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
