/**
 * Normalize chat attachments (images + text files) for AgentSam routing and prompts.
 */

const MAX_TEXT_CHARS = 12000;
const MAX_ATTACHMENTS = 6;

function parseJson(raw, fallback = null) {
  try {
    if (raw == null || raw === "") return fallback;
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return fallback;
  }
}

function bytesToBase64(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (!u8.length) return "";
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) {
    binary += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function absoluteUrl(url, requestUrl) {
  if (!url) return null;
  const s = String(url);
  if (/^https?:\/\//i.test(s)) return s;
  try {
    return new URL(s, requestUrl).toString();
  } catch {
    return s;
  }
}

function mediaKeyFromUrl(url) {
  const s = String(url || "");
  if (!s.startsWith("/media/")) return null;
  return s.slice("/media/".length);
}

export function normalizeAttachments(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const out = [];

  for (const item of list.slice(0, MAX_ATTACHMENTS)) {
    if (!item || typeof item !== "object") continue;

    const name = String(item.name || item.filename || "attachment").slice(0, 255);
    const mime_type = String(item.mime_type || item.content_type || "application/octet-stream").slice(
      0,
      120
    );
    const kind =
      item.kind ||
      (mime_type.startsWith("image/") ? "image" : item.text_content != null ? "text" : "file");

    const entry = {
      name,
      mime_type,
      kind,
      url: item.url ? String(item.url) : null,
      size_bytes: Number(item.size_bytes) || null,
    };

    if (item.image_base64) {
      entry.image_base64 = String(item.image_base64).replace(/^data:[^;]+;base64,/, "");
    }

    if (item.text_content != null) {
      entry.text_content = String(item.text_content).slice(0, MAX_TEXT_CHARS);
    }

    if (entry.kind === "image" || entry.image_base64 || entry.url) {
      out.push(entry);
    } else if (entry.text_content) {
      out.push(entry);
    }
  }

  return out;
}

export function formatAttachmentsForPrompt(attachments) {
  const textFiles = attachments.filter((a) => a.text_content);
  if (!textFiles.length) return "";

  const blocks = textFiles.map(
    (a) =>
      `--- ${a.name} (${a.mime_type || "text"}) ---\n${a.text_content}${
        a.text_content.length >= MAX_TEXT_CHARS ? "\n[truncated]" : ""
      }`
  );

  return `ATTACHED TEXT FILES:\n${blocks.join("\n\n")}`;
}

export function summarizeAttachments(attachments) {
  return attachments.map((a) => ({
    name: a.name,
    kind: a.kind,
    mime_type: a.mime_type,
    url: a.url,
    size_bytes: a.size_bytes,
    has_image: Boolean(a.image_base64 || (a.kind === "image" && a.url)),
    has_text: Boolean(a.text_content),
    text_chars: a.text_content ? a.text_content.length : 0,
  }));
}

export async function resolvePrimaryImageBase64(env, attachments, requestUrl) {
  const primary =
    attachments.find((a) => a.image_base64) ||
    attachments.find((a) => a.kind === "image" && a.url) ||
    attachments.find((a) => a.url && String(a.mime_type || "").startsWith("image/"));

  if (!primary) return { image_base64: null, image_url: null, attachment: null };
  if (primary.image_base64) {
    return {
      image_base64: primary.image_base64,
      image_url: primary.url ? absoluteUrl(primary.url, requestUrl) : null,
      attachment: primary,
    };
  }

  const key = mediaKeyFromUrl(primary.url);
  if (key && env.WEBSITE_ASSETS) {
    const obj = await env.WEBSITE_ASSETS.get(key);
    if (obj) {
      const buf = await obj.arrayBuffer();
      return {
        image_base64: bytesToBase64(buf),
        image_url: absoluteUrl(primary.url, requestUrl),
        attachment: primary,
      };
    }
  }

  const fetchUrl = absoluteUrl(primary.url, requestUrl);
  if (fetchUrl) {
    try {
      const res = await fetch(fetchUrl);
      if (res.ok) {
        const buf = await res.arrayBuffer();
        return {
          image_base64: bytesToBase64(buf),
          image_url: fetchUrl,
          attachment: primary,
        };
      }
    } catch {
      /* fall through */
    }
  }

  return {
    image_base64: null,
    image_url: absoluteUrl(primary.url, requestUrl),
    attachment: primary,
  };
}

export async function enrichContextFromAttachments(env, context, attachments, requestUrl) {
  const base = { ...(context || {}), attachments };
  const image = await resolvePrimaryImageBase64(env, attachments, requestUrl);

  base.has_image = Boolean(image.image_base64 || image.image_url);
  base.image_base64 = image.image_base64 || base.image_base64 || null;
  base.image_url = image.image_url || base.image_url || base.attachment_url || null;
  base.attachment_url = base.image_url;
  base.attachment_meta = summarizeAttachments(attachments);

  const extra = parseJson(context?.extra, null);
  if (extra) base.extra = extra;

  return base;
}
