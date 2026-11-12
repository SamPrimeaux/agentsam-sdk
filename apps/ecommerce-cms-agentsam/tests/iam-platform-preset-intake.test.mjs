import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const pack = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
const presets = pack.presets;

function catalogSkus(entry) {
  return entry.presets?.map(variant => variant.sku) || [entry.sku];
}

test('seven owner-supplied sources yield nine definitions and ten system presets', () => {
  assert.equal(pack.source_files.length, 7);
  assert.equal(presets.length, 9);
  assert.equal(new Set(presets.map(p => p.definition_key)).size, 9);
  const skus = presets.flatMap(catalogSkus);
  assert.equal(skus.length, 10);
  assert.equal(new Set(skus).size, 10);
});

test('all editable defaults have declared typed settings and no executable HTML', () => {
  for (const preset of presets) {
    assert.match(preset.definition_key, /^[a-z][a-z0-9-]{0,63}$/);
    assert.equal(preset.settings_schema.type, 'object');
    assert.equal(preset.settings_schema.additionalProperties, false);
    assert.deepEqual(Object.keys(preset.default_settings).sort(), Object.keys(preset.settings_schema.properties).sort());
    for (const field of preset.editor_fields) {
      assert.ok(preset.settings_schema.properties[field.id], `${preset.definition_key}/${field.id}`);
    }
    assert.doesNotMatch(JSON.stringify(preset.default_settings), /<script|javascript:/i);
    assert.equal(preset.implementation_status, 'unverified');
    assert.equal(preset.source_fidelity.verified_merchant_roundtrip, false);
    assert.match(preset.original_sha256, /^[a-f0-9]{64}$/);
  }
});

test('auth is one safe renderer contract with separate sign-in and sign-up visual presets', () => {
  const auth = presets.find(p => p.definition_key === 'auth-galaxy-access');
  assert.equal(auth.kind, 'page');
  assert.deepEqual(auth.presets.map(x => x.mode), ['signin', 'signup']);
  const keys = Object.keys(auth.settings_schema.properties);
  assert.ok(!keys.some(k => /endpoint|client.?secret|cookie|session|redirect.?allow/i.test(k)));
  assert.equal(auth.data_bindings.auth_action, 'platform.auth.signin');
  assert.equal(auth.data_bindings.oauth_options, 'platform.auth.providers');
});

test('header and footer remain globals, carousel has repeatable media blocks', () => {
  const header = presets.find(p => p.definition_key === 'iam-glass-header');
  const footer = presets.find(p => p.definition_key === 'iam-editorial-footer');
  const vignette = presets.find(p => p.definition_key === 'case-vignettes');
  assert.equal(header.placement, 'global:header');
  assert.equal(footer.placement, 'global:footer');
  assert.equal(vignette.blocks[0].type, 'vignette-card');
  assert.equal(vignette.blocks[0].repeatable, true);
  assert.ok(vignette.blocks[0].fields.includes('media_asset'));
});