import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { ArrowUpRight, Lightbulb, LoaderCircle, Plus, RefreshCw } from 'lucide-react';
import type { WorkTicket } from '@inneranimalmedia/agentsam-work/contracts';
import { sharedLiveWorkHost } from '@/components/work/LocalStudioWorkPage';
import { useCurrentUserState } from '@/lib/auth/use-current-user';
import { RedirectToSignIn } from '@/lib/auth/gates';

export const Route = createFileRoute('/(apps)/ideas')({ component: IdeasPage });

/** Ideas are existing account-owned Work tickets tagged "idea"; no new database
 * or duplicate registry. Goal promotion remains an explicit user decision. */
function IdeasPage() {
  const { user, isPending } = useCurrentUserState();
  const navigate = useNavigate();
  const [allTickets, setAllTickets] = useState<WorkTicket[]>([]);
  const [draft, setDraft] = useState('');
  const [details, setDetails] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [canCreate, setCanCreate] = useState(false);
  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);setError('');
    try {
      const snapshot = await sharedLiveWorkHost().snapshot({ surface: 'tickets' });
      setAllTickets(snapshot.tickets);
      setCanCreate(snapshot.capabilities?.tickets.create ?? Boolean(sharedLiveWorkHost().createTicket));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Ideas could not be loaded.');
    } finally { setLoading(false); }
  }, [user?.id]);
  useEffect(() => {void load();}, [load]);
  const ideas = useMemo(() => allTickets.filter(ticket =>
    (ticket.surface === 'ideas' || ticket.tags.includes('idea'))
      && (ticket.title + ' ' + (ticket.description || '')).toLowerCase().includes(query.toLowerCase())
  ).sort((a, b) => b.updatedAt - a.updatedAt), [allTickets, query]);
  const capture = async (event: FormEvent) => {
    event.preventDefault();
    const title = draft.trim();
    if (!title || saving || !canCreate) return;
    setSaving(true);setError('');
    try {
      const host = sharedLiveWorkHost();
      if (!host.createTicket) throw new Error('Idea capture is not available on this account.');
      await host.createTicket({
        title, description: details.trim() || null, surface: 'ideas',
        status: 'backlog', tags: ['idea'], blockedBy: [], blocks: [],
      });
      setDraft('');setDetails('');
      await load();
    } catch (cause) {setError(cause instanceof Error ? cause.message : 'Could not save your idea.');}
    finally {setSaving(false);}
  };
  if (isPending) return <p role="status" className="p-5 text-sm text-muted-foreground">Loading your ideas…</p>;
  if (!user) return <RedirectToSignIn />;
  return <main className="agentsam-personal-surface" data-studio-product="ideas">
    <header className="agentsam-personal-heading"><div><h1>Ideas</h1><p>Save a thought before it becomes a task or a goal.</p></div>
      <button type="button" onClick={()=>void load()} aria-label="Refresh ideas" title="Refresh ideas"><RefreshCw size={17}/></button>
    </header>
    <form className="agentsam-idea-capture" onSubmit={(event)=>void capture(event)}>
      <label htmlFor="agentsam-idea-title" className="sr-only">New idea</label>
      <input id="agentsam-idea-title" value={draft} maxLength={240}
        placeholder="What are you thinking about?" onChange={event=>setDraft(event.target.value)} />
      {draft.trim() ? <textarea aria-label="Idea details (optional)" rows={3} maxLength={5000}
        placeholder="A little more context (optional)" value={details} onChange={event=>setDetails(event.target.value)} /> : null}
      <button type="submit" disabled={!canCreate || !draft.trim() || saving}>
        {saving ? <LoaderCircle size={17} className="animate-spin"/> : <Plus size={17}/>} Save idea
      </button>
    </form>
    {error ? <p role="alert" className="agentsam-personal-error">{error}</p> : null}
    <div className="agentsam-personal-list-header"><h2>Saved ideas</h2>
      <input aria-label="Find a saved idea" placeholder="Find an idea" value={query} onChange={event=>setQuery(event.target.value)} /></div>
    {loading ? <p className="agentsam-personal-state" role="status">Loading saved ideas…</p>
      : ideas.length ? <ul className="agentsam-idea-list">{ideas.map(idea=><li key={idea.id}>
        <Lightbulb size={18} aria-hidden="true"/>
        <div><strong>{idea.title}</strong>{idea.description ? <p>{idea.description}</p> : null}</div>
        <button type="button" aria-label={'Open '+idea.title+' in Work'} title="Open in Work"
          onClick={()=>void navigate({to:'/tickets'})}><ArrowUpRight size={17}/></button>
      </li>)}</ul>
      : <p className="agentsam-personal-state">No saved ideas here yet. Capture one above, or continue an existing conversation.</p>}
  </main>;
}
