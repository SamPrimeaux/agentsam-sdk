import type { WorkHost, WorkProjectChat } from "@inneranimalmedia/agentsam-work/contracts";
import { useWorkStore } from "@/lib/work/store";

/**
 * Local Studio's existing chats remain the only message authority. Linking
 * a chat to a Work project updates its metadata, never clones its messages.
 * This local adapter does NOT claim D1 synchronization of unsynced chats.
 */
function summarize(): Array<WorkProjectChat & { workProjectId?: string }> {
  return useWorkStore.getState().trails.map((chat) => ({
    id: chat.id,
    title: chat.title || "Untitled conversation",
    updatedAt: chat.updatedAt,
    messageCount: chat.messages.length,
    starred: Boolean(chat.pinned),
    workProjectId: chat.workProjectId,
  })).sort((a, b) => b.updatedAt - a.updatedAt);
}

export const localStudioProjectChats: Pick<
  WorkHost, "listProjectChats" | "listAssignableChats" | "assignProjectChat" | "createProjectChat"
> = {
  async listProjectChats(projectId) {
    return summarize().filter((chat) => chat.workProjectId === projectId);
  },
  async listAssignableChats() {
    return summarize();
  },
  async assignProjectChat(chatId, projectId) {
    const store = useWorkStore.getState();
    if (!store.trails.some((chat) => chat.id === chatId)) throw new Error("studio_chat_not_found");
    store.assignChatToWorkProject(chatId, projectId);
  },
  async createProjectChat(projectId) {
    const store = useWorkStore.getState();
    const id = store.startTrail();
    store.assignChatToWorkProject(id, projectId);
    return id;
  },
};
