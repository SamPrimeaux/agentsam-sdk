import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const entryPoint = fileURLToPath(new URL('./localMediaSource.ts', import.meta.url));
const { outputFiles } = await build({
  entryPoints: [entryPoint], bundle: true, platform: 'node', format: 'esm',
  write: false, logLevel: 'silent',
});
const { listLocalMedia } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString('base64')}`);

test('Local media adapter lists actual FSA entries with type, metadata and previews', async () => {
  /** @type {string[]} */
  const reads = [];
  const fakeHost = {
    async list(/** @type {string} */ ref) {
      assert.equal(ref, 'directory_1');
      return [
        { kind: 'file', ref: 'file_a', name: 'photo.png' },
        { kind: 'directory', ref: 'directory_2', name: 'Models' },
      ];
    },
    async stat(/** @type {string} */ ref) {
      if (ref === 'file_a') return { bytes: 3, mime: 'image/png', mtime: '2026-11-11T00:00:00.000Z' };
      return { kind: 'directory', name: 'Models' };
    },
    async openRead(/** @type {string} */ ref) {
      reads.push(ref);
      return { async read(/** @type {number} */ maxBytes) {
        assert.equal(maxBytes, 8 * 1024 * 1024);
        return new Uint8Array([1, 2, 3]);
      } };
    },
  };
  const result = await listLocalMedia(fakeHost, 'directory_1');
  assert.equal(result.assets.length, 2);
  assert.equal(result.assets[0].source, 'local');
  assert.equal(result.assets[0].size_bytes, 3);
  assert.match(result.assets[0].url, /^blob:/);
  assert.equal(result.assets[1].local_directory, true);
  assert.equal(result.assets[1].url, undefined);
  assert.deepEqual(reads, ['file_a']);
  for (const url of result.previewUrls) URL.revokeObjectURL(url);
});

test('oversized local media stays listed without copying into memory or cloud', async () => {
  let reads = 0;
  const fakeHost = {
    async list() { return [{ kind: 'file', ref: 'large', name: 'movie.mp4', bytes: 9 * 1024 * 1024, mime: 'video/mp4' }]; },
    async stat() { throw new Error('should not read file'); },
    async openRead() { reads += 1; throw new Error('should not read large file'); },
  };
  const result = await listLocalMedia(fakeHost, 'directory_1');
  assert.equal(result.assets.length, 1);
  assert.equal(result.assets[0].filename, 'movie.mp4');
  assert.equal(result.assets[0].url, undefined);
  assert.equal(reads, 0);
});
