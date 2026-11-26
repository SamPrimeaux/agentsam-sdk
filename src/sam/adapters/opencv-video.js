/**
 * Optional SAM OpenCV video engine, installed only by an authenticated host.
 * Uses existing installation-owned asset storage, SAM receipts and approval.
 * No model-visible filesystem paths, provider assumptions or parallel media DB.
 */
import { spawnSync, execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { defineSamOperation } from '../define.js';

const runFile = promisify(execFile);
const ENGINE = fileURLToPath(new URL('../../../python/agentsam_sdk/media/opencv.py', import.meta.url));
const SHA256 = bytes => createHash('sha256').update(bytes).digest('hex');
const MAX_SOURCE_BYTES = 50 * 1024 * 1024;
const MAX_CONCURRENT_JOBS = 2;
const VIDEO_TYPES = Object.freeze({
  'video/mp4': '.mp4', 'video/quicktime': '.mov',
  'video/webm': '.webm', 'video/x-matroska': '.mkv',
  'video/x-msvideo': '.avi',
});

const openCvProbes = new Map();

/** Probe an installed Python interpreter; never install packages from chat. */
export function hasOpenCv(pythonExecutable) {
  if (!pythonExecutable || !existsSync(ENGINE)) return false;
  if (openCvProbes.get(pythonExecutable) === true) return true;
  const probe = spawnSync(pythonExecutable, ['-c', 'import cv2; print(cv2.__version__)'], {
    timeout: 5000, encoding: 'utf8', maxBuffer: 1024, windowsHide: true,
    env: { PATH: process.env.PATH || '', PYTHONNOUSERSITE: '1' },
  });
  const available = !probe.error && probe.status === 0 && /^\d+\.\d+/.test((probe.stdout || '').trim());
  if (available) openCvProbes.set(pythonExecutable, true);
  return available;
}

/** Prefer a project-specific Python extra; fall back to a host-provided Python. */
export function findOpenCvPython({ pythonExecutable = null } = {}) {
  const sdkRoot = path.resolve(path.dirname(ENGINE), '../../../');
  const candidates = [
    pythonExecutable,
    process.env.AGENTSAM_OPENCV_PYTHON,
    path.join(sdkRoot, 'python', '.venv', 'bin', 'python'),
    path.join(sdkRoot, 'python', '.venv', 'Scripts', 'python.exe'),
    'python3',
    ...(process.platform === 'win32' ? ['python'] : []),
  ];
  return [...new Set(candidates.filter(Boolean))].find(hasOpenCv) || null;
}

const OPTIONS = {
  type: 'object',
  properties: {
    assetId: { type: 'string', minLength: 1, maxLength: 128 },
    sampleCount: { type: 'integer', minimum: 1, maximum: 12 },
    maxWidth: { type: 'integer', minimum: 64, maximum: 960 },
    jpegQuality: { type: 'integer', minimum: 40, maximum: 90 },
  },
  required: ['assetId'], additionalProperties: false,
};

function requireIdentity(identity) {
  if (!identity?.accountId || !identity?.actorId || !identity?.installationId) {
    throw new Error('sam_opencv_trusted_identity_required');
  }
  return identity;
}

function validSource(source, requestedId, identity) {
  if (!source || source.id !== requestedId || source.accountId !== identity.accountId ||
      source.installationId !== identity.installationId) throw new Error('sam_opencv_asset_not_found_or_forbidden');
  if (!VIDEO_TYPES[source.contentType]) throw new Error('sam_opencv_video_required');
  if (!(source.bytes instanceof Uint8Array) || source.bytes.byteLength < 1 || source.bytes.byteLength > MAX_SOURCE_BYTES) {
    throw new Error('sam_opencv_source_invalid_or_oversized');
  }
}

/** Return actual executable SAM operations. No Python/OpenCV means no tools. */
export function createOpenCvVideoOperations({ assetStore, resolveTrustedContext, authorize, pythonExecutable,
                                               timeoutMs = 45000 } = {}) {
  if (!assetStore?.getOwnedAsset || !assetStore?.writeDerivative ||
      typeof resolveTrustedContext !== 'function' || typeof authorize !== 'function' ||
      !hasOpenCv(pythonExecutable)) {
    throw new TypeError('sam_opencv_host_dependencies_unavailable');
  }
  let running = 0;
  const execute = async (input, runtime, saveFrames) => {
    if (running >= MAX_CONCURRENT_JOBS) throw new Error('sam_opencv_host_busy');
    running += 1;
    let temporaryRoot = null;
    try {
      const identity = requireIdentity(await resolveTrustedContext(runtime));
      const operation = saveFrames ? 'media.video.sample_frames' : 'media.video.inspect';
      const granted = await authorize({
        operation, input, identity,
        policy: { effect: saveFrames ? 'media_derivative_create' : 'media_asset_read', target_scope: 'owned_media' },
      });
      if (granted !== true && granted?.allow !== true) throw new Error('capability_or_resource_denied');
      const source = await assetStore.getOwnedAsset({
        assetId: input.assetId, accountId: identity.accountId,
        actorId: identity.actorId, installationId: identity.installationId,
      });
      validSource(source, input.assetId, identity);
      const sourceBytes = Buffer.from(source.bytes);
      const sourceHash = SHA256(sourceBytes);
      if (source.sha256 && source.sha256 !== sourceHash) throw new Error('sam_opencv_source_hash_mismatch');
      temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'sam-opencv-'));
      const inputPath = path.join(temporaryRoot, 'source' + VIDEO_TYPES[source.contentType]);
      await writeFile(inputPath, sourceBytes, { mode: 0o600, flag: 'wx' });
      const args = [ENGINE, '--input', inputPath,
        '--samples', String(input.sampleCount ?? 8),
        '--width', String(input.maxWidth ?? 640),
        '--quality', String(input.jpegQuality ?? 76),
      ];
      if (saveFrames) args.push('--include-frames');
      let stdout;
      try {
        ({ stdout } = await runFile(pythonExecutable, args, {
          cwd: temporaryRoot, timeout: timeoutMs, maxBuffer: 14 * 1024 * 1024,
          windowsHide: true,
          env: { PATH: process.env.PATH || '', PYTHONNOUSERSITE: '1', PYTHONDONTWRITEBYTECODE: '1' },
        }));
      } catch (error) {
        if (error.killed || error.code === 'ETIMEDOUT') throw new Error('sam_opencv_timeout');
        // The Python engine emits structured codes; do not leak stderr or paths.
        let failure = null;
        try { failure = JSON.parse(String(error.stderr || '').trim()); } catch { /* intentionally ignored */ }
        if (failure?.ok === false && /^opencv_[a-z0-9_]+$/.test(failure.code || '')) {
          throw new Error('sam_' + failure.code);
        }
        throw new Error('sam_opencv_processing_failed');
      }
      let result;
      try { result = JSON.parse(stdout); }
      catch { throw new Error('sam_opencv_output_invalid'); }
      if (result?.ok !== true || result.schema !== 'agentsam.media.opencv-video.v1' ||
          !Array.isArray(result.samples) || result.samples.length < 1 || result.samples.length > 12) {
        throw new Error('sam_opencv_output_invalid');
      }
      const { samples, ...rest } = result;
      const base = { ...rest, sourceAssetId: source.id, sourceSha256: sourceHash };
      if (!saveFrames) {
        if (samples.some(item => item.jpeg_base64)) throw new Error('sam_opencv_unexpected_frame_bytes');
        return { ...base, samples };
      }
      // Validate all frame bytes before writing any derivatives. All resulting
      // objects inherit lineage and account/installation scope from the source.
      const verified = samples.map(sample => {
        if (!Number.isInteger(sample.frame_index) || typeof sample.jpeg_base64 !== 'string' ||
            sample.jpeg_base64.length > 2_000_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(sample.jpeg_base64)) {
          throw new Error('sam_opencv_frame_invalid');
        }
        const bytes = Buffer.from(sample.jpeg_base64, 'base64');
        if (bytes.length < 4 || bytes.length > 1_500_000 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
          throw new Error('sam_opencv_frame_invalid');
        }
        return { sample, bytes };
      });
      const frames = [];
      for (const { sample, bytes } of verified) {
        const frameHash = SHA256(bytes);
        const derivative = await assetStore.writeDerivative({
          accountId: identity.accountId, actorId: identity.actorId,
          installationId: identity.installationId, sourceAssetId: source.id,
          sourceHash, bytes, derivativeHash: frameHash, contentType: 'image/jpeg',
          transformations: ['opencv.video.sample_frame'],
          metadata: { frameIndex: sample.frame_index, timestampMs: sample.timestamp_ms,
            timestampEstimated: true, visualChangeScore: sample.visual_change_score },
          preservation: 'retain_original',
        });
        if (!derivative?.id || derivative.id === source.id) throw new Error('sam_opencv_derivative_not_created');
        frames.push({ assetId: derivative.id, sha256: frameHash,
          bytes: bytes.length, frame_index: sample.frame_index,
          timestamp_ms: sample.timestamp_ms, timestamp_estimated: true,
          visual_change_score: sample.visual_change_score });
      }
      return { ...base, frames, originalPreserved: true };
    } finally {
      if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true });
      running -= 1;
    }
  };
  return [
    defineSamOperation({
      id: 'media.video.inspect', version: 1, module: 'media', action: 'video.inspect',
      summary: 'Inspect an owned video with OpenCV: dimensions, nominal FPS, frame count, timecoded samples and numeric visual-change scores.',
      description: 'Model-independent OpenCV inspection. Results do not interpret scene contents or assert UI behavior.',
      execution: { lanes: ['local'], model: 'never', network: 'optional', sideEffects: 'none' },
      risk: 'read_only', capabilities: ['media.video.read'],
      input_schema: OPTIONS, handler: (input, runtime) => execute(input, runtime, false),
    }),
    defineSamOperation({
      id: 'media.video.sample_frames', version: 1, module: 'media', action: 'video.sample_frames',
      summary: 'Extract up to 12 timecoded JPEG frames from an owned video into the existing Media Library as immutable derivatives.',
      description: 'Requires host authorization for derivative creation; keeps source bytes intact.',
      execution: { lanes: ['local'], model: 'never', network: 'optional', sideEffects: 'local_write' },
      risk: 'write', capabilities: ['media.video.write'],
      input_schema: OPTIONS, handler: (input, runtime) => execute(input, runtime, true),
    }),
  ];
}
