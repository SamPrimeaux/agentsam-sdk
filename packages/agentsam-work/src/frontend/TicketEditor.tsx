import { useState } from "react";
import { ArrowLeft, CalendarDays, Check, Clock3, Link2, Save, Trash2 } from "lucide-react";
import type { WorkProject, WorkTicket, WorkTicketInput, WorkTicketStatus } from "../contracts/index";
import { ErrorLine, Field, fromInputValue, toInputValue, useAction } from "./shared";
import { STATUS_LABEL, STATUS_ORDER } from "./ticket-plan";

const PRIORITIES = ["", "P0", "P1", "P2", "P3"];
const csv = (value: string) => value.split(",").map((s) => s.trim()).filter(Boolean);

export function TicketEditor({
  ticket,
  defaults,
  projects,
  lanes,
  canSave,
  canDelete,
  onSave,
  onDelete,
  onSchedule,
  onClose,
}: {
  ticket: WorkTicket | null;
  defaults?: WorkTicketInput;
  projects: WorkProject[];
  lanes: string[];
  canSave: boolean;
  canDelete: boolean;
  onSave: (input: WorkTicketInput & { title: string }) => Promise<void>;
  onDelete?: () => Promise<void>;
  onSchedule?: () => Promise<void>;
  onClose: () => void;
}) {
  const seed = ticket ?? ({ status: "backlog", surface: "platform", tags: [], blockedBy: [], blocks: [], ...defaults } as WorkTicketInput);
  const [title, setTitle] = useState(ticket?.title ?? seed.title ?? "");
  const [description, setDescription] = useState(seed.description ?? "");
  const [status, setStatus] = useState<WorkTicketStatus>((seed.status as WorkTicketStatus) ?? "backlog");
  const [priority, setPriority] = useState(seed.priority ?? "");
  const [project, setProject] = useState(seed.project ?? "");
  const [surface, setSurface] = useState(seed.surface ?? "platform");
  const [startAt, setStartAt] = useState(toInputValue(seed.startAt));
  const [dueAt, setDueAt] = useState(toInputValue(seed.dueAt));
  const [estimate, setEstimate] = useState(seed.estimatedMinutes != null ? String(seed.estimatedMinutes) : "");
  const [percent, setPercent] = useState(String(seed.percentComplete ?? 0));
  const [tags, setTags] = useState((seed.tags ?? []).join(", "));
  const [blockedBy, setBlockedBy] = useState((seed.blockedBy ?? []).join(", "));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { busy, error, run } = useAction();

  const collect = (override?: Partial<WorkTicketInput>): WorkTicketInput & { title: string } => ({
    title: title.trim(),
    description: description || null,
    status,
    priority: priority || null,
    project: project || null,
    surface: surface.trim() || "platform",
    startAt: fromInputValue(startAt),
    dueAt: fromInputValue(dueAt),
    estimatedMinutes: estimate === "" ? null : Number(estimate),
    percentComplete: Number(percent) || 0,
    tags: csv(tags),
    blockedBy: csv(blockedBy),
    ...override,
  });

  const save = (override?: Partial<WorkTicketInput>) =>
    run(async () => {
      if (!title.trim()) throw new Error("Title is required");
      await onSave(collect(override));
      onClose();
    });

  return (
    <section className="aw-ticket-context" aria-label={ticket ? "Edit ticket" : "Create ticket"}>
      <header className="aw-ticket-context__header">
        <button type="button" className="aw-ticket-context__back" onClick={onClose}><ArrowLeft size={16}/> <span>Back to work</span></button>
        <span className="aw-ticket-context__eyebrow">{ticket ? "TICKET DETAILS" : "NEW WORK ITEM"}</span>
        <div className="aw-ticket-context__heading">
          <h2>{ticket ? "Ticket details" : "Create a ticket"}</h2>
          <span className="aw-ticket-context__id">{ticket?.id || "Draft"}</span>
        </div>
        {ticket ? <div className="aw-ticket-context__statusline"><span data-status={status}>{STATUS_LABEL[status]}</span><span>{priority || "No priority"}</span></div> : null}
      </header>
      <div className="aw-ticket-context__content">
        <ErrorLine message={error} />
        <Field label="Title" full>
          <textarea rows={3} className="aw-textarea aw-ticket-title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus placeholder="What needs to happen?" />
        </Field>
        <Field label="Documentation & acceptance criteria" full>
          <textarea className="aw-textarea aw-ticket-context__documentation" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What done looks like, context, implementation notes, links…" />
        </Field>
        <div className="aw-ticket-context__group-title"><span>WORKFLOW</span></div>
        <div className="aw-grid2">
          <Field label="Status">
            <select className="aw-select" value={status} onChange={(e) => setStatus(e.target.value as WorkTicketStatus)}>
              {STATUS_ORDER.map((item) => <option key={item} value={item}>{STATUS_LABEL[item]}</option>)}
            </select>
          </Field>
          <Field label="Priority">
            <select className="aw-select" value={priority} onChange={(e) => setPriority(e.target.value)}>
              {PRIORITIES.map((item) => <option key={item} value={item}>{item || "None"}</option>)}
              {priority && !PRIORITIES.includes(priority) ? <option value={priority}>{priority}</option> : null}
            </select>
          </Field>
        </div>
        <Field label="Project" full>
          <select className="aw-select" value={project} onChange={(e) => setProject(e.target.value)}>
            <option value="">No project</option>
            {projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            {project && !projects.some((item) => item.id === project) ? <option value={project}>{project}</option> : null}
          </select>
        </Field>
        <details className="aw-ticket-context__more">
          <summary>Schedule, estimates & dependencies <Clock3 size={15} /></summary>
          <div className="aw-ticket-context__more-body">
            <div className="aw-grid2">
              <Field label="Start date"><input className="aw-input" type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} /></Field>
              <Field label="Due date"><input className="aw-input" type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} /></Field>
              <Field label="Estimate (minutes)"><input className="aw-input" type="number" min={0} value={estimate} onChange={(e) => setEstimate(e.target.value)} /></Field>
              <Field label="Completion estimate"><input className="aw-input" type="number" min={0} max={100} value={percent} onChange={(e) => setPercent(e.target.value)} /></Field>
            </div>
            <Field label="Work lane" full>
              <input className="aw-input" list="aw-ticket-lanes" value={surface} onChange={(e) => setSurface(e.target.value)} />
              <datalist id="aw-ticket-lanes">{lanes.map((item) => <option key={item} value={item}/>)}</datalist>
            </Field>
            <Field label="Blocked by (ticket IDs)" full><input className="aw-input" value={blockedBy} onChange={(e) => setBlockedBy(e.target.value)} /></Field>
            <Field label="Tags" full><input className="aw-input" value={tags} onChange={(e) => setTags(e.target.value)} /></Field>
          </div>
        </details>
        {ticket && ticket.blockedBy?.length ? <div className="aw-ticket-context__relations">
          <Link2 size={15}/><span>Blocked by {ticket.blockedBy.length} ticket{ticket.blockedBy.length === 1 ? "" : "s"}</span>
        </div> : null}
      </div>
      <footer className="aw-ticket-context__footer">
        <button type="button" className="aw-btn aw-btn--primary" disabled={busy || !canSave} onClick={() => void save()}><Save size={15}/>{ticket ? "Save changes" : "Create ticket"}</button>
        {ticket && ticket.status !== "shipped" && canSave ? <button type="button" className="aw-btn" disabled={busy} onClick={() => void save({ status: "shipped", percentComplete: 100 })}><Check size={14}/> Mark shipped</button> : null}
        {ticket && onSchedule ? <button type="button" className="aw-btn" disabled={busy} onClick={() => void run(async () => { await onSchedule(); })}><CalendarDays size={14}/> Schedule</button> : null}
        {ticket && canDelete && onDelete ? <button type="button" className="aw-btn aw-ticket-context__delete" disabled={busy} onClick={() => confirmDelete ? void run(async () => { await onDelete(); onClose(); }) : setConfirmDelete(true)}><Trash2 size={14}/>{confirmDelete ? "Confirm delete" : "Delete"}</button> : null}
      </footer>
    </section>
  );
}
