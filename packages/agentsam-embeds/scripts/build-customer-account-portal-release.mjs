/** Build the canonical Customer Account Portal as an immutable browser artifact. */
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [out, version = '1.0.0'] = process.argv.slice(2);
if (!out || !/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error('usage: build-customer-account-portal-release.mjs <output> [version]');
}
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const result = await build({
  entryPoints: [resolve(root, 'src/customer-account-portal.js')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  write: false,
  legalComments: 'none',
});
const bytes = result.outputFiles[0].contents;
const digest = hash(bytes);
const objectKey = `blobs/sha256/${digest.slice(0, 2)}/${digest}`;
const manifest = {
  schema: 'inneranimalmedia.cms-component-package.v2',
  id: 'platform/customer-account-portal',
  kind: 'cms-component-source',
  version,
  renderer_key: 'agentsam-embeds:customer-account-portal',
  embed_key: 'customer_account_portal',
  element: 'agentsam-customer-account-portal',
  entrypoint: 'customer-account-portal.js',
  preview_only: false,
  files: [{
    path: 'customer-account-portal.js',
    sha256: digest,
    bytes: bytes.length,
    content_type: 'text/javascript; charset=utf-8',
    object_key: objectKey,
  }],
};
const manifestKey = `packages/platform/customer-account-portal/${version}/manifest.json`;
const rawManifest = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
for (const [key, data] of [[objectKey, bytes], [manifestKey, rawManifest]]) {
  const file = resolve(out, key);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, data);
}
process.stdout.write(`${JSON.stringify({
  manifestKey,
  manifestSha256: hash(rawManifest),
  objectKey,
  sha256: digest,
  bytes: bytes.length,
  previewOnly: manifest.preview_only,
})}\n`);
