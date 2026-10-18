import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseIssueIntake } from '../../scripts/issues/issue-intake.mjs';

test('scoped issue: required fields become an unapproved SAM handoff', () => {
  const issue = [
    '### User journey and desired outcome', 'End user sees saved output.',
    '### Existing owner and reusable implementation', 'Existing SDK package; inspect before edits.',
    '### Scope and non-goals', 'Preserve unrelated modules.',
    '### Acceptance criteria and failure paths', '- [ ] Happy and denied flows verified.',
    '### Delivery / installation / verification route', 'Stable preview URL and smoke receipt.',
    '### Prerequisites, dependencies, and approvals', '_No response_',
  ].join('\n\n');
  const result = parseIssueIntake(issue, 'task');
  assert.equal(result.readiness, 'needs_human_triage');
  assert.equal(result.agent_execution_authorized, false);
  assert.equal(result.fields.delivery, 'Stable preview URL and smoke receipt.');
  assert.deepEqual(result.missing_required_fields, []);
  assert.deepEqual(result.unrecognized_sections, ['Prerequisites, dependencies, and approvals']);
});

test('missing and unanswered mandatory fields cannot be marked intake-complete', () => {
  const result = parseIssueIntake('### User journey and desired outcome\n\nA working page.\n\n### Scope and non-goals\n\n_No response_','task');
  assert.equal(result.readiness, 'incomplete');
  assert.ok(result.missing_required_fields.includes('acceptance'));
  assert.ok(result.missing_required_fields.includes('boundaries'));
});

test('duplicate form headings fail instead of silently overwriting evidence', () => {
  assert.throws(() => parseIssueIntake('### Actual behavior\n\nOne\n\n### Actual behavior\n\nTwo', 'bug'), /duplicate_form_section/);
});

test('product form keeps resource lifecycle separate from action lifecycle', () => {
  const issue = [
    '### Who installs this and what do they expect?', 'An SDK installer.',
    '### End-to-end user journey', 'Install, create, preview, save, reopen.',
    '### Resource and action lifecycle', 'Resource CRUD plus plan/verify actions.',
    '### Existing source of truth and reuse', 'Existing owner.',
    '### User-visible interaction and states', 'Success, loading, denied.',
    '### Installation, host dependencies, and data control', 'Local first.',
    '### Product readiness and evidence', 'Browser and failure tests.',
    '### How users open it after delivery', 'Stable hosted URL.',
  ].join('\n\n');
  const result = parseIssueIntake(issue, 'product');
  assert.equal(result.readiness, 'needs_human_triage');
  assert.equal(result.fields.lifecycle, 'Resource CRUD plus plan/verify actions.');
  assert.equal(result.agent_execution_authorized, false);
});

test('CLI parses file to JSON without creating an executable task', () => {
  const dir = mkdtempSync(join(tmpdir(), 'samos-issue-intake-'));
  try {
    const file = join(dir, 'issue.md');
    writeFileSync(file, '### Affected application, interface, or operation\n\nBrand UI');
    const p = spawnSync(process.execPath, [new URL('../../scripts/issues/issue-intake.mjs', import.meta.url).pathname, '--kind','bug','--file',file], { encoding: 'utf8' });
    assert.equal(p.status, 2);
    const result = JSON.parse(p.stdout);
    assert.equal(result.kind, 'bug');
    assert.equal(result.readiness, 'incomplete');
    assert.equal(result.agent_execution_authorized, false);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
