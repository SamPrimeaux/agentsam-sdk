import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { evidenceError } from './contract.js';

const defaultExec = promisify(execFile);

/** Cover set derived from one master still. Sizes are the display sizes at 2x. */
export const EVIDENCE_COVERS = Object.freeze([
  { name: 'cover-840x504', width: 840, height: 504 },
  { name: 'thumb-144x144', width: 144, height: 144 },
  { name: 'banner-1000x256', width: 1000, height: 256 },
  { name: 'link-1200x630', width: 1200, height: 630 },
  { name: 'poster-540x960', width: 540, height: 960 },
]);

/**
 * Derivatives for `seal`. `sharp` is injected so the SDK has no hard image dependency; without it the
 * pack still works and simply ships originals. Masters are never modified.
 */
export function createDeriver({ sharp, ffmpeg = 'ffmpeg', exec = defaultExec, widths = [480, 960, 1920], avif = true, webpQuality = 82, avifQuality = 55 } = {}) {
  if (typeof sharp !== 'function') throw evidenceError('evidence_derive_unavailable', 'sharp');
  return {
    async stills({ bytes, stem }) {
      const { width: source } = await sharp(bytes).metadata();
      const usable = widths.filter((w) => w <= source);
      if (usable.length === 0) usable.push(source);
      const out = [];
      for (const width of usable) {
        out.push({ name: `${stem}.${width}w.webp`, bytes: await sharp(bytes).resize({ width, withoutEnlargement: true }).webp({ quality: webpQuality }).toBuffer(), width, format: 'webp' });
        if (avif) out.push({ name: `${stem}.${width}w.avif`, bytes: await sharp(bytes).resize({ width, withoutEnlargement: true }).avif({ quality: avifQuality, effort: 4 }).toBuffer(), width, format: 'avif' });
      }
      return out;
    },
    async covers({ bytes }) {
      const out = [];
      for (const cover of EVIDENCE_COVERS) {
        out.push({ name: `${cover.name}.webp`, bytes: await sharp(bytes).resize(cover.width, cover.height, { fit: 'cover', position: 'top' }).webp({ quality: webpQuality }).toBuffer(), width: cover.width, format: 'webp' });
      }
      return out;
    },
    async video({ path: file, stem }) {
      const dir = await mkdtemp(path.join(tmpdir(), 'evidence-derive-'));
      try {
        const mp4 = path.join(dir, 'web.mp4');
        const poster = path.join(dir, 'poster.png');
        const big = { maxBuffer: 32 * 1024 * 1024 };
        await exec(ffmpeg, ['-nostdin', '-v', 'error', '-y', '-i', file, '-map', '0:v:0', '-map', '0:a:0?', '-vf', "scale='min(1920,iw)':-2", '-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', mp4], big);
        await exec(ffmpeg, ['-nostdin', '-v', 'error', '-y', '-i', file, '-frames:v', '1', poster], big);
        return [
          { name: `${stem}.mp4`, bytes: await readFile(mp4), format: 'mp4' },
          { name: `${stem}.poster.webp`, bytes: await sharp(await readFile(poster)).webp({ quality: webpQuality }).toBuffer(), format: 'webp' },
        ];
      } finally { await rm(dir, { recursive: true, force: true }); }
    },
  };
}
