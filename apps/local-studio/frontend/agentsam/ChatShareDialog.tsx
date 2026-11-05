import { useEffect, useRef, useState } from 'react';
import { Copy, Link2, LoaderCircle, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

type ShareMessage = { role: string; content: string; attachments?: Array<{ name?: string; mimeType?: string }> };
type ShareTrail = { id: string; title: string; messages: ShareMessage[] };
type ShareLink = { id: string; title: string; url: string; createdAt: string };

/** Shared Work conversation share flow: create, copy, list and revoke public links. */
export function ChatShareDialog({ open, onOpenChange, trail }: { open: boolean; onOpenChange: (open: boolean) => void; trail: ShareTrail | null }) {
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const createdForOpen = useRef(false);

  async function loadLinks() {
    if (!trail) return;
    setLoading(true);
    try {
      const response = await fetch('/api/studio/conversation-shares?conversation_id=' + encodeURIComponent(trail.id), { credentials: 'same-origin' });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error('Unable to load links');
      setLinks(result.links ?? []);
    } catch { toast.error('Public links could not be loaded.'); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    if (!open) { createdForOpen.current = false; return; }
    void loadLinks();
    if (!createdForOpen.current && trail) { createdForOpen.current = true; void createLink(); }
  }, [open, trail?.id]);

  async function createLink() {
    if (!trail || busy) return;
    setBusy(true);
    try {
      const response = await fetch('/api/studio/conversation-shares', {
        method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ conversationId: trail.id, title: trail.title, messages: trail.messages.map(message => ({
          role: message.role, content: message.content,
          attachments: (message.attachments ?? []).map(file => ({ name: file.name ?? 'Image', mimeType: file.mimeType ?? 'image/*' })),
        })) }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok || !result.link?.url) throw new Error('Unable to create link');
      try {
        await navigator.clipboard.writeText(result.link.url);
        toast.success('Public link copied');
      } catch { toast.success('Public link created. Copy it below.'); }
      await loadLinks();
    } catch { toast.error('A public link could not be created.'); }
    finally { setBusy(false); }
  }

  async function revokeLink(id: string) {
    try {
      const response = await fetch('/api/studio/conversation-shares/' + encodeURIComponent(id), { method: 'DELETE', credentials: 'same-origin' });
      if (!response.ok) throw new Error('Unable to revoke link');
      setLinks(current => current.filter(link => link.id !== id));
      toast.success('Public link revoked');
    } catch { toast.error('The public link could not be revoked.'); }
  }

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-lg">
    <DialogTitle>Share conversation</DialogTitle>
    <DialogDescription>Anyone with a public link can view this conversation, including its text and attachment names.</DialogDescription>
    <button type="button" className="as-nav-button" onClick={() => void createLink()} disabled={!trail || busy}>
      {busy ? <LoaderCircle size={18} className="animate-spin" /> : <Link2 size={18} />}
      {busy ? 'Creating link…' : 'Create a public link'}
    </button>
    <section className="mt-5 space-y-2" aria-label="Manage public links">
      <h3 className="text-sm font-medium">Manage links</h3>
      {loading ? <p className="text-sm text-muted-foreground">Loading links…</p> : links.length ? links.map(link => <div key={link.id} className="flex items-center gap-2 rounded-lg border p-2">
        <a className="min-w-0 flex-1 truncate text-sm underline" href={link.url} target="_blank" rel="noreferrer">{link.url}</a>
        <button type="button" className="as-nav-button" aria-label="Copy public link" title="Copy link" onClick={() => void navigator.clipboard.writeText(link.url).then(() => toast.success('Link copied'), () => toast.error('Could not copy link'))}><Copy size={16} /></button>
        <button type="button" className="as-nav-button" aria-label="Revoke public link" title="Revoke link" onClick={() => void revokeLink(link.id)}><Trash2 size={16} /></button>
      </div>) : <p className="text-sm text-muted-foreground">No active links for this conversation.</p>}
    </section>
  </DialogContent></Dialog>;
}
