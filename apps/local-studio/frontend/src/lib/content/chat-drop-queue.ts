/** Browser-only transient handoff: dropped Files never travel through PTY stdin. */
const queue = new Map<string, File[]>();
export const CHAT_IMAGE_DROP_EVENT = "agentsam:pending-chat-images";

export function queueChatImages(targetId: string, files: File[]): void {
  if (!targetId || !files.length) return;
  queue.set(targetId, [...(queue.get(targetId) ?? []), ...files].slice(0, 4));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CHAT_IMAGE_DROP_EVENT, { detail: { targetId } }));
  }
}

export function takeChatImages(targetId: string): File[] {
  const files = queue.get(targetId) ?? [];
  queue.delete(targetId);
  return files;
}
