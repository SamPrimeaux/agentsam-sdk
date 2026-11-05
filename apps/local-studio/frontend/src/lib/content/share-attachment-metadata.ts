import type { ChatMessage } from "../../../../shared/agentsam/src/work-types";

export type ShareAttachment = { name: string; mimeType: string };

/** Copy safe display metadata from the canonical chat message shape. Never copy blob IDs or bytes. */
export function shareAttachmentMetadata(message: Pick<ChatMessage, "metadata">): ShareAttachment[] {
  const values = message.metadata?.attachments;
  if (!Array.isArray(values)) return [];
  return values.flatMap((item: unknown) => {
    if (!item || typeof item !== "object") return [];
    const attachment = item as Record<string, unknown>;
    if (attachment.kind !== "image" || typeof attachment.name !== "string") return [];
    const name = attachment.name.trim().slice(0, 255);
    if (!name) return [];
    const mimeType = typeof attachment.mimeType === "string" && /^image\/(png|jpeg|webp)$/.test(attachment.mimeType)
      ? attachment.mimeType : "image/*";
    return [{ name, mimeType }];
  });
}
