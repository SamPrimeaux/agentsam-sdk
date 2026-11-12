import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Check, ChevronDown, ChevronRight, Circle, Plus, RefreshCcw, Target } from "lucide-react";
import { useWorkStore } from "@/lib/work/store";

type Goal = {
  id: string; source_key: string | null; title: string | null; description: string | null;
  goal_type: "personal" | "platform" | string; status: string; priority: number;
};
type Step = {
  id: string; goal_id: string; title: string; status: string; note?: string | null; evidence_ref?: string | null;
};
type LinkedTicket = { goal_id: string; ticket_id: string; title: string; status: string; project?: string | null };
type TicketCandidate = { id: string; title: string; status: string; project?: string | null };
type Plan = { goals: Goal[]; steps: Step[]; ticketLinks: LinkedTicket[] };
const endpoint = "/api/studio/living-plan";

export function LivingPlanPanel({
  legacyGoal,
  onLegacyImported,
}: {
  legacyGoal?: { title: string; preview?: string } | null;
  onLegacyImported?: () => void;
} = {}) {
  const [plan, setPlan] = useState<Plan>({ goals: [], steps: [], ticketLinks: [] });
  const [filter, setFilter] = useState<"personal" | "platform">(legacyGoal ? "platform" : "personal");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [importingLegacy, setImportingLegacy] = useState(false);
  const [addingStepFor, setAddingStepFor] = useState<string | null>(null);
  const [newStepTitle, setNewStepTitle] = useState("");
  const [ticketPickerFor, setTicketPickerFor] = useState<string | null>(null);
  const [ticketQuery, setTicketQuery] = useState("");
  const [ticketCandidates, setTicketCandidates] = useState<TicketCandidate[]>([]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(endpoint, { credentials: "same-origin" });
      if (!response.ok) throw new Error(response.status === 401 ? "Sign in to see your private goals." : "Goals are temporarily unavailable.");
      const data = await response.json() as Partial<Plan>;
      if (!Array.isArray(data.goals) || !Array.isArray(data.steps)) throw new Error("Goal data was incomplete.");
      setPlan({ goals: data.goals, steps: data.steps, ticketLinks: Array.isArray(data.ticketLinks) ? data.ticketLinks : [] });
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load goals.");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  const visible = useMemo(() => plan.goals.filter(g => filter === "platform"
    ? g.goal_type === "platform"
    : g.goal_type !== "platform"
  ), [plan.goals, filter]);
  const stepList = (id: string) => plan.steps.filter(s => s.goal_id === id);
  const finished = (id: string) => stepList(id).filter(s => s.status === "done").length;
  const total = visible.reduce((acc, g) => acc + stepList(g.id).length, 0);
  const completed = visible.reduce((acc, g) => acc + finished(g.id), 0);
  const focus = visible.find(g => g.status === "active" && stepList(g.id).some(s => s.status !== "done"))
    ?? visible.find(g => stepList(g.id).some(s => s.status !== "done"));
  const next = focus && stepList(focus.id).find(s => s.status !== "done");
  function continueInWork(goal: Goal, step: Step) {
    const links = plan.ticketLinks.filter(item => item.goal_id === goal.id);
    const workItems = links.length ? "\nExisting linked tickets:\n" + links
      .map(item => "- " + item.ticket_id + ": " + item.title + " (" + item.status + ")")
      .join("\n") : "";
    const prompt = [
      goal.goal_type === "platform"
        ? "Continue my saved InnerAnimalMedia platform goal without reopening completed decisions."
        : "Continue one next step from my private Living Plan.",
      "Goal: " + goal.title,
      "Next action: " + step.title + workItems,
      "",
      goal.goal_type === "platform"
        ? "Inspect the existing code, tickets and decisions before changing anything. Complete one testable vertical slice, attach evidence to the goal, and be explicit about blockers and remaining acceptance gates."
        : "Help me organize this one step clearly, without assumptions or declaring it completed for me. Where official records, personal documents, or professional advice are needed, identify what I should verify first.",
    ].join("\n");
    const state = useWorkStore.getState();
    const id = state.startChat();
    state.setDraft(id, prompt);
    state.setSideOpen(false);
    state.setWorkSurface("chat");
    window.dispatchEvent(new CustomEvent("agentsam:navigate", {
      detail: { to: "/chats/$chatId", params: { chatId: id } },
    }));
  }


  async function setStep(step: Step) {
    const status = step.status === "done" ? "todo" : "done";
    setPending(step.id);
    try {
      const response = await fetch(endpoint + "/steps/" + encodeURIComponent(step.id), {
        method: "PATCH", credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status, note: step.note || "", evidence_ref: step.evidence_ref || "" }),
      });
      if (!response.ok) throw new Error("Could not save this step. Try again.");
      setPlan(current => ({ ...current, steps: current.steps.map(item =>
        item.id === step.id ? { ...item, status } : item) }));
      setError(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save."); }
    finally { setPending(null); }
  }
  async function importOldConversationGoal() {
    if (!legacyGoal?.title.trim() || !onLegacyImported) return;
    setImportingLegacy(true);
    try {
      const response = await fetch(endpoint + "/goals", {
        method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          goal_type: filter,
          title: legacyGoal.title,
          description: legacyGoal.preview || "",
        }),
      });
      if (!response.ok) throw new Error("Could not save the conversation goal to your account.");
      await reload();
      onLegacyImported(); // Only discard the browser-only copy after the account write succeeds.
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Import failed."); }
    finally { setImportingLegacy(false); }
  }
  async function addGoal() {
    if (!newTitle.trim()) return;
    setPending("create");
    try {
      const response = await fetch(endpoint + "/goals", {
        method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim(), goal_type: filter }),
      });
      if (!response.ok) throw new Error("Could not create the goal.");
      setNewTitle("");
      setCreating(false);
      await reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save."); }
    finally { setPending(null); }
  }

  async function addStep(goalId: string) {
    if (!newStepTitle.trim()) return;
    setPending("new-step");
    try {
      const response = await fetch(endpoint + "/goals/" + encodeURIComponent(goalId) + "/steps", {
        method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: newStepTitle.trim() }),
      });
      if (!response.ok) throw new Error("Could not add the step.");
      setNewStepTitle(""); setAddingStepFor(null);
      await reload();
      setExpanded(goalId);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save step."); }
    finally { setPending(null); }
  }
  async function findTickets(query: string) {
    setPending("ticket-search");
    try {
      const response = await fetch(endpoint + "/tickets?q=" + encodeURIComponent(query), { credentials: "same-origin" });
      if (!response.ok) throw new Error("Could not search your engineering tickets.");
      const data = await response.json() as { tickets?: TicketCandidate[] };
      setTicketCandidates(Array.isArray(data.tickets) ? data.tickets : []);
      setError(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Ticket search failed."); }
    finally { setPending(null); }
  }
  async function linkTicket(goalId: string, ticketId: string) {
    setPending(ticketId);
    try {
      const response = await fetch(endpoint + "/goals/" + encodeURIComponent(goalId) + "/tickets", {
        method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ticket_id: ticketId }),
      });
      if (!response.ok) throw new Error("Couldn't link this ticket.");
      setTicketPickerFor(null);
      await reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Couldn't link ticket."); }
    finally { setPending(null); }
  }
  async function unlinkTicket(goalId: string, ticketId: string) {
    setPending(ticketId);
    try {
      const response = await fetch(endpoint + "/goals/" + encodeURIComponent(goalId) + "/tickets/" + encodeURIComponent(ticketId), {
        method: "DELETE", credentials: "same-origin",
      });
      if (!response.ok) throw new Error("Couldn't unlink this ticket.");
      setPlan(current => ({ ...current, ticketLinks: current.ticketLinks.filter(link =>
        link.goal_id !== goalId || link.ticket_id !== ticketId) }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Couldn't unlink ticket."); }
    finally { setPending(null); }
  }
  async function changeGoalStatus(goal: Goal) {
    const status = goal.status === "completed" ? "active" : "completed";
    setPending(goal.id);
    try {
      const response = await fetch(endpoint + "/goals/" + encodeURIComponent(goal.id), {
        method: "PATCH", credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error("Could not update the goal.");
      setPlan(current => ({ ...current, goals: current.goals.map(item =>
        item.id === goal.id ? { ...item, status } : item) }));
      setError(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update goal."); }
    finally { setPending(null); }
  }

  return <div className="flex h-full min-h-0 flex-col bg-background" data-living-plan>
    <div className="shrink-0 border-b border-border/70 px-4 py-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Target className="size-4 text-accent" aria-hidden="true" />
          <h2 className="text-base font-semibold tracking-tight">My goals</h2>
        </div>
        <button type="button" onClick={() => void reload()} aria-label="Refresh goals" title="Refresh goals"
          className="flex size-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground">
          <RefreshCcw className="size-4" aria-hidden="true" />
        </button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">One next step. Progress is saved to your account, not a chat.</p>
      <div className="mt-4 grid grid-cols-2 gap-1 rounded-lg bg-muted/50 p-1" role="group" aria-label="Goal areas">
        {(["personal", "platform"] as const).map(area => <button key={area} type="button"
          onClick={() => { setFilter(area); setExpanded(null); setCreating(false); }}
          aria-pressed={filter === area}
          className={"min-h-10 rounded-md px-3 text-sm font-medium transition-colors " + (filter === area
            ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
          {area === "personal" ? "Life" : "InnerAnimalMedia"}
        </button>)}
      </div>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-10 pt-4">
      {legacyGoal ? <section className="mb-4 rounded-xl border border-border p-3">
        <p className="text-xs font-semibold">Unsaved conversation goal</p>
        <p className="mt-1 line-clamp-3 text-sm">{legacyGoal.title}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          This older goal is stored only on this device. Save it into the selected area to make it available across your account.
        </p>
        <button type="button" disabled={importingLegacy || !onLegacyImported}
          onClick={() => void importOldConversationGoal()}
          className="mt-3 min-h-11 rounded-lg bg-foreground px-4 text-sm font-medium text-background">
          {importingLegacy ? "Saving…" : "Save to " + (filter === "personal" ? "Life goals" : "InnerAnimalMedia goals")}
        </button>
      </section> : null}
      {error ? <div role="alert" className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div> : null}
      {loading ? <p className="py-10 text-center text-sm text-muted-foreground">Loading private goals…</p> : <>
        <div className="mb-5 flex items-baseline justify-between gap-2">
          <p className="text-sm font-medium">{visible.length} goals</p>
          <p className="text-xs tabular-nums text-muted-foreground">{completed} of {total} steps complete</p>
        </div>
        {next ? <section className="mb-5 rounded-xl border border-border bg-card p-4" aria-label="Next action">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Next concrete step</p>
          <p className="text-xs text-muted-foreground">{focus?.title}</p>
          <div className="mt-3 flex items-start gap-3">
            <button type="button" disabled={pending === next.id} aria-label="Complete next step" onClick={() => void setStep(next)}
              className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground hover:border-accent hover:text-accent">
              <Circle size={19} aria-hidden="true" />
            </button>
            <p className="pt-1 text-sm leading-relaxed">{next.title}</p>
          </div>
          <button type="button" onClick={() => continueInWork(focus!, next)}
            className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-border bg-background text-sm font-medium hover:bg-muted">
            Continue in Work <ArrowUpRight size={16} aria-hidden="true" />
          </button>
          <p className="mt-2 text-[11px] leading-4 text-muted-foreground">Opens a new conversation with this step already prepared for review. Nothing runs until you send it.</p>
        </section> : null}
        <div className="space-y-2">
          {visible.map(goal => {
            const steps = stepList(goal.id);
            const open = expanded === goal.id;
            return <section key={goal.id} className="overflow-hidden rounded-xl border border-border/80 bg-card/50">
              <button type="button" aria-expanded={open} onClick={() => setExpanded(open ? null : goal.id)}
                className="flex min-h-16 w-full items-center gap-3 px-3 py-3 text-left">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-semibold tabular-nums">
                  {steps.length && steps.every(step => step.status === "done") ? <Check size={16} /> : (goal.source_key?.match(/\d+$/)?.[0] ?? <Target size={15} />)}
                </span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-medium leading-snug">{goal.title}</span>
                  <span className="mt-1 block text-xs tabular-nums text-muted-foreground">{finished(goal.id)}/{steps.length} complete</span></span>
                {open ? <ChevronDown className="size-4 shrink-0 text-muted-foreground"/> : <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
              </button>
              {open ? <div className="border-t border-border/70 px-3 py-3">
                {steps.length ? <div className="space-y-1">{steps.map(step => <label key={step.id}
                  className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg p-2 hover:bg-muted/50">
                  <input type="checkbox" className="mt-1 size-4 accent-current" checked={step.status === "done"}
                    disabled={pending === step.id} onChange={() => void setStep(step)} />
                  <span className={"text-sm leading-relaxed " + (step.status === "done" ? "text-muted-foreground line-through" : "")}>{step.title}</span>
                </label>)}</div> : <p className="text-xs text-muted-foreground">No checklist steps yet.</p>}
                <div className="mt-3 border-t border-border/70 pt-3">
                  {addingStepFor === goal.id ? <form className="flex flex-col gap-2" onSubmit={event => { event.preventDefault(); void addStep(goal.id); }}>
                    <input autoFocus value={newStepTitle} maxLength={1500} onChange={event => setNewStepTitle(event.target.value)}
                      placeholder="A concrete next action" aria-label="New checklist step"
                      className="min-h-11 rounded-lg border border-border bg-background px-3 text-sm" />
                    <div className="flex gap-2">
                      <button type="submit" disabled={!newStepTitle.trim() || pending === "new-step"} className="min-h-10 rounded-md bg-foreground px-3 text-xs font-medium text-background">Add step</button>
                      <button type="button" onClick={() => setAddingStepFor(null)} className="min-h-10 px-3 text-xs">Cancel</button>
                    </div>
                  </form> : <button type="button" className="flex min-h-10 items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => { setAddingStepFor(goal.id); setNewStepTitle(""); }}>
                    <Plus size={14} /> Add a step
                  </button>}
                  {filter === "platform" ? <div className="mt-3 rounded-lg border border-border/70 p-3">
                    <p className="mb-2 text-xs font-medium">Existing engineering work</p>
                    {plan.ticketLinks.filter(link => link.goal_id === goal.id).map(ticket =>
                      <div key={ticket.ticket_id} className="mb-2 flex items-start gap-2">
                        <a className="min-h-10 min-w-0 flex-1 text-xs leading-5 text-foreground underline-offset-2 hover:underline"
                          href={"/artifacts/tickets/" + encodeURIComponent(ticket.ticket_id)}
                          title="Open the existing engineering ticket">
                          {ticket.title}
                          <span className="block text-[11px] text-muted-foreground">{ticket.status}</span>
                        </a>
                        <button type="button" disabled={pending === ticket.ticket_id} onClick={() => void unlinkTicket(goal.id, ticket.ticket_id)}
                          aria-label={"Unlink " + ticket.title} className="min-h-10 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted">Unlink</button>
                      </div>)}
                    {ticketPickerFor === goal.id ? <div className="space-y-2">
                      <form onSubmit={event => { event.preventDefault(); void findTickets(ticketQuery); }} className="flex gap-2">
                        <input aria-label="Search existing tickets" value={ticketQuery} onChange={event => setTicketQuery(event.target.value)}
                          placeholder="Search your tickets" className="min-h-11 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs" />
                        <button type="submit" disabled={pending === "ticket-search"} className="min-h-11 rounded-md bg-muted px-3 text-xs">Search</button>
                      </form>
                      <div className="max-h-52 overflow-y-auto">{ticketCandidates.filter(item =>
                        !plan.ticketLinks.some(link => link.goal_id === goal.id && link.ticket_id === item.id)
                      ).map(item => <button key={item.id} type="button" disabled={pending === item.id}
                        onClick={() => void linkTicket(goal.id, item.id)}
                        className="flex min-h-11 w-full items-center justify-between gap-2 border-b border-border/50 p-2 text-left text-xs hover:bg-muted">
                        <span className="min-w-0 flex-1">{item.title}</span><span className="text-[11px] text-muted-foreground">{item.status}</span>
                      </button>)}</div>
                      <button type="button" onClick={() => setTicketPickerFor(null)} className="min-h-10 text-xs text-muted-foreground">Cancel</button>
                    </div> : <button type="button" className="flex min-h-10 items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => { setTicketPickerFor(goal.id); setTicketQuery(""); void findTickets(""); }}>
                      <Plus size={14} /> Link an existing ticket
                    </button>}
                  </div> : null}
                  <button type="button" disabled={pending === goal.id || (goal.status !== "completed" && (!steps.length || steps.some(step => step.status !== "done")))}
                    className="mt-2 min-h-10 w-full rounded-lg border border-border px-3 text-xs font-medium disabled:opacity-40"
                    onClick={() => void changeGoalStatus(goal)}>
                    {goal.status === "completed" ? "Reopen goal" : "Mark goal completed"}
                  </button>
                </div>
              </div> : null}
            </section>;
          })}
          {!visible.length && <p className="py-10 text-center text-sm text-muted-foreground">No goals in this area yet.</p>}
        </div>
        <div className="mt-5">
          {creating ? <form className="space-y-2" onSubmit={event => { event.preventDefault(); void addGoal(); }}>
            <input autoFocus value={newTitle} onChange={event => setNewTitle(event.target.value)}
              maxLength={300} placeholder="A clear, achievable goal" aria-label="New goal title"
              className="min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm"/>
            <div className="flex gap-2"><button type="submit" disabled={!newTitle.trim() || pending === "create"}
              className="min-h-10 rounded-lg bg-foreground px-4 text-sm font-medium text-background">Save goal</button>
              <button type="button" onClick={() => setCreating(false)} className="min-h-10 px-3 text-sm">Cancel</button></div>
          </form> : <button type="button" onClick={() => setCreating(true)}
            className="flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <Plus size={16} aria-hidden="true" /> Add a goal
          </button>}
        </div>
      </>}
    </div>
  </div>;
}
