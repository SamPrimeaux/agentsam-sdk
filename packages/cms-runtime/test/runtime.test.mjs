import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const PACKAGE_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CLI = join(PACKAGE_ROOT, 'bin', 'cms-runtime.mjs');

function run(root, ...args) {
  const stdout = execFileSync(process.execPath, [CLI, ...args, '--root', root, '--json'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, NODE_NO_WARNINGS: '1' }
  });
  return JSON.parse(stdout);
}

test('clean project init is package-relative and self-describing', () => {
  const parent = mkdtempSync(join(tmpdir(), 'agentsam-cms-runtime-'));
  const root = join(parent, 'user123-site');
  mkdirSync(root);

  const initialized = run(root, 'init', '--project', 'user123-site');
  assert.equal(initialized.ok, true);
  assert.equal(initialized.database, '.agentsam/cms.sqlite');
  assert.equal(initialized.content, '.agentsam/cms-content');
  assert.equal(initialized.receipt, '.agentsam/cms/runtime.json');

  const receiptPath = join(root, '.agentsam', 'cms', 'runtime.json');
  const receiptText = readFileSync(receiptPath, 'utf8');
  const receipt = JSON.parse(receiptText);
  assert.equal(receipt.project.id, 'user123-site');
  assert.equal(receipt.package.name, '@inneranimalmedia/cms-runtime');
  assert.equal(receipt.schemaRef, 'package:@inneranimalmedia/cms-runtime/sqlite-schema');
  assert.equal(receipt.package.version, '2.6.8');
  assert.equal(receiptText.includes('/Users/samprimeaux'), false);
  assert.equal(receiptText.includes('agentsam-sdk-cms-runtime-release'), false);

  const doctor = run(root, 'doctor');
  assert.equal(doctor.ok, true);
  assert.equal(doctor.schema, 'inneranimalmedia.cms.local-runtime.v1');
  assert.equal(doctor.contract, 'cms-core.v1');
  assert.equal(doctor.project, 'user123-site');
  assert.equal(doctor.provider, 'sqlite');
  assert.equal(doctor.mode, 'local_authority');
  assert.ok(doctor.tools >= 15);
  assert.ok(doctor.skills >= 5);

  const db = new DatabaseSync(join(root, '.agentsam', 'cms.sqlite'));
  try {
    const source = db.prepare("SELECT value FROM cms_runtime_info WHERE key='schema_source'").get();
    assert.equal(source.value, 'package:@inneranimalmedia/cms-runtime/sqlite-schema');

    const publish = db.prepare(
      "SELECT availability,risk_level,mutates,requires_approval FROM cms_tool_catalog WHERE tool_key='cms.publish'"
    ).get();
    assert.deepEqual(
      {
        availability: publish.availability,
        risk_level: publish.risk_level,
        mutates: Number(publish.mutates),
        requires_approval: Number(publish.requires_approval)
      },
      {
        availability: 'adapter_required',
        risk_level: 'high',
        mutates: 1,
        requires_approval: 1
      }
    );
  } finally {
    db.close();
  }
});

test('tools and skills are discoverable through the packaged CLI', () => {
  const parent = mkdtempSync(join(tmpdir(), 'agentsam-cms-runtime-catalog-'));
  const root = join(parent, 'site');
  mkdirSync(root);
  run(root, 'init', '--project', 'catalog-site');

  const tools = run(root, 'tools');
  const skills = run(root, 'skills');

  assert.ok(tools.length >= 15);
  assert.ok(skills.length >= 5);
  assert.ok(tools.some((tool) => tool.tool_key === 'cms.publish'));
  assert.ok(skills.some((skill) => skill.skill_key === 'cms.publish-safely'));
});
