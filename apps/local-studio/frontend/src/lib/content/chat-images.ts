import { createIndexedDbContentStorage } from "@inneranimalmedia/agentsam-content";

export type ChatImageReference = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  kind: "image";
  source: { type: "blob"; blobId: string };
  lifetime: "conversation";
};
/** Chat files are account-local references, never content in the message or an unscoped URL. */
export type ChatFileReference = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  kind: 'file';
  source: { type: 'blob'; blobId: string };
  lifetime: 'conversation';
};
export type ChatAttachmentReference = ChatImageReference | ChatFileReference;
export type ChatImagePayload = { mimeType: string; dataUrl: string };

const TEXT_FILE_PATTERN = /\.(txt|md|markdown|csv|json|jsonl|yaml|yml|html?|xml|css|scss|tsx?|jsx?|mjs|cjs|py|rs|go|sql|sh|zsh|svg|toml|ini|log|java|kt|swift|c|h|cpp|hpp)$/i;
const FILE_PATTERN = /\.(pdf|docx?|xlsx?|pptx?|zip|glb|gltf|stl|ifc|mov|mp4|webm|png|jpg|jpeg|webp|svg|txt|md|markdown|csv|json|jsonl|yaml|yml|html?|xml|css|scss|tsx?|jsx?|mjs|cjs|py|rs|go|sql|sh|zsh|toml|ini|log|java|kt|swift|c|h|cpp|hpp)$/i;
export const MAX_CHAT_FILE_BYTES = 20 * 1024 * 1024;
export function isTextChatFile(name: string, mime: string): boolean {
  return TEXT_FILE_PATTERN.test(name) || /^(text\/|application\/(json|xml|javascript)$)/.test(mime);
}
export function acceptsChatFile(name: string, mime: string): boolean {
  return FILE_PATTERN.test(name) || mime === 'application/pdf' || isTextChatFile(name, mime);
}
export async function stageChatFile(file: File, accountId: string): Promise<ChatFileReference> {
  if (!accountId) throw new Error('Sign in before attaching a file.');
  if (!acceptsChatFile(file.name, file.type)) throw new Error('Unsupported file type: ' + file.name);
  if (!file.size || file.size > MAX_CHAT_FILE_BYTES) throw new Error('File must be 20 MB or smaller.');
  const mimeType = file.type || 'application/octet-stream';
  const { provider } = createIndexedDbContentStorage(accountId);
  const uploaded = await provider.upload({
    name: file.name, mime: mimeType, bytes: new Uint8Array(await file.arrayBuffer()),
  });
  if (!uploaded.ref) throw new Error('File could not be stored on this device.');
  return { id: crypto.randomUUID(), name: file.name, mimeType, size: file.size,
    kind: 'file', source: { type: 'blob', blobId: uploaded.ref }, lifetime: 'conversation' };
}

/** Verify the persisted reference before reading; never accept arbitrary model-provided URLs. */
export async function readChatAttachment(ref: ChatAttachmentReference, accountId: string): Promise<Blob> {
  if (!accountId || ref.source?.type !== 'blob' || !ref.source.blobId)
    throw new Error('Sign in to reopen this attached file.');
  const { provider } = createIndexedDbContentStorage(accountId);
  const head = await provider.head(ref.source.blobId);
  if (!head || !head.bytes || head.bytes !== ref.size || head.mime !== ref.mimeType)
    throw new Error('File bytes are unavailable or changed. Reattach the original file.');
  const url = provider.deliveryUrl(ref.source.blobId);
  if (!url) throw new Error('The original attachment is unavailable on this device.');
  const response = await fetch(url);
  if (!response.ok) throw new Error('Could not read the stored attachment.');
  return response.blob();
}

/** Text references are resolved only at the model boundary, with a hard content limit. */
export async function resolveChatFileContext(refs: ChatAttachmentReference[], accountId: string): Promise<string> {
  const parts: string[] = [];
  for (const ref of refs.filter((item): item is ChatFileReference => item.kind === 'file')) {
    const label = ref.name.replace(/[\r\n\[\]`]/g, '_').slice(0, 180);
    if (!isTextChatFile(ref.name, ref.mimeType) || ref.size > 1_000_000) {
      parts.push(`[Attached file: ${label} (${ref.mimeType}). Original bytes are available in Files, but this chat model cannot inspect this binary file directly.]`);
      continue;
    }
    const blob = await readChatAttachment(ref, accountId);
    const body = (await blob.text()).slice(0, 12000).replaceAll('```','``\u200b`');
    parts.push(`[Attached text file: ${label}\n${body}\n${blob.size > 12000 ? '(content excerpt truncated)' : ''}]`);
  }
  return parts.join('\n\n').slice(0, 42000);
}


const ACCEPTED = new Set(["image/png", "image/jpeg", "image/webp"]);
export const MAX_CHAT_IMAGE_BYTES = 5 * 1024 * 1024;

export async function stageChatImage(file: File, accountId: string): Promise<ChatImageReference> {
  if (!accountId) throw new Error("Sign in before attaching images.");
  if (!ACCEPTED.has(file.type)) throw new Error("Use a PNG, JPEG, or WebP screenshot.");
  if (!file.size || file.size > MAX_CHAT_IMAGE_BYTES) throw new Error("Image must be 5 MB or smaller.");
  const { provider } = createIndexedDbContentStorage(accountId);
  const uploaded = await provider.upload({
    name: file.name,
    mime: file.type,
    bytes: new Uint8Array(await file.arrayBuffer()),
  });
  if (!uploaded.ref) throw new Error("Image could not be stored on this device.");
  return {
    id: crypto.randomUUID(),
    name: file.name,
    mimeType: file.type,
    size: file.size,
    kind: "image",
    source: { type: "blob", blobId: uploaded.ref },
    lifetime: "conversation",
  };
}

export async function resolveChatImages(
  refs: ChatAttachmentReference[], accountId: string,
): Promise<ChatImagePayload[]> {
  if (!refs.length) return [];
  if (!accountId) throw new Error("Sign in to reopen this image attachment.");
  if (refs.length > 20) throw new Error("Send up to 20 images per message.");
  const { provider } = createIndexedDbContentStorage(accountId);
  const resolved: ChatImagePayload[] = [];
  for (const ref of refs.filter((item): item is ChatImageReference => item.kind === "image")) {
    if (ref.source?.type !== "blob" || !ACCEPTED.has(ref.mimeType)) {
      throw new Error("Unsupported attachment. Select a PNG, JPEG, or WebP image.");
    }
    const head = await provider.head(ref.source.blobId);
    if (!head || head.bytes !== ref.size || !head.bytes || head.bytes > MAX_CHAT_IMAGE_BYTES || head.mime !== ref.mimeType) {
      throw new Error("Image bytes are unavailable or changed. Reattach the original screenshot.");
    }
    const url = provider.deliveryUrl(ref.source.blobId);
    if (!url) throw new Error("Image bytes are unavailable. Reattach the screenshot.");
    const response = await fetch(url);
    if (!response.ok) throw new Error("Could not read the stored screenshot.");
    const blob = await response.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Could not prepare screenshot for the model."));
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(blob);
    });
    if (!dataUrl.startsWith("data:" + ref.mimeType + ";base64,")) throw new Error("Image encoding did not match its MIME type.");
    resolved.push({ mimeType: ref.mimeType, dataUrl });
  }
  return resolved;
}
