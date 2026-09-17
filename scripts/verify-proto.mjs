import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateProto } from './generate-proto.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tracked = path.join(root, 'src/rpc/generated');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-proto-'));

function files(dir, prefix = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(prefix, entry.name);
    return entry.isDirectory() ? files(path.join(dir, entry.name), relative) : [relative];
  }).sort();
}

try {
  const generated = path.join(tmp, 'generated');
  generateProto(generated);
  assert.deepEqual(files(tracked), files(generated), 'generated RPC file set is stale; run npm run proto:generate');
  for (const relative of files(generated)) {
    assert.equal(
      fs.readFileSync(path.join(tracked, relative), 'utf8'),
      fs.readFileSync(path.join(generated, relative), 'utf8'),
      `generated RPC binding drift: ${relative}; run npm run proto:generate`,
    );
  }
  console.log('RPC protobuf bindings are deterministic and current.');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
