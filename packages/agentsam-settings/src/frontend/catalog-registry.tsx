import { ChevronRight, MoreHorizontal, Plus, ScrollText, Sparkles, Wand2 } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type {
  SettingsCatalogAccess,
  SettingsCatalogItem,
  SettingsCatalogKind,
  SettingsHost,
} from "../contracts/index";

/**
 * One list + focused editor for every account-owned Customize registry.
 * Items open as a full page in the Settings content area (never a modal), and
 * each row carries its own actions menu. What is offered is decided by the
 * access the host reports for the registry, so the same component is correct
 * on a host that can only read a registry and on one with full control.
 */
export type CatalogRegistryKind = Exclude<SettingsCatalogKind, "plugins" | "subagents">;

type Draft = {
  id: string;
  name: string;
  subtitle: string;
  trigger: string;
  content: string;
  applyMode: string;
  globs: string;
  enabled: boolean | undefined;
  readOnly: boolean;
};

type KindCopy = {
  plural: string;
  singular: string;
  description: string;
  empty: string;
  bodyLabel: string;
  bodyPlaceholder: string;
};

const COPY: Record<CatalogRegistryKind, KindCopy> = {
  skills: {
    plural: "Skills", singular: "skill",
    description: "Reusable instructions you can call with a slash command.",
    empty: "No skills yet. Create one to reuse a set of instructions anywhere.",
    bodyLabel: "Instructions",
    bodyPlaceholder: "Describe what this skill does, the inputs it needs, the steps to follow and what to avoid.",
  },
  rules: {
    plural: "Rules", singular: "rule",
    description: "Standing guidance your agents follow while they work.",
    empty: "No rules yet. Create one to set guidance your agents always follow.",
    bodyLabel: "Rule",
    bodyPlaceholder: "Write the guidance your agents should follow.",
  },
  commands: {
    plural: "Commands", singular: "command",
    description: "Shortcuts available from the command palette and composer.",
    empty: "No commands yet.",
    bodyLabel: "Command", bodyPlaceholder: "",
  },
  hooks: {
    plural: "Hooks", singular: "hook",
    description: "Actions that run automatically when something happens in a session.",
    empty: "No hooks yet.",
    bodyLabel: "Hook", bodyPlaceholder: "",
  },
  mcps: {
    plural: "MCP servers", singular: "MCP server",
    description: "Tool servers your agents can connect to.",
    empty: "No MCP servers yet.",
    bodyLabel: "Server", bodyPlaceholder: "",
  },
};

const APPLY_MODE_LABELS: Record<string, string> = {
  always: "Always",
  on_request: "When requested",
};

const READ_ONLY: SettingsCatalogAccess = { create: false, update: false, remove: false, toggle: false };
const TRIGGER = /^\/[a-z0-9][a-z0-9-]{0,48}$/;

/** Host error codes become plain guidance; unknown failures stay generic. */
const FAILURES: Record<string, string> = {
  skill_trigger_conflict: "Another skill already uses that slash command. Choose a different one.",
  skill_validation_failed: "Check the name, slash command and instructions, then try again.",
  skill_not_found_or_read_only: "This skill is managed for you and can't be changed here.",
  rule_validation_failed: "Check the name and rule text, then try again.",
  rule_not_found: "This rule no longer exists. Refresh to see your current rules.",
};
function failure(error: unknown, fallback: string) {
  const code = error instanceof Error ? error.message : "";
  return FAILURES[code] ?? fallback;
}

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function toDraft(item?: SettingsCatalogItem): Draft {
  return {
    id: item?.id ?? "",
    name: item?.name ?? "",
    subtitle: item?.subtitle ?? "",
    trigger: item?.trigger ?? "",
    content: item?.content ?? "",
    applyMode: item?.applyMode ?? "always",
    globs: item?.globs ?? "",
    enabled: item?.enabled,
    readOnly: item?.readOnly === true,
  };
}

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

function KindIcon({ kind }: { kind: CatalogRegistryKind }) {
  const Icon = kind === "skills" ? Wand2 : kind === "rules" ? ScrollText : Sparkles;
  return <Icon className="size-3.5 text-muted-foreground" />;
}

const inputClass =
  "h-10 w-full rounded-lg border border-border bg-muted/20 px-3 text-[13px] outline-none transition focus:border-foreground/40 disabled:opacity-60";
const menuItemClass =
  "flex w-full items-center rounded-md px-2.5 py-2 text-left text-[12px] hover:bg-muted focus-visible:bg-muted focus-visible:outline-none";

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-medium">{label}</span>
      {children}
      {hint ? <span className="mt-1.5 block text-[11px] leading-4 text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

function RowMenu({
  label, canEdit, canDuplicate, canToggle, enabled, canDelete,
  onOpen, onDuplicate, onToggle, onDelete,
}: {
  label: string; canEdit: boolean; canDuplicate: boolean; canToggle: boolean;
  enabled: boolean | undefined; canDelete: boolean;
  onOpen: () => void; onDuplicate: () => void; onToggle: () => void; onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const run = (action: () => void) => () => { setOpen(false); action(); };
  return (
    <div ref={root} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${label}`}
        onClick={() => setOpen((value) => !value)}
        className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30"
      >
        <MoreHorizontal className="size-4" />
      </button>
      {open ? (
        <div role="menu" aria-label={`Actions for ${label}`}
          className="absolute right-0 top-9 z-20 w-44 rounded-lg border border-border bg-background p-1 shadow-lg">
          <button type="button" role="menuitem" className={menuItemClass} onClick={run(onOpen)}>
            {canEdit ? "Edit" : "View"}
          </button>
          {canDuplicate ? (
            <button type="button" role="menuitem" className={menuItemClass} onClick={run(onDuplicate)}>Duplicate</button>
          ) : null}
          {canToggle ? (
            <button type="button" role="menuitem" className={menuItemClass} onClick={run(onToggle)}>
              {enabled === false ? "Turn on" : "Turn off"}
            </button>
          ) : null}
          {canDelete ? (
            <button type="button" role="menuitem"
              className={cx(menuItemClass, "text-[var(--settings-danger-ink)]")} onClick={run(onDelete)}>
              Delete
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function CatalogRegistryView({
  kind, items, access, host, onChanged,
}: {
  kind: CatalogRegistryKind;
  items: SettingsCatalogItem[];
  access?: SettingsCatalogAccess;
  host: SettingsHost;
  onChanged: () => Promise<void>;
}) {
  const copy = COPY[kind];
  const granted = access ?? READ_ONLY;
  const can = {
    create: granted.create && Boolean(host.upsertCatalogItem),
    update: granted.update && Boolean(host.upsertCatalogItem),
    remove: granted.remove && Boolean(host.removeCatalogItem),
    toggle: granted.toggle && Boolean(host.setCatalogItemEnabled),
  };
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pageRef = useRef<HTMLElement>(null);
  const editing = draft !== null;
  useEffect(() => { if (editing) pageRef.current?.focus(); }, [editing]);
  // Leaving one registry for another always returns to its list.
  useEffect(() => { setDraft(null); setConfirming(null); setError(""); }, [kind]);

  const set = (patch: Partial<Draft>) => setDraft((current) => (current ? { ...current, ...patch } : current));
  const open = (item?: SettingsCatalogItem) => { setError(""); setConfirming(null); setDraft(toDraft(item)); };
  const duplicate = (item: SettingsCatalogItem) => {
    setError(""); setConfirming(null);
    const name = `${item.name} copy`;
    setDraft({
      ...toDraft(item), id: "", name, readOnly: false,
      trigger: item.trigger ? `/${slugify(name)}` : "",
    });
  };

  async function commit(action: () => Promise<void>, fallback: string, close: boolean) {
    setBusy(true); setError("");
    try {
      await action();
      await onChanged();
      if (close) setDraft(null);
      setConfirming(null);
    } catch (caught) {
      setError(failure(caught, fallback));
    } finally {
      setBusy(false);
    }
  }

  function save() {
    if (!draft || !host.upsertCatalogItem) return;
    const name = draft.name.trim();
    const trigger = draft.trigger.trim().toLowerCase();
    if (name.length < 2) { setError("Give this a name of at least two characters."); return; }
    if (kind === "skills" && !TRIGGER.test(trigger)) {
      setError("The slash command starts with / and uses lowercase letters, numbers and dashes, like /release-notes.");
      return;
    }
    if (draft.content.trim().length < 8) {
      setError(`Add a little more detail to the ${copy.bodyLabel.toLowerCase()} before saving.`);
      return;
    }
    const item: SettingsCatalogItem = {
      id: draft.id, name, subtitle: draft.subtitle.trim(), status: "healthy",
      content: draft.content, enabled: draft.enabled,
      ...(kind === "skills" ? { trigger, meta: trigger } : {}),
      ...(kind === "rules" ? { applyMode: draft.applyMode, globs: draft.globs } : {}),
    };
    void commit(() => host.upsertCatalogItem!(kind, item), `We couldn't save this ${copy.singular}. Try again.`, true);
  }

  const remove = (id: string, close: boolean) =>
    void commit(() => host.removeCatalogItem!(kind, id), `We couldn't delete this ${copy.singular}. Try again.`, close);
  const toggle = (item: SettingsCatalogItem) =>
    void commit(
      () => host.setCatalogItemEnabled!(kind, item.id, item.enabled === false),
      `We couldn't update this ${copy.singular}. Try again.`, false,
    );

  if (draft) {
    const isNew = !draft.id;
    const editable = !draft.readOnly && (isNew ? can.create : can.update);
    const modes = Object.keys(APPLY_MODE_LABELS).includes(draft.applyMode)
      ? Object.keys(APPLY_MODE_LABELS) : [...Object.keys(APPLY_MODE_LABELS), draft.applyMode];
    const title = isNew ? `New ${copy.singular}` : draft.name || copy.plural;
    return (
      <section ref={pageRef} tabIndex={-1} aria-label={title} className="mx-auto w-full max-w-3xl space-y-6 pb-12 outline-none">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <button type="button" onClick={() => setDraft(null)}
            className="min-h-9 rounded-lg px-2 transition hover:bg-muted/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30">
            {copy.plural}
          </button>
          <ChevronRight className="size-3.5" />
          <span className="truncate text-foreground">{title}</span>
        </nav>
        <header className="flex items-start justify-between gap-4 border-b border-border/65 pb-4">
          <div className="min-w-0">
            <h2 className="truncate text-[21px] font-semibold tracking-[-0.03em]">{title}</h2>
            <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
              {draft.readOnly ? `This ${copy.singular} is managed for you. Duplicate it to make your own version.` : copy.description}
            </p>
          </div>
          {!isNew && draft.readOnly && can.create ? (
            <button type="button"
              onClick={() => duplicate({ ...draft, status: "healthy", meta: draft.trigger })}
              className="h-9 shrink-0 rounded-lg border border-border px-3 text-[12px] hover:bg-muted">
              Duplicate
            </button>
          ) : null}
        </header>

        <div className="space-y-5">
          <Field label="Name">
            <input value={draft.name} disabled={!editable} autoFocus={isNew} maxLength={120}
              onChange={(event) => set({ name: event.target.value })} className={inputClass}
              placeholder={kind === "skills" ? "Release notes" : "Code review standards"} />
          </Field>
          {kind === "skills" ? (
            <>
              <Field label="Description" hint="Shown wherever this skill can be picked.">
                <input value={draft.subtitle} disabled={!editable} maxLength={1000}
                  onChange={(event) => set({ subtitle: event.target.value })} className={inputClass}
                  placeholder="What this skill helps with" />
              </Field>
              <Field label="Slash command" hint="Type this in the composer to use the skill.">
                <input value={draft.trigger} disabled={!editable} maxLength={50} spellCheck={false}
                  onChange={(event) => set({ trigger: event.target.value })}
                  className={cx(inputClass, "font-mono")} placeholder="/release-notes" />
              </Field>
            </>
          ) : null}
          {kind === "rules" ? (
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="When to apply">
                <select value={draft.applyMode} disabled={!editable}
                  onChange={(event) => set({ applyMode: event.target.value })} className={inputClass}>
                  {modes.map((mode) => (
                    <option key={mode} value={mode}>{APPLY_MODE_LABELS[mode] ?? "Custom trigger"}</option>
                  ))}
                </select>
              </Field>
              <Field label="Files" hint="Optional. Limit the rule to matching files, separated by commas.">
                <input value={draft.globs} disabled={!editable} maxLength={1000} spellCheck={false}
                  onChange={(event) => set({ globs: event.target.value })}
                  className={cx(inputClass, "font-mono")} placeholder="src/**/*.ts, *.sql" />
              </Field>
            </div>
          ) : null}
          <Field label={copy.bodyLabel}>
            <textarea value={draft.content} disabled={!editable} rows={18}
              maxLength={kind === "skills" ? 40000 : 60000}
              onChange={(event) => set({ content: event.target.value })}
              className="w-full resize-y rounded-lg border border-border bg-muted/20 px-3 py-2.5 font-mono text-[12px] leading-relaxed outline-none transition focus:border-foreground/40 disabled:opacity-60"
              placeholder={copy.bodyPlaceholder} />
          </Field>
        </div>

        {error ? (
          <p role="alert" className="rounded-lg border border-border p-3 text-[12px] text-[var(--settings-danger-ink)]">{error}</p>
        ) : null}

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border/65 pt-4">
          <div className="flex items-center gap-2">
            {!isNew && !draft.readOnly && can.remove ? (
              confirming === draft.id ? (
                <>
                  <span className="text-[12px] text-muted-foreground">Delete this {copy.singular} for good?</span>
                  <button type="button" disabled={busy} onClick={() => remove(draft.id, true)}
                    className="h-9 rounded-lg border border-border px-3 text-[12px] font-medium text-[var(--settings-danger-ink)] hover:bg-muted disabled:opacity-50">
                    Delete
                  </button>
                  <button type="button" onClick={() => setConfirming(null)}
                    className="h-9 rounded-lg px-3 text-[12px] text-muted-foreground hover:bg-muted">
                    Keep
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => setConfirming(draft.id)}
                  className="h-9 rounded-lg px-3 text-[12px] text-[var(--settings-danger-ink)] hover:bg-muted">
                  Delete
                </button>
              )
            ) : null}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setDraft(null)}
              className="h-9 rounded-lg border border-border px-4 text-[12px] text-muted-foreground hover:bg-muted">
              {editable ? "Cancel" : "Back"}
            </button>
            {editable ? (
              <button type="button" disabled={busy} onClick={save}
                className="h-9 rounded-lg bg-foreground px-4 text-[12px] font-medium text-background disabled:opacity-50">
                {busy ? "Saving…" : isNew ? `Create ${copy.singular}` : "Save changes"}
              </button>
            ) : null}
          </div>
        </footer>
      </section>
    );
  }

  return (
    <section className="py-5 first:pt-0">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[14px] font-semibold">{copy.plural}</h2>
          <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{copy.description}</p>
        </div>
        {can.create ? (
          <button type="button" onClick={() => open()}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-foreground px-3 text-[12px] font-medium text-background">
            <Plus className="size-3.5" />
            New {copy.singular}
          </button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="mb-3 rounded-lg border border-border p-3 text-[12px] text-[var(--settings-danger-ink)]">{error}</p>
      ) : null}
      {items.length ? (
        <ul className="divide-y divide-border/60 rounded-lg border border-border/70">
          {items.map((item) => {
            const editable = !item.readOnly && can.update;
            const deletable = !item.readOnly && can.remove;
            const detail = item.subtitle
              || (kind === "rules" ? (APPLY_MODE_LABELS[item.applyMode ?? ""] ?? "Custom trigger") : "");
            return (
              <li key={item.id} className="flex items-center gap-2 px-3 py-2.5">
                {confirming === item.id ? (
                  <div className="flex min-h-10 flex-1 flex-wrap items-center justify-between gap-2">
                    <span className="text-[12px]">Delete “{item.name}” for good?</span>
                    <span className="flex gap-2">
                      <button type="button" disabled={busy} onClick={() => remove(item.id, false)}
                        className="h-8 rounded-md border border-border px-3 text-[12px] font-medium text-[var(--settings-danger-ink)] hover:bg-muted disabled:opacity-50">
                        Delete
                      </button>
                      <button type="button" onClick={() => setConfirming(null)}
                        className="h-8 rounded-md px-3 text-[12px] text-muted-foreground hover:bg-muted">
                        Keep
                      </button>
                    </span>
                  </div>
                ) : (
                  <>
                    <button type="button" onClick={() => open(item)}
                      className={cx(
                        "flex min-w-0 flex-1 items-center gap-3 rounded-md py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30",
                        item.enabled === false && "opacity-55",
                      )}>
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted/20">
                        <KindIcon kind={kind} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12px] font-medium">{item.name}</span>
                        {detail ? <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{detail}</span> : null}
                      </span>
                      {item.trigger ? <span className="hidden font-mono text-[10px] text-muted-foreground sm:block">{item.trigger}</span> : null}
                      {item.enabled === false ? (
                        <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">Off</span>
                      ) : null}
                      {item.readOnly ? (
                        <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">Managed</span>
                      ) : null}
                    </button>
                    <RowMenu
                      label={item.name}
                      canEdit={editable}
                      canDuplicate={can.create}
                      canToggle={can.toggle && !item.readOnly && item.enabled !== undefined}
                      enabled={item.enabled}
                      canDelete={deletable}
                      onOpen={() => open(item)}
                      onDuplicate={() => duplicate(item)}
                      onToggle={() => toggle(item)}
                      onDelete={() => { setError(""); setConfirming(item.id); }}
                    />
                  </>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="flex min-h-28 items-center justify-center rounded-lg border border-dashed border-border bg-muted/10 px-6 text-center">
          <p className="text-[12px] text-muted-foreground">{copy.empty}</p>
        </div>
      )}
    </section>
  );
}
