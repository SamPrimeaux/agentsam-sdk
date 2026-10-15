import { useState } from "react";
import { WORK_EVENT_TYPES, type WorkCalendarEvent, type WorkEventInput, type WorkEventType, type WorkProject } from "../contracts/index";
import { Drawer, ErrorLine, Field, fromInputValue, toInputValue, useAction } from "./shared";

export function EventEditor({
  event,
  draft,
  projects,
  canSave,
  canDelete,
  onSave,
  onDelete,
  onOpenProject,
  onClose,
}: {
  event: WorkCalendarEvent | null;
  /** Prefilled values for a new event (slot clicked on the grid). */
  draft?: { start: string; end: string; projectId?: string | null };
  projects: WorkProject[];
  canSave: boolean;
  canDelete: boolean;
  onSave: (input: WorkEventInput & { title: string; start: string }) => Promise<void>;
  onDelete?: () => Promise<void>;
  onOpenProject?: (projectId: string) => void;
  onClose: () => void;
}) {
  const readOnly = Boolean(event?.readOnly);
  const [title, setTitle] = useState(event?.title ?? "");
  const [type, setType] = useState<WorkEventType>(event?.type ?? "meeting");
  const [start, setStart] = useState(toInputValue(event?.start ?? draft?.start));
  const [end, setEnd] = useState(toInputValue(event?.end ?? draft?.end));
  const [allDay, setAllDay] = useState(Boolean(event?.allDay));
  const [projectId, setProjectId] = useState(event?.projectId ?? draft?.projectId ?? "");
  const [location, setLocation] = useState(event?.location ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const { busy, error, run } = useAction();

  return (
    <Drawer
      title={event ? (readOnly ? "Event (synced, read-only)" : "Edit event") : "New event"}
      onClose={onClose}
      footer={
        <>
          {!readOnly ? (
            <button
              type="button"
              className="aw-btn aw-btn--primary"
              disabled={busy || !canSave}
              onClick={() =>
                void run(async () => {
                  if (!title.trim()) throw new Error("Add a title");
                  const s = fromInputValue(start);
                  const e = fromInputValue(end) ?? s;
                  if (!s || !e) throw new Error("Start and end are required");
                  if (e < s) throw new Error("End must be after start");
                  await onSave({ title: title.trim(), type, start: s, end: e, allDay, projectId: projectId || null, location: location.trim(), description: description.trim() });
                  onClose();
                })
              }
            >
              {event ? "Save" : "Create event"}
            </button>
          ) : null}
          {event && projectId && onOpenProject ? (
            <button type="button" className="aw-btn" onClick={() => onOpenProject(projectId)}>Open project</button>
          ) : null}
          <span className="spacer" />
          {event && !readOnly && canDelete && onDelete ? (
            <button type="button" className="aw-btn aw-btn--danger" disabled={busy} onClick={() => void run(async () => { await onDelete(); onClose(); })}>Delete</button>
          ) : null}
        </>
      }
    >
      <ErrorLine message={error} />
      <Field label="Title" full>
        <input className="aw-input" value={title} disabled={readOnly} onChange={(e) => setTitle(e.target.value)} autoFocus placeholder="Add title" />
      </Field>
      <div className="aw-grid2">
        <Field label="Type">
          <select className="aw-select" value={type} disabled={readOnly} onChange={(e) => setType(e.target.value as WorkEventType)}>
            {WORK_EVENT_TYPES.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
          </select>
        </Field>
        <Field label="Project">
          <select className="aw-select" value={projectId} disabled={readOnly} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">No project</option>
            {projects.filter((p) => p.status !== "archived" || p.id === projectId).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Starts">
          <input className="aw-input" type="datetime-local" value={start} disabled={readOnly} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="Ends">
          <input className="aw-input" type="datetime-local" value={end} disabled={readOnly} onChange={(e) => setEnd(e.target.value)} />
        </Field>
      </div>
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
        <input type="checkbox" checked={allDay} disabled={readOnly} onChange={(e) => setAllDay(e.target.checked)} /> All day
      </label>
      <Field label="Location" full>
        <input className="aw-input" value={location} disabled={readOnly} onChange={(e) => setLocation(e.target.value)} />
      </Field>
      <Field label="Notes" full>
        <textarea className="aw-textarea" style={{ minHeight: 90 }} value={description} disabled={readOnly} onChange={(e) => setDescription(e.target.value)} />
      </Field>
    </Drawer>
  );
}
