import { useWorkStore } from './store';

/** The existing conversation is the only input destination for all Artifact editors.
 * A reference is attached to the existing pending-annotation envelope and
 * intentionally is not an authorization token or permission to mutate files.
 */
export type ArtifactAssistanceTarget = {
  kind: 'design' | 'whiteboard' | 'slides' | 'docs' | 'sheets' | 'data';
  id: string;
  title: string;
  chatId?: string | null;
  selection?: { id: string; kind: string; label?: string; text?: string };
};

export function askAgentSamAboutArtifact(target: ArtifactAssistanceTarget): string {
  const store = useWorkStore.getState();
  let chatId = target.chatId || store.activeChatId;
  if (!chatId || !store.chats.some(chat => chat.id === chatId)) chatId = store.startChat();
  if (!chatId) throw new Error('A conversation could not be started.');
  const label = target.selection?.label || target.title;
  store.setPendingAnnotations(chatId, (current) => [...current, {
    id: crypto.randomUUID(),
    label,
    page: 'artifact:' + target.kind + ':' + target.id,
    tag: target.selection?.kind || target.kind,
    text: [target.title, target.selection?.id ? 'Selected ' + target.selection.kind + ': ' + target.selection.id : '',
      target.selection?.text?.slice(0, 1500) || ''].filter(Boolean).join(' · '),
  }].slice(-8));
  if (!(store.drafts[chatId] || '').trim()) {
    store.setDraft(chatId, target.selection ? 'Help me with this selection.' : 'Help me with this ' + target.kind + ' artifact.');
  }
  if (store.activeChatId !== chatId) store.setActiveChat(chatId);
  if (typeof document !== 'undefined') {
    requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>('.agentsam-conversation-dock textarea')?.focus());
  }
  return chatId;
}
