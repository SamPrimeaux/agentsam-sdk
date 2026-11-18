import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pack = path.join(root, 'starter-packs/increase-sales/v1');
const destination = path.join(pack, 'forms-dist');
const readJSON = relativePath => JSON.parse(fs.readFileSync(path.join(destination, relativePath), 'utf8'));

test('Campaign package reproducibly builds the Forms/popup R2 distribution', () => {
  execFileSync(process.execPath, [path.join(pack, 'build-forms.mjs')], {cwd: pack, stdio: 'pipe'});
  const manifest = readJSON('manifest.json');
  const catalog = readJSON('catalog.json');
  assert.equal(manifest.owner, '@inneranimalmedia/agentsam-campaign');
  assert.equal(manifest.r2_prefix, 'forms/campaigns/increase-sales/v1/');
  assert.equal(manifest.campaigns, 14);
  assert.equal(manifest.modals, 14);
  assert.equal(manifest.forms, 10);
  assert.equal(manifest.distribution_file_count, 159);
  assert.equal(catalog.templates.length, 14);
  assert.equal(fs.existsSync(path.join(pack, 'release/agentsam-campaign-increase-sales-forms-v1.zip')), true);

  const forms = new Set();
  for (const entry of catalog.templates) {
    assert.ok(fs.existsSync(path.join(destination, entry.preview)), entry.id + ' preview missing');
    assert.ok(fs.existsSync(path.join(destination, entry.modal)), entry.id + ' popup missing');
    assert.equal(readJSON(entry.creation).campaign_template_id, entry.id);
    const html = fs.readFileSync(path.join(destination, entry.modal), 'utf8');
    assert.match(html, /role="dialog"/);
    assert.match(html, /Preview submission|does not require a signup form/);
    assert.doesNotMatch(html, /fetch\s*\(|XMLHttpRequest/);
    if (!entry.form) continue;
    forms.add(entry.form);
    const file = readJSON(entry.form);
    const doc = file.document;
    assert.equal(file.import_policy, 'user_installed_explicitly_as_draft');
    assert.equal(file.production_publish, false);
    assert.equal(doc.version, 1);
    assert.ok(['inline', 'popup'].includes(doc.mode));
    assert.ok(doc.fields.some(f => f.key === 'email' && f.required), entry.id + ' email missing');
    assert.ok(doc.fields.some(f => f.key === 'consent' && f.required && f.type === 'checkbox'), entry.id + ' consent missing');
    for (const field of doc.fields) assert.ok(['text', 'email', 'tel', 'textarea', 'select', 'checkbox'].includes(field.type));
  }
  assert.equal(forms.size, 10);
  assert.equal(manifest.files.length, 158);
  assert.equal(manifest.files.every(f => f.key.startsWith('forms/campaigns/increase-sales/v1/')), true);
});
