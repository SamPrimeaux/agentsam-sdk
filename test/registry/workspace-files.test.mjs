import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  workspaceRead, workspaceWrite, workspaceList, workspaceStat, workspacePatch, workspaceRemove,
} from '../../src/capabilities/workspace-files.js';

const fixturePath = new URL('../../protocol/runtime/workspace-fs.conformance.v1.json', import.meta.url);
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const sha = value => crypto.createHash('sha256').update(value).digest('hex');

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-workspace-contract-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-workspace-outside-'));
  for (const [name, content] of Object.entries(fixture.setup.files)) {
    fs.writeFileSync(path.join(root, name), content);
  }
  fs.writeFileSync(path.join(outside, 'secret.txt'), 'outside');
  fs.symlinkSync(outside, path.join(root, 'escape'));
  return { root, outside };
}

function inputFor(row, root) {
  const input = structuredClone(row.input);
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'string' && value.startsWith('@sha256:')) {
      const file = path.join(root, value.slice('@sha256:'.length));
      input[key] = sha(fs.readFileSync(file));
    }
  }
  return input;
}

function call(operation, input, root) {
  if (operation === 'read') return workspaceRead(input, root);
  if (operation === 'list') return workspaceList(input, root);
  if (operation === 'stat') return workspaceStat(input, root);
  if (operation === 'write') return workspaceWrite(input, root);
  if (operation === 'patch') return workspacePatch(input, root);
  if (operation === 'remove') return workspaceRemove(input, root);
  throw new Error('unknown fixture operation: ' + operation);
}

test('workspace file operations conform to the shared v1 fixtures', () => {
  for (const row of fixture.cases) {
    const { root, outside } = setup();
    try {
      const result = call(row.operation, inputFor(row, root), root);
      for (const [key, value] of Object.entries(row.expected)) assert.equal(result[key], value, row.id + ':' + key);
      if (row.expected_paths) assert.deepEqual(result.entries.map(entry => entry.path), row.expected_paths, row.id);
      if (row.operation === 'read') assert.match(result.sha256, /^[a-f0-9]{64}$/);
      if (row.operation === 'stat') assert.match(result.sha256, /^[a-f0-9]{64}$/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    }
  }
});

test('workspace file failures use stable codes from the shared v1 fixtures', () => {
  for (const row of fixture.failures) {
    const { root, outside } = setup();
    try {
      assert.throws(
        () => call(row.operation, inputFor(row, root), root),
        error => error?.message === row.expected_error,
        row.id,
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    }
  }
});
