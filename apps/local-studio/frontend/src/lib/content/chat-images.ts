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
export type ChatImagePayload = { mimeType: string; dataUrl: string };

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
  refs: ChatImageReference[], accountId: string,
): Promise<ChatImagePayload[]> {
  if (!refs.length) return [];
  if (!accountId) throw new Error("Sign in to reopen this image attachment.");
  if (refs.length > 4) throw new Error("Send up to four images per message.");
  const { provider } = createIndexedDbContentStorage(accountId);
  const resolved: ChatImagePayload[] = [];
  for (const ref of refs) {
    if (ref.kind !== "image" || ref.source?.type !== "blob" || !ACCEPTED.has(ref.mimeType)) {
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
