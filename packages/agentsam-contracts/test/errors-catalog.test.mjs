import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const catalog = JSON.parse(fs.readFileSync(new URL('../../../protocol/errors/error-catalog.json', import.meta.url), 'utf8'));

test('error catalog vocabulary is unique and every reason references valid policy values', () => {
  const unique = values => assert.equal(new Set(values).size, values.length);
  unique(catalog.codes.map(row => row.name));
  unique(catalog.reasons.map(row => row.name));
  unique(catalog.severities);
  unique(catalog.source_kinds);
  unique(catalog.resolution_owners);
  unique(catalog.remediation_actions);
  const codes = new Set(catalog.codes.map(row => row.name));
  const severities = new Set(catalog.severities);
  const owners = new Set(catalog.resolution_owners);
  const actions = new Set(catalog.remediation_actions);
  for (const reason of catalog.reasons) {
    assert.ok(codes.has(reason.code), `unknown code for ${reason.name}`);
    assert.ok(severities.has(reason.severity), `unknown severity for ${reason.name}`);
    assert.ok(owners.has(reason.resolution_owner), `unknown resolution owner for ${reason.name}`);
    assert.ok(actions.has(reason.remediation_action), `unknown remediation action for ${reason.name}`);
  }
});
