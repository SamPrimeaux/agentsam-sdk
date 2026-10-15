import { useState } from "react";
import type { WorkProject, WorkTicket, WorkTicketInput, WorkTicketStatus } from "../contracts/index";
import { Drawer, ErrorLine, Field, fromInputValue, toInputValue, useAction } from "./shared";
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
    <Drawer
      title={ticket ? "Edit ticket" : "New ticket"}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="aw-btn aw-btn--primary" disabled={busy || !canSave} onClick={() => void save()}>
            {ticket ? "Save" : "Create ticket"}
          </button>
          {ticket && ticket.status !== "shipped" && canSave ? (
            <button type="button" className="aw-btn" disabled={busy} onClick={() => void save({ status: "shipped", percentComplete: 100 })}>
              Mark complete
            </button>
          ) : null}
          {ticket && onSchedule ? (
            <button type="button" className="aw-btn" disabled={busy} onClick={() => void run(async () => { await onSchedule(); })}>
              Schedule on calendar
            </button>
          ) : null}
          <span className="spacer" />
          {ticket && canDelete && onDelete ? (
            confirmDelete ? (
              <button type="button" className="aw-btn aw-btn--danger" disabled={busy} onClick={() => void run(async () => { await onDelete(); onClose(); })}>
                Confirm delete
              </button>
            ) : (
              <button type="button" className="aw-btn aw-btn--danger" onClick={() => setConfirmDelete(true)}>
                Delete
              </button>
            )
          ) : null}
        </>
      }
    >
      <ErrorLine message={error} />
      {ticket ? <code className="aw-mono" style={{ fontSize: 11, color: "var(--agentsam-work-muted)" }}>{ticket.id}</code> : null}
      <Field label="Title" full>
        <input className="aw-input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus placeholder="What needs to happen?" />
      </Field>
      <Field label="Documentation" full>
        <textarea className="aw-textarea" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Acceptance criteria, links, notes, implementation steps…" />
      </Field>
      <div className="aw-grid2">
        <Field label="Status">
          <select className="aw-select" value={status} onChange={(e) => setStatus(e.target.value as WorkTicketStatus)}>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
        </Field>
        <Field label="Priority">
          <select className="aw-select" value={priority} onChange={(e) => setPriority(e.target.value)}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>{p || "None"}</option>
            ))}
            {priority && !PRIORITIES.includes(priority) ? <option value={priority}>{priority}</option> : null}
          </select>
        </Field>
        <Field label="Project">
          <select className="aw-select" value={project} onChange={(e) => setProject(e.target.value)}>
            <option value="">No project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
            {project && !projects.some((p) => p.id === project) ? <option value={project}>{project}</option> : null}
          </select>
        </Field>
        <Field label="Lane">
          <input className="aw-input" list="aw-lanes" value={surface} onChange={(e) => setSurface(e.target.value)} />
          <datalist id="aw-lanes">
            {lanes.map((lane) => <option key={lane} value={lane} />)}
          </datalist>
        </Field>
        <Field label="Start">
          <input className="aw-input" type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
        </Field>
        <Field label="Due">
          <input className="aw-input" type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
        </Field>
        <Field label="Estimate (minutes)">
          <input className="aw-input" type="number" min={0} value={estimate} onChange={(e) => setEstimate(e.target.value)} />
        </Field>
        <Field label="% complete">
          <input className="aw-input" type="number" min={0} max={100} value={percent} onChange={(e) => setPercent(e.target.value)} />
        </Field>
      </div>
      <Field label="Blocked by (ticket ids, comma separated)" full>
        <input className="aw-input aw-mono" value={blockedBy} onChange={(e) => setBlockedBy(e.target.value)} />
      </Field>
      <Field label="Tags (comma separated)" full>
        <input className="aw-input" value={tags} onChange={(e) => setTags(e.target.value)} />
      </Field>
    </Drawer>
  );
}
