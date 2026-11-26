import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createShellSamAdapter } from '../../src/sam/shell-host.js';
import { createLocalMediaStore } from '../../src/sam/adapters/local-media-store.js';
import { createObjectMediaStore } from '../../src/sam/adapters/object-media-store.js';
import { hasOpenCv, findOpenCvPython, createOpenCvVideoOperations } from '../../src/sam/adapters/opencv-video.js';
import { projectInstallationId } from '../../src/sam/adapters/workspace-media.js';

const ffmpegAvailable = spawnSync('ffmpeg', ['-version'], { timeout: 3000, stdio: 'ignore' }).status === 0;
const ffprobeAvailable = spawnSync('ffprobe', ['-version'], { timeout: 3000, stdio: 'ignore' }).status === 0;
const python = findOpenCvPython();

function testHost(root, accountId, authorize = async () => true) {
  const home = path.join(root, 'home-' + accountId);
  const trustedIdentity = { accountId, actorId: 'actor_' + accountId,
    installationId: projectInstallationId(root) };
  return {
    adapter: createShellSamAdapter({
      state: { home, cwd: root, projectRoot: root }, trustedIdentity, authorize,
    }),
    trustedIdentity,
  };
}

const makeVideo = filename => {
  execFileSync('ffmpeg', ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'testsrc=duration=2:size=64x48:rate=5',
    '-pix_fmt', 'yuv420p', '-c:v', 'mpeg4', filename], { timeout: 10000 });
};

test('OpenCV is an optional host capability, not a mandatory SDK import', () => {
  assert.equal(hasOpenCv('this-executable-does-not-exist'), false);
  assert.throws(() => createOpenCvVideoOperations({}), /sam_opencv_host_dependencies_unavailable/);
  // Finding the extra is a host decision, not part of SDK/model initialization.
});

test('real owned video import → OpenCV inspect → timestamped derivative frames', { skip: !python || !ffmpegAvailable || !ffprobeAvailable }, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sam-opencv-video-'));
  try {
    const sourcePath = path.join(root, 'recording.mp4');
    makeVideo(sourcePath);
    const permissions = [];
    const host = testHost(root, 'acct_media', async request => { permissions.push(request.capability_id); return true; });
    assert.equal(host.adapter.canInvoke('media.video.inspect'), true);
    assert.equal(host.adapter.canInvoke('media.video.sample_frames'), true);
    const imported = await host.adapter.invoke('media.local.import', { relativePath: 'recording.mp4' });
    assert.equal(imported.ok, true, JSON.stringify(imported.error));
    assert.equal(imported.data.contentType, 'video/mp4');
    const originalId = imported.data.assetId;
    const inspected = await host.adapter.invoke('media.video.inspect', { assetId: originalId, sampleCount: 4 });
    assert.equal(inspected.ok, true, JSON.stringify(inspected.error));
    assert.equal(inspected.data.video.width, 64);
    assert.equal(inspected.data.video.height, 48);
    assert.equal(inspected.data.samples.length, 4);
    assert.equal(inspected.data.samples[0].frame_index, 0);
    assert.equal(inspected.data.samples[0].timestamp_ms, 0);
    assert.ok(inspected.data.samples.every(sample => !('jpeg_base64' in sample)));
    assert.ok(inspected.data.limitations.length >= 1);

    const sampled = await host.adapter.invoke('media.video.sample_frames', {
      assetId: originalId, sampleCount: 4, maxWidth: 240,
    });
    assert.equal(sampled.ok, true, JSON.stringify(sampled.error));
    assert.equal(sampled.data.originalPreserved, true);
    assert.equal(sampled.data.frames.length, 4);
    assert.ok(sampled.data.frames.every(row => row.assetId && row.assetId !== originalId && row.timestamp_estimated));
    const store = createLocalMediaStore({ root: path.join(root, '.agentsam', 'media') });
    const original = await store.getOwnedAsset({ assetId: originalId, ...host.trustedIdentity });
    assert.equal(original.sha256, imported.data.sha256);
    const expected = await fs.readFile(sourcePath);
    assert.deepEqual(original.bytes, expected, 'video source must not be modified');
    for (const item of sampled.data.frames) {
      const derivative = await store.getOwnedAsset({ assetId: item.assetId, ...host.trustedIdentity });
      assert.equal(derivative.contentType, 'image/jpeg');
      assert.equal(derivative.sourceAssetId, originalId);
      assert.equal(derivative.sha256, item.sha256);
      assert.equal(derivative.bytes[0], 0xff);
      assert.equal(derivative.bytes[1], 0xd8);
    }
    assert.deepEqual(permissions, ['media.local.import', 'media.video.inspect', 'media.video.sample_frames']);

    const other = testHost(root, 'acct_intruder');
    const denied = await other.adapter.invoke('media.video.inspect', { assetId: originalId });
    assert.equal(denied.ok, false, 'asset is not visible to a different account');
    assert.match(JSON.stringify(denied.error), /not_found_or_forbidden/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('iPhone-style MOV containers are admitted and inspected by the same host operation', { skip: !python || !ffmpegAvailable || !ffprobeAvailable }, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sam-opencv-mov-'));
  try {
    makeVideo(path.join(root, 'screen-recording.mov'));
    const { adapter } = testHost(root, 'acct_mov');
    const imported = await adapter.invoke('media.local.import', { relativePath: 'screen-recording.mov' });
    assert.equal(imported.ok, true, JSON.stringify(imported.error));
    assert.equal(imported.data.contentType, 'video/quicktime');
    const inspected = await adapter.invoke('media.video.inspect', { assetId: imported.data.assetId, sampleCount: 3 });
    assert.equal(inspected.ok, true, JSON.stringify(inspected.error));
    assert.equal(inspected.data.video.width, 64);
    assert.equal(inspected.data.sampling.decoded, 3);
    assert.equal(inspected.data.samples[0].timestamp_estimated, true);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('approval denies frame writes before derivatives are created', { skip: !python || !ffmpegAvailable || !ffprobeAvailable }, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sam-opencv-deny-'));
  try {
    makeVideo(path.join(root, 'recording.mp4'));
    const { adapter, trustedIdentity } = testHost(root, 'acct_denied',
      async request => request.capability_id !== 'media.video.sample_frames');
    const imported = await adapter.invoke('media.local.import', { relativePath: 'recording.mp4' });
    assert.equal(imported.ok, true, JSON.stringify(imported.error));
    const denied = await adapter.invoke('media.video.sample_frames', { assetId: imported.data.assetId });
    assert.equal(denied.ok, false);
    assert.match(JSON.stringify(denied.error), /capability_or_resource_denied/);
    const store = createLocalMediaStore({ root: path.join(root, '.agentsam', 'media') });
    const untouched = await store.getOwnedAsset({ assetId: imported.data.assetId, ...trustedIdentity });
    assert.equal(untouched.sha256, imported.data.sha256);
    const entries = await fs.readdir(path.join(root, '.agentsam', 'media', trustedIdentity.accountId, trustedIdentity.installationId));
    assert.equal(entries.length, 2, 'only the original media .bin and .json should exist');
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('video import refuses traversal and invalid video masquerading as MP4', { skip: !ffprobeAvailable }, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sam-opencv-invalid-'));
  try {
    await fs.writeFile(path.join(root, 'fake.mp4'), 'not a video');
    const { adapter } = testHost(root, 'acct_invalid');
    const rejected = await adapter.invoke('media.local.import', { relativePath: 'fake.mp4' });
    assert.equal(rejected.ok, false);
    assert.match(JSON.stringify(rejected.error), /media_video_probe_failed|media_video_invalid_dimensions/);
    const traversal = await adapter.invoke('media.local.import', { relativePath: '../outside.mp4' });
    assert.equal(traversal.ok, false);
    assert.match(JSON.stringify(traversal.error), /media_path_outside_project/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});


test('OpenCV derivative frames use the existing connected R2-compatible store', { skip: !python || !ffmpegAvailable || !ffprobeAvailable }, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sam-opencv-r2-'));
  try {
    makeVideo(path.join(root, 'source.mp4'));
    const config = path.join(root, '.agentsam', 'media');
    await fs.mkdir(config, { recursive: true });
    await fs.writeFile(path.join(config, 'storage.v1.json'), JSON.stringify({
      schema: 'agentsam.media.storage.v1', kind: 'r2',
    }));
    const objects = new Map();
    const bucket = {
      async get(key) {
        const value = objects.get(key);
        return value ? { arrayBuffer: async () => value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) } : null;
      },
      async put(key, value) { objects.set(key, typeof value === 'string' ? Buffer.from(value) : Buffer.from(value)); },
      async delete(key) { objects.delete(key); },
    };
    const accountId = 'acct_opencv_r2';
    const trustedIdentity = { accountId, actorId: 'actor_opencv_r2',
      installationId: projectInstallationId(root) };
    const adapter = createShellSamAdapter({
      state: { cwd: root, projectRoot: root, home: path.join(root, 'home') },
      trustedIdentity, mediaBindings: { bucket }, authorize: async () => true,
    });
    assert.equal(adapter.canInvoke('media.video.sample_frames'), true);
    const imported = await adapter.invoke('media.local.import', { relativePath: 'source.mp4' });
    assert.equal(imported.ok, true, JSON.stringify(imported.error));
    const extracted = await adapter.invoke('media.video.sample_frames', {
      assetId: imported.data.assetId, sampleCount: 3,
    });
    assert.equal(extracted.ok, true, JSON.stringify(extracted.error));
    assert.equal(extracted.data.frames.length, 3);
    const store = createObjectMediaStore({ bucket });
    const original = await store.getOwnedAsset({ assetId: imported.data.assetId, ...trustedIdentity });
    assert.equal(original.sha256, imported.data.sha256);
    for (const row of extracted.data.frames) {
      const derivative = await store.getOwnedAsset({ assetId: row.assetId, ...trustedIdentity });
      assert.equal(derivative.sourceAssetId, original.id);
      assert.equal(derivative.sha256, row.sha256);
    }
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
