/**
 * AgentSam file uploads — R2 bodies + D1 metadata.
 */

import { FNF_ACCOUNT_ID } from "./constants.js";
import { isFeatureEnabled } from "./feature-gates.js";
import { getSessionUser } from "../lib/auth.js";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"]);
const ALLOWED_TEXT = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
]);
const ALLOWED_EXT = new Set(["txt", "md", "csv", "json"]);

function json(data, init = {}) {
  return Response.json(data, init);
}

function sanitizeFilename(name) {
  const lastDot = name.lastIndexOf(".");
  const base = lastDot === -1 ? name : name.slice(0, lastDot);
  const ext = lastDot === -1 ? "" : name.slice(lastDot).toLowerCase();
  const cleanBase = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
  return (cleanBase || "file") + ext.replace(/[^a-z0-9.]/g, "");
}

function guessMimeFromName(name) {
  const ext = (name.split(".").pop() || "").toLowerCase();
  const map = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    txt: "text/plain",
    md: "text/markdown",
    csv: "text/csv",
    json: "application/json",
  };
  return map[ext] || "application/octet-stream";
}

function isAllowed(mime, name) {
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (mime === "application/pdf" || ext === "pdf") return false;
  if (!isFeatureEnabled("image_upload") && ALLOWED_IMAGE.has(mime)) return false;
  if (ALLOWED_IMAGE.has(mime)) return true;
  if (ALLOWED_TEXT.has(mime)) return true;
  return ALLOWED_EXT.has(ext);
}

function r2PathFor(attachmentId, filename) {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `agentsam/attachments/${yyyy}/${mm}/${attachmentId}/${sanitizeFilename(filename)}`;
}

export async function getAttachmentById(env, id) {
  if (!env?.DB || !id) return null;
  return env.DB.prepare(
    `SELECT * FROM agentsam_attachments WHERE id = ? AND account_id = ? AND status != 'deleted' LIMIT 1`
  )
    .bind(id, FNF_ACCOUNT_ID)
    .first();
}

export async function resolveAttachmentsFromIds(env, ids = []) {
  const out = [];
  for (const id of ids.slice(0, 6)) {
    const row = await getAttachmentById(env, id);
    if (!row || row.status !== "ready") continue;
    const kind = String(row.mime_type || "").startsWith("image/") ? "image" : "file";
    out.push({
      attachment_id: row.id,
      name: row.file_name,
      mime_type: row.mime_type,
      kind,
      url: row.preview_url,
      size_bytes: row.file_size_bytes,
    });
  }
  return out;
}

export async function loadAttachmentBytes(env, row) {
  if (!row?.r2_key || !env.WEBSITE_ASSETS) return null;
  const obj = await env.WEBSITE_ASSETS.get(row.r2_key);
  if (!obj) return null;
  return obj.arrayBuffer();
}

async function readTextFromAttachment(env, row) {
  if (!row?.mime_type?.startsWith("text/") && row.mime_type !== "application/json") return null;
  const buf = await loadAttachmentBytes(env, row);
  if (!buf) return null;
  return new TextDecoder().decode(buf).slice(0, 12000);
}

export async function hydrateAttachmentsForChat(env, attachments, requestUrl) {
  const { enrichContextFromAttachments, normalizeAttachments } = await import("./attachments.js");
  const hydrated = [];

  for (const item of attachments) {
    if (item.attachment_id) {
      const row = await getAttachmentById(env, item.attachment_id);
      if (!row) continue;
      const entry = {
        attachment_id: row.id,
        name: row.file_name,
        mime_type: row.mime_type,
        kind: String(row.mime_type || "").startsWith("image/") ? "image" : "file",
        url: row.preview_url,
        size_bytes: row.file_size_bytes,
      };
      if (entry.kind === "image") {
        const buf = await loadAttachmentBytes(env, row);
        if (buf) {
          const u8 = new Uint8Array(buf);
          let binary = "";
          const chunk = 0x8000;
          for (let i = 0; i < u8.length; i += chunk) {
            binary += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
          }
          entry.image_base64 = btoa(binary);
        }
      } else {
        entry.text_content = await readTextFromAttachment(env, row);
      }
      hydrated.push(entry);
      continue;
    }
    hydrated.push(item);
  }

  const normalized = normalizeAttachments(hydrated);
  const context = await enrichContextFromAttachments(env, {}, normalized, requestUrl);
  return { attachments: normalized, context };
}

export async function agentsamFileUpload(request, env) {
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: "Unauthorized" }, { status: 401 });

  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!file || typeof file.arrayBuffer !== "function") {
    return json({ error: "No file provided" }, { status: 400 });
  }

  const buf = await file.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) {
    return json({ error: `File too large (max ${MAX_BYTES / (1024 * 1024)}MB)` }, { status: 400 });
  }

  const fileName = String(file.name || "upload");
  const mimeType = file.type || guessMimeFromName(fileName);
  const ext = (fileName.split(".").pop() || "").toLowerCase();

  if (mimeType === "application/pdf" || ext === "pdf") {
    return json({ error: "PDF extraction is not enabled for this workspace." }, { status: 415 });
  }

  if (!isAllowed(mimeType, fileName)) {
    return json({ error: "Unsupported file type" }, { status: 415 });
  }

  const attachmentId = `att_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const r2Key = r2PathFor(attachmentId, fileName);
  const previewUrl = `/media/${r2Key}`;
  const conversationId = form.get("conversation_id") ? String(form.get("conversation_id")) : null;

  await env.WEBSITE_ASSETS.put(r2Key, buf, { httpMetadata: { contentType: mimeType } });

  await env.DB.prepare(
    `INSERT INTO agentsam_attachments (
       id, account_id, conversation_id, uploaded_by,
       file_name, mime_type, file_size_bytes, r2_key, preview_url, status
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready')`
  )
    .bind(
      attachmentId,
      FNF_ACCOUNT_ID,
      conversationId,
      user.id || null,
      fileName,
      mimeType,
      buf.byteLength,
      r2Key,
      previewUrl
    )
    .run();

  return json({
    ok: true,
    attachment_id: attachmentId,
    file_name: fileName,
    mime_type: mimeType,
    file_size_bytes: buf.byteLength,
    preview_url: previewUrl,
    r2_key: r2Key,
    kind: mimeType.startsWith("image/") ? "image" : "file",
  });
}

export async function agentsamFileGet(env, id) {
  const row = await getAttachmentById(env, id);
  if (!row) return json({ error: "Not found" }, { status: 404 });
  return json({
    ok: true,
    attachment: {
      attachment_id: row.id,
      file_name: row.file_name,
      mime_type: row.mime_type,
      file_size_bytes: row.file_size_bytes,
      preview_url: row.preview_url,
      status: row.status,
      conversation_id: row.conversation_id,
      created_at: row.created_at,
    },
  });
}

export async function agentsamFileDelete(env, id) {
  const row = await getAttachmentById(env, id);
  if (!row) return json({ error: "Not found" }, { status: 404 });
  await env.DB.prepare(
    `UPDATE agentsam_attachments SET status = 'deleted' WHERE id = ? AND account_id = ?`
  )
    .bind(id, FNF_ACCOUNT_ID)
    .run();
  return json({ ok: true, deleted: true });
}
