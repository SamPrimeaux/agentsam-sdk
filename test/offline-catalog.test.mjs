import { doctorReport } from '../src/commands/catalog-doctor.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { recommendCatalog } from '../src/commands/catalog.js';

test('reusable native logic picks a portable Rust core', () => {
  const r = recommendCatalog({ goal:'native-core', reusable_core:'yes', execution:'multiple' });
  assert.equal(r.rule_id, 'rust-shared-core');
  assert.equal(r.recommendation.template, 'shared-core');
});

test('native process access beats a Worker-only recommendation', () => {
  const r = recommendCatalog({ goal:'api', execution:'edge', lifetime:'short', native_access:'process' });
  assert.equal(r.rule_id, 'native-required');
});

test('signed edge workloads select crypto-auth', () => {
  const r = recommendCatalog({ execution:'edge', lifetime:'short', signed_input:'yes' });
  assert.equal(r.rule_id, 'rust-crypto-auth');
});

test('reject unknown user answers instead of silently choosing', () => {
  assert.throws(() => recommendCatalog({ execution:'quantum' }), /Unsupported answer/);
});

test('catalog is generated and unreviewed packages remain explicitly drafts', () => {
  const f = new URL('../packages/catalog/generated/packages.json', import.meta.url);
  assert.ok(existsSync(f));
  const data = JSON.parse(readFileSync(f, 'utf8'));
  assert.ok(data.count > 0);
  assert.equal(data.packages.length, data.count);
  assert.ok(data.packages.some(p => p.catalog_status === 'needs-review'));
  assert.ok(data.packages.every(p => p.catalog_status !== 'classified'));
});

test('Python preference does not silently become Rust', () => {
  const r = recommendCatalog({ goal:'native-core', reusable_core:'yes', preferred_runtime:'python' });
  assert.equal(r.recommendation, null);
  assert.match(r.notes.join(' '), /No rule fits/);
});

test('native filesystem constraint beats a Worker rule', () => {
  const r = recommendCatalog({ execution:'edge', lifetime:'short', signed_input:'yes', native_access:'filesystem' });
  assert.equal(r.rule_id, 'native-required');
});

test('interactive questionnaire includes all 10 required decision dimensions', () => {
  const q = JSON.parse(readFileSync(new URL('../packages/catalog/assist/questions.json', import.meta.url),'utf8'));
  assert.equal(q.questions.length, 10);
});

test('doctor gives actionable remediation and needs no Python runtime', () => {
  const report = doctorReport((binary) => ({ error: new Error(binary + ' missing'), status: null }));
  assert.equal(report.ok, false);
  assert.equal(report.rust_wasm_ready, false);
  assert.ok(report.probes.every(p => p.repair && p.verify));
});
