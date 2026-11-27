import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { ensureProjectDirectory, readProjectFile, sha256, writeJsonAtomic } from './paths.js';

export async function compareVisuals({
  projectRoot,
  referencePath,
  renderedPath,
  outputDir = '.agentsam/primetech/qa/visual-comparison',
  pixelThreshold = 24,
  maxMeanAbsoluteError = 6,
  maxChangedPixelRatio = 0.02,
} = {}) {
  if (!Number.isInteger(pixelThreshold) || pixelThreshold < 1 || pixelThreshold > 255) throw new Error('visual_qa_pixel_threshold_invalid');
  if (!Number.isFinite(maxMeanAbsoluteError) || maxMeanAbsoluteError < 0 || maxMeanAbsoluteError > 255) throw new Error('visual_qa_mae_threshold_invalid');
  if (!Number.isFinite(maxChangedPixelRatio) || maxChangedPixelRatio < 0 || maxChangedPixelRatio > 1) throw new Error('visual_qa_changed_ratio_threshold_invalid');
  const reference = await readProjectFile(projectRoot, referencePath, 64 * 1024 * 1024);
  const rendered = await readProjectFile(projectRoot, renderedPath, 64 * 1024 * 1024);
  const referenceMeta = await sharp(reference.bytes).metadata();
  const renderedMeta = await sharp(rendered.bytes).metadata();
  if (referenceMeta.width !== renderedMeta.width || referenceMeta.height !== renderedMeta.height) {
    throw new Error(`visual_qa_dimensions_mismatch:${referenceMeta.width}x${referenceMeta.height}:${renderedMeta.width}x${renderedMeta.height}`);
  }
  const width = referenceMeta.width;
  const height = referenceMeta.height;
  if (!width || !height || width * height > 40_000_000) throw new Error('visual_qa_dimensions_invalid');
  const ref = await sharp(reference.bytes).ensureAlpha().raw().toBuffer();
  const out = await sharp(rendered.bytes).ensureAlpha().raw().toBuffer();
  const diff = Buffer.alloc(width * height * 4);
  let absoluteTotal = 0;
  let squaredTotal = 0;
  let changedPixels = 0;
  const pixelErrors = new Array(width * height);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const offset = pixel * 4;
    const dr = Math.abs(ref[offset] - out[offset]);
    const dg = Math.abs(ref[offset + 1] - out[offset + 1]);
    const db = Math.abs(ref[offset + 2] - out[offset + 2]);
    const da = Math.abs(ref[offset + 3] - out[offset + 3]);
    const error = Math.max(dr, dg, db, da);
    pixelErrors[pixel] = error;
    absoluteTotal += dr + dg + db + da;
    squaredTotal += dr * dr + dg * dg + db * db + da * da;
    if (error >= pixelThreshold) {
      changedPixels += 1;
      diff[offset] = 255;
      diff[offset + 1] = 24;
      diff[offset + 2] = 24;
      diff[offset + 3] = 210;
    }
  }
  pixelErrors.sort((a, b) => a - b);
  const channelCount = width * height * 4;
  const mae = absoluteTotal / channelCount;
  const rmse = Math.sqrt(squaredTotal / channelCount);
  const changedRatio = changedPixels / (width * height);
  const p95 = pixelErrors[Math.min(pixelErrors.length - 1, Math.floor(pixelErrors.length * 0.95))] || 0;
  const diffPng = await sharp(diff, { raw: { width, height, channels: 4 } }).png().toBuffer();
  const root = await ensureProjectDirectory(projectRoot, outputDir);
  const diffPath = path.join(root, 'diff.png');
  const overlayPath = path.join(root, 'overlay.png');
  await fs.writeFile(diffPath, diffPng, { mode: 0o600 });
  const overlay = await sharp(reference.bytes).ensureAlpha().composite([{ input: diffPng, blend: 'over' }]).png().toBuffer();
  await fs.writeFile(overlayPath, overlay, { mode: 0o600 });
  const passed = mae <= maxMeanAbsoluteError && changedRatio <= maxChangedPixelRatio;
  const report = {
    schema: 'agentsam.visual-qa-report.v1',
    status: passed ? 'pass' : 'review',
    reference: { path: referencePath, sha256: sha256(reference.bytes), width, height },
    rendered: { path: renderedPath, sha256: sha256(rendered.bytes), width, height },
    metrics: {
      meanAbsoluteError: Number(mae.toFixed(4)),
      rootMeanSquareError: Number(rmse.toFixed(4)),
      changedPixelRatio: Number(changedRatio.toFixed(6)),
      changedPixels,
      totalPixels: width * height,
      p95PixelError: p95,
      pixelThreshold,
    },
    thresholds: { maxMeanAbsoluteError, maxChangedPixelRatio },
    evidence: { diffPath: 'diff.png', diffSha256: sha256(diffPng), overlayPath: 'overlay.png', overlaySha256: sha256(overlay) },
    interpretation: 'Pixel comparison only. It does not judge semantic quality, typography, layout intent, or accessibility.',
  };
  const reportPath = path.join(root, 'report.json');
  await writeJsonAtomic(reportPath, report);
  return { ok: true, status: report.status, metrics: report.metrics, reportPath: path.relative(projectRoot, reportPath), diffPath: path.relative(projectRoot, diffPath), overlayPath: path.relative(projectRoot, overlayPath), report };
}
