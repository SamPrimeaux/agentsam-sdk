import { useState } from "react";
import { WORK_PROJECT_STATUSES, WORK_PROJECT_TYPES, type WorkProject, type WorkProjectInput, type WorkProjectStatus } from "../contracts/index";
import { Drawer, ErrorLine, Field, useAction } from "./shared";

const LABEL: Record<string, string> = {
  discovery: "Discovery",
  design: "Design",
  development: "Development",
  qa: "QA",
  staging: "Staging",
  production: "Production",
  maintenance: "Maintenance",
  archived: "Archived",
};
export const projectStatusLabel = (status: string) => LABEL[status] ?? status;

export function ProjectEditor({
  project,
  onSave,
  onClose,
}: {
  project: WorkProject | null;
  onSave: (input: WorkProjectInput & { name: string }) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [type, setType] = useState(project?.projectType && project.projectType !== "project" ? project.projectType : "");
  const [status, setStatus] = useState<WorkProjectStatus>(project?.status ?? "discovery");
  const [clientName, setClientName] = useState(project?.clientName ?? "");
  const [domain, setDomain] = useState(project?.domain ?? "");
  const [repo, setRepo] = useState(project?.githubRepo ?? "");
  const [branch, setBranch] = useState(project?.branch ?? "");
  const [objective, setObjective] = useState(project?.objective ?? "");
  const [launch, setLaunch] = useState(project?.launchDate?.slice(0, 10) ?? "");
  const { busy, error, run } = useAction();

  return (
    <Drawer
      title={project ? "Edit project" : "New project"}
      onClose={onClose}
      footer={
        <button
          type="button"
          className="aw-btn aw-btn--primary"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              if (!name.trim()) throw new Error("Project name is required");
              await onSave({
                name: name.trim(),
                description: description.trim(),
                projectType: type || undefined,
                status,
                clientName: clientName.trim(),
                domain: domain.trim(),
                githubRepo: repo.trim(),
                branch: branch.trim(),
                objective: objective.trim(),
                launchDate: launch || null,
              });
              onClose();
            })
          }
        >
          {project ? "Save" : "Create project"}
        </button>
      }
    >
      <ErrorLine message={error} />
      <Field label="Name" full>
        <input className="aw-input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </Field>
      <Field label="Description" full>
        <textarea className="aw-textarea" style={{ minHeight: 80 }} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <div className="aw-grid2">
        <Field label="Type">
          <select className="aw-select" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Not set</option>
            {WORK_PROJECT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select className="aw-select" value={status} onChange={(e) => setStatus(e.target.value as WorkProjectStatus)}>
            {WORK_PROJECT_STATUSES.map((s) => <option key={s} value={s}>{projectStatusLabel(s)}</option>)}
          </select>
        </Field>
        <Field label="Client"><input className="aw-input" value={clientName} onChange={(e) => setClientName(e.target.value)} /></Field>
        <Field label="Domain"><input className="aw-input" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="example.com" /></Field>
        <Field label="Repository"><input className="aw-input" value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="owner/repo" /></Field>
        <Field label="Branch"><input className="aw-input" value={branch} onChange={(e) => setBranch(e.target.value)} /></Field>
        <Field label="Launch date"><input className="aw-input" type="date" value={launch} onChange={(e) => setLaunch(e.target.value)} /></Field>
      </div>
      <Field label="Current objective" full>
        <input className="aw-input" value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="What is this project driving toward right now?" />
      </Field>
    </Drawer>
  );
}

export function ProjectDeleteDialog({
  project,
  onArchive,
  onDelete,
  onClose,
}: {
  project: WorkProject;
  onArchive?: () => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}) {
  const { busy, error, run } = useAction();
  return (
    <Drawer title={`Remove “${project.name}”`} onClose={onClose}>
      <ErrorLine message={error} />
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55 }}>
        Archiving hides the project but keeps its tickets and events, and you can restore it any time. Deleting is permanent; its tickets stay but lose their project link, and its calendar events are unlinked.
      </p>
      <div className="aw-actions">
        {onArchive && project.status !== "archived" ? (
          <button type="button" className="aw-btn aw-btn--primary" disabled={busy} onClick={() => void run(async () => { await onArchive(); onClose(); })}>Archive project</button>
        ) : null}
        {onDelete ? (
          <button type="button" className="aw-btn aw-btn--danger" disabled={busy} onClick={() => void run(async () => { await onDelete(); onClose(); })}>Delete permanently</button>
        ) : null}
        <button type="button" className="aw-btn" onClick={onClose}>Cancel</button>
      </div>
    </Drawer>
  );
}
