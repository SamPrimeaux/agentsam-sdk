/**
 * Portable multimodal attachment intake (CLI + Local Studio).
 * Authority: AgentAttachment references — never base64 in AgentInput.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.heic', '.heif', '.svg']);

function trySharp() {
  try {
    return require('sharp');
  } catch {
    return null;
  }
}

function sha256Buffer(buf) {
  return `sha256:${crypto.createHash('sha256').update(buf).digest('hex')}`;
}

function sniffMime(buf, filePath = '') {
  if (buf?.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
  if (buf?.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf?.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  if (buf?.length >= 12 && buf.toString('ascii', 4, 8) === 'ftyp') return 'image/avif';
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.svg' || (buf && /<svg[\s>]/i.test(buf.toString('utf8', 0, 256)))) return 'image/svg+xml';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return 'application/octet-stream';
}

function kindFromMime(mime) {
  if (String(mime).startsWith('image/')) return 'image';
  if (String(mime).startsWith('audio/')) return 'audio';
  if (String(mime).startsWith('video/')) return 'video';
  if (String(mime).startsWith('text/')) return 'text';
  return 'binary';
}

function nextTokenLabel(index) {
  return `[Image #${index}]`;
}

/**
 * Intake a local filesystem path into a structured AgentAttachment.
 * Local-first: no Cloudflare required.
 */
export async function intakeLocalPath(filePath, {
  lifetime = 'ephemeral',
  workDir = path.join(os.tmpdir(), 'agentsam-attachments'),
  maxPixels = 40_000_000,
  inferenceLongEdge = 2048,
  index = 1,
} = {}) {
  const abs = path.resolve(String(filePath).replace(/^@/, '').replace(/^['"]|['"]$/g, ''));
  if (!fs.existsSync(abs)) {
    const err = new Error(`attachment_missing:${abs}`);
    err.code = 'attachment_missing';
    throw err;
  }
  const buf = fs.readFileSync(abs);
  const mimeType = sniffMime(buf, abs);
  const kind = kindFromMime(mimeType);
  const id = `att_${crypto.randomBytes(8).toString('hex')}`;
  const sha256 = sha256Buffer(buf);
  const name = path.basename(abs);

  /** @type {import('../../agentsam-contracts/src/artifacts.ts').AgentAttachment} */
  const attachment = {
    id,
    name,
    mimeType,
    size: buf.length,
    kind,
    source: { type: 'local_path', path: abs },
    sha256,
    lifetime,
    metadata: {
      token: kind === 'image' ? nextTokenLabel(index) : `[File #${index}]`,
    },
  };

  if (kind === 'image' && mimeType !== 'image/svg+xml') {
    const sharp = trySharp();
    if (sharp) {
      const meta = await sharp(buf, { failOn: 'none' }).metadata();
      const width = meta.width || 0;
      const height = meta.height || 0;
      if (width * height > maxPixels) {
        const err = new Error(`attachment_pixel_guard:${width}x${height}`);
        err.code = 'attachment_pixel_guard';
        throw err;
      }
      attachment.image = {
        width,
        height,
        alpha: Boolean(meta.hasAlpha),
        orientation: meta.orientation,
      };

      // Inference derivative — preserve original path as source
      fs.mkdirSync(workDir, { recursive: true });
      const inferPath = path.join(workDir, `${id}-inference.png`);
      let pipeline = sharp(buf, { failOn: 'none' }).rotate();
      const longEdge = Math.max(width, height);
      if (longEdge > inferenceLongEdge) {
        pipeline = pipeline.resize({
          width: width >= height ? inferenceLongEdge : undefined,
          height: height > width ? inferenceLongEdge : undefined,
          fit: 'inside',
          withoutEnlargement: true,
        });
      }
      // Flatten transparent marks onto neutral for vision (keep original intact)
      if (meta.hasAlpha) {
        pipeline = pipeline.flatten({ background: { r: 32, g: 36, b: 44 } });
      }
      await pipeline.png().toFile(inferPath);
      const inferStat = fs.statSync(inferPath);
      const inferMeta = await sharp(inferPath).metadata();
      attachment.inference = {
        mimeType: 'image/png',
        source: { type: 'local_path', path: inferPath },
        width: inferMeta.width,
        height: inferMeta.height,
        bytes: inferStat.size,
      };
      attachment.preview = { localPath: inferPath };
    } else {
      attachment.metadata.capability_warning = {
        status: 'blocked',
        reason: 'capability_missing',
        capability_id: 'image.raster.transform',
        acceptable_backends: ['sharp', 'imagemagick'],
      };
    }
  }

  return attachment;
}

/**
 * Parse CLI tokens for @path / absolute image paths dropped into the prompt.
 * Returns { text, attachmentPaths }.
 */
export function extractAttachmentPathsFromText(text = '') {
  const paths = [];
  let cleaned = String(text || '');
  // @./file or @/abs or @~/rel
  cleaned = cleaned.replace(/(^|\s)@([^\s]+)/g, (full, lead, p) => {
    const candidate = p.replace(/^['"]|['"]$/g, '');
    const expanded = candidate.startsWith('~/')
      ? path.join(os.homedir(), candidate.slice(2))
      : path.resolve(candidate);
    if (fs.existsSync(expanded) && IMAGE_EXT.has(path.extname(expanded).toLowerCase())) {
      paths.push(expanded);
      return `${lead}`;
    }
    return full;
  });
  // bare absolute/relative image path as sole token
  cleaned = cleaned.replace(/(^|\s)(\/?[^\s]+\.(?:png|jpe?g|webp|gif|avif|heic|svg))\b/gi, (full, lead, p) => {
    const expanded = p.startsWith('~/')
      ? path.join(os.homedir(), p.slice(2))
      : path.isAbsolute(p)
        ? p
        : path.resolve(p);
    if (fs.existsSync(expanded)) {
      paths.push(expanded);
      return lead;
    }
    return full;
  });
  return {
    text: cleaned.replace(/\s+/g, ' ').trim(),
    attachmentPaths: [...new Set(paths)],
  };
}

/**
 * Validate selected model modalities against attachments.
 * Fail closed — never silently swap models.
 */
export function validateAttachmentModalities({ attachments = [], model = {} } = {}) {
  const modalities = new Set(model.input_modalities || model.inputModalities || ['text']);
  const accepted = new Set(
    model.attachment_policy?.accepted_mime_types
      || model.acceptedMimeTypes
      || (modalities.has('image') ? ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] : []),
  );
  const images = attachments.filter((a) => a.kind === 'image' || String(a.mimeType || '').startsWith('image/'));
  if (!images.length) return { ok: true, images: [] };
  if (!modalities.has('image')) {
    return {
      ok: false,
      code: 'model_rejects_image',
      message: `${model.id || model.name || 'Selected model'} does not accept image input.`,
      images,
    };
  }
  for (const img of images) {
    const mime = String(img.inference?.mimeType || img.mimeType || '');
    if (accepted.size && mime && !accepted.has(mime) && !accepted.has(img.mimeType)) {
      return {
        ok: false,
        code: 'mime_not_accepted',
        message: `${model.id || 'Model'} does not accept ${mime || img.mimeType}.`,
        images,
      };
    }
  }
  return { ok: true, images };
}

export function formatAttachmentChip(attachment) {
  const token = attachment.metadata?.token || attachment.name;
  const dims = attachment.image
    ? `${attachment.image.width}×${attachment.image.height}`
    : '—';
  const kb = attachment.size < 1024
    ? `${attachment.size} B`
    : `${(attachment.size / 1024).toFixed(attachment.size >= 10240 ? 0 : 1)} KB`;
  return `${token}  ${attachment.mimeType || 'unknown'} · ${dims} · ${kb}`;
}
