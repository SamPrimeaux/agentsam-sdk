/**
 * AgentSam Form & Modal Studio — shared customer-agnostic editing surface.
 *
 * The host supplies an authenticated tenant-scoped adapter and a React runtime.
 * No D1 credentials, customer name, Stripe SDK, or side-effectful preview lives
 * here. API capability is checked before exposing mutation controls.
 */
export const FORM_STUDIO_VERSION = "0.1.0";
export const FORM_STUDIO_KINDS = Object.freeze(["form", "modal", "checkout"]);

export function normalizeStudioResource(value) {
  if (!value || typeof value !== "object") throw Error("studio_resource_invalid");
  const kind = String(value.kind || "");
  const id = String(value.id || "");
  if (!FORM_STUDIO_KINDS.includes(kind) || !id) throw Error("studio_resource_identity_invalid");
  return {
    ...value, id, kind,
    title: String(value.title || "Untitled"),
    status: String(value.status || "draft"),
    fields: Array.isArray(value.fields) ? value.fields : [],
    settings: value.settings && typeof value.settings === "object" ? value.settings : {},
    intro: value.intro && typeof value.intro === "object" ? value.intro : {},
  };
}

export function assertFormStudioAdapter(adapter) {
  for (const key of ["listResources", "getResource", "createFromPreset", "saveResource", "publishResource"]) {
    if (typeof adapter?.[key] !== "function") throw Error("form_studio_adapter_missing_" + key);
  }
  if (!adapter.capabilities || typeof adapter.capabilities !== "object") throw Error("form_studio_capabilities_missing");
  return adapter;
}

export function filterStudioResources(resources, { kind = "all", status = "all", search = "" } = {}) {
  const q = String(search).trim().toLocaleLowerCase();
  return (resources || []).filter(r =>
    (kind === "all" || r.kind === kind) &&
    (status === "all" || r.status === status) &&
    (!q || (r.title + " " + (r.key || r.id)).toLocaleLowerCase().includes(q))
  );
}

export function createFormStudioComponent(React) {
  if (!React || typeof React.createElement !== "function" || !React.useState) {
    throw Error("form_studio_react_required");
  }
  const h = React.createElement;
  const kinds = [["all", "All"], ["form", "Forms"], ["modal", "Modals"], ["checkout", "Checkouts"]];
  const fields = [["text", "Short text"], ["email", "Email"], ["tel", "Phone"], ["number", "Number"],
    ["textarea", "Long answer"], ["select", "Dropdown"], ["checkbox", "Checkbox"]];
  const fieldTypes = new Set(fields.map(([type]) => type));
  const input = (label, props, multiline = false) => h("label", { className: "afs-property" },
    h("span", null, label), h(multiline ? "textarea" : "input", {
      ...props, className: "afs-input", rows: multiline ? 3 : undefined,
    }));
  const press = (label, onClick, className = "", disabled = false) =>
    h("button", { type: "button", onClick, disabled, className: "afs-button " + className }, label);
  const normalizedStatus = (status) =>
    ["active", "published"].includes(status) ? "Published" : status === "archived" ? "Archived" : "Draft";

  return function FormStudio({ adapter, presets = [], onExit, title = "Forms & Modals" }) {
    assertFormStudioAdapter(adapter);
    const [resources, setResources] = React.useState([]);
    const [kind, setKind] = React.useState("all");
    const [statusFilter, setStatusFilter] = React.useState("all");
    const [query, setQuery] = React.useState("");
    const [doc, setDoc] = React.useState(null);
    const [selectedField, setSelectedField] = React.useState(null);
    const [panel, setPanel] = React.useState("build");
    const [device, setDevice] = React.useState("desktop");
    const [creating, setCreating] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    const [dirty, setDirty] = React.useState(false);
    const [error, setError] = React.useState("");
    const [notice, setNotice] = React.useState("");

    async function refresh() {
      const all = await adapter.listResources();
      setResources((all || []).map(normalizeStudioResource));
    }
    React.useEffect(() => {
      let active = true;
      adapter.listResources().then((all) => {
        if (active) setResources((all || []).map(normalizeStudioResource));
      }).catch((e) => { if (active) setError(e.message || "Unable to load resources"); });
      return () => { active = false; };
    }, [adapter]);

    const can = (key) => adapter.capabilities[key] === true;
    async function open(r) {
      setBusy(true); setError(""); setNotice("");
      try {
        const next = normalizeStudioResource(await adapter.getResource(r));
        setDoc(next);
        setSelectedField(next.fields[0]?.id || null);
        setPanel("build"); setDirty(false);
      } catch (e) { setError(e.message || "Could not load this resource"); }
      finally { setBusy(false); }
    }
    function patch(changes) {
      setDoc((old) => ({ ...old, ...changes }));
      setDirty(true); setNotice(""); setError("");
    }
    function patchField(id, changes) {
      patch({ fields: doc.fields.map(f => f.id === id ? { ...f, ...changes } : f) });
    }
    function addField(type) {
      const key = "custom_" + Math.random().toString(36).slice(2, 8);
      const field = {
        id: "fld_" + Math.random().toString(36).slice(2, 13),
        field_key: key, field_type: type,
        label: "New " + (fields.find(([k]) => k === type)?.[1] || "field"),
        placeholder: "", is_required: false, sort_order: (doc.fields.length + 1) * 10,
      };
      patch({ fields: [...doc.fields, field] }); setSelectedField(field.id);
    }
    async function create(preset) {
      if (!can(preset.capability || (preset.kind === "form" ? "forms.create" : preset.kind + "s.create"))) return;
      setBusy(true); setError(""); setCreating(false);
      try {
        const r = normalizeStudioResource(await adapter.createFromPreset(preset));
        await refresh(); await open(r);
      } catch (e) { setError(e.message || "Unable to create resource"); }
      finally { setBusy(false); }
    }
    async function save(publish = false) {
      if (!doc || busy) return;
      const cap = doc.kind + "s." + (publish ? "publish" : "edit");
      if (!can(cap)) { setError("This editor is not connected to a writable " + doc.kind + " adapter."); return; }
      setBusy(true); setError(""); setNotice("");
      try {
        if (dirty) {
          const saved = await adapter.saveResource(doc);
          setDoc(normalizeStudioResource(saved));
          setDirty(false);
        }
        if (publish) {
          const published = await adapter.publishResource(doc);
          if (published) setDoc(normalizeStudioResource(published));
        }
        await refresh();
        setNotice(publish ? "Published successfully" : "Changes saved");
      } catch (e) { setError(e.message || "Save failed"); }
      finally { setBusy(false); }
    }
    const visible = filterStudioResources(resources, {
      kind, status: statusFilter, search: query,
    });
    const selected = doc?.fields.find((f) => f.id === selectedField);
    const editable = doc && can(doc.kind + "s.edit");
    const appearance = doc?.settings?.theme || {};
    const updateTheme = (patchValue) => patch({ settings: {
      ...doc.settings, theme: { ...appearance, ...patchValue },
    } });

    return h("section", { className: "afs-root", "aria-label": "AgentSam Form and Modal Studio" },
      h("header", { className: "afs-header" },
        h("div", { className: "afs-heading" },
          onExit ? press("← Back", onExit, "quiet") : null,
          h("div", null, h("small", null, "AGENTSAM / CONTENT STUDIO"),
            h("h1", null, doc ? doc.title : title))),
        h("div", { className: "afs-toolbar" },
          doc && h("span", { className: "afs-status" }, normalizedStatus(doc.status)),
          doc ? press("All resources", () => { setDoc(null); setDirty(false); setError(""); }, "quiet") : null,
          doc ? press("Save", () => save(false), "", busy || !dirty || !editable) : null,
          doc ? press("Publish", () => save(true), "primary", busy || !can(doc.kind + "s.publish")) : null,
          !doc ? press("Create", () => setCreating(!creating), "primary") : null)),
      error ? h("p", { className: "afs-alert", role: "alert" }, error) : null,
      notice ? h("p", { className: "afs-notice", role: "status" }, notice) : null,
      !doc ? h("div", { className: "afs-listview" },
        h("div", { className: "afs-filter-row" },
          h("nav", { className: "afs-pills", "aria-label": "Resource type" },
            kinds.map(([k, label]) => press(label, () => setKind(k), kind === k ? "selected" : "quiet"))),
          h("select", { className: "afs-input afs-filter", value: statusFilter, "aria-label": "Filter status",
            onChange: e => setStatusFilter(e.target.value) },
            ["all", "published", "draft"].map(v => h("option", { value: v, key: v }, v === "all" ? "Any status" : v))),
          h("input", { className: "afs-input afs-search", placeholder: "Search resources",
            value: query, onChange: e => setQuery(e.target.value), "aria-label": "Search resources" })),
        creating && h("div", { className: "afs-presets", role: "region", "aria-label": "Create from preset" },
          h("div", { className: "afs-presets-heading" }, h("strong", null, "Start with a preset"),
            press("Close", () => setCreating(false), "quiet")),
          h("div", { className: "afs-presets-grid" }, presets.map(p =>
            h("button", { type: "button", className: "afs-preset", key: p.key,
              disabled: !can(p.capability || (p.kind === "form" ? "forms.create" : p.kind + "s.create")),
              onClick: () => create(p) },
              h("b", null, p.title), h("small", null, p.description),
              h("span", null, p.kind.toUpperCase()))))),
        h("div", { className: "afs-resource-list" },
          h("div", { className: "afs-table-head" },
            h("span", null, "Resource"), h("span", null, "Type"), h("span", null, "Status"), h("span", null, "Placement")),
          visible.length ? visible.map(r => h("button", {
            type: "button", key: r.kind + ":" + r.id, className: "afs-resource",
            onClick: () => open(r), disabled: busy,
          }, h("span", { className: "afs-resource-title" }, h("strong", null, r.title),
            h("small", null, r.key || r.id)),
          h("span", null, r.kind), h("span", null, normalizedStatus(r.status)),
          h("span", null, r.placement || "Not placed"))) :
            h("p", { className: "afs-empty" }, "No resources match this view.")))
      : h("div", { className: "afs-editor" },
        h("aside", { className: "afs-left" },
          h("strong", null, "Structure"),
          h("nav", { className: "afs-pills", "aria-label": "Editor mode" },
            ["build", "design", "settings"].map(p => press(p[0].toUpperCase() + p.slice(1),
              () => setPanel(p), panel === p ? "selected" : "quiet"))),
          doc.kind === "form" && panel === "build"
            ? h("div", { className: "afs-structure" },
              doc.fields.map(f => press(f.label || "Untitled", () => setSelectedField(f.id),
                selectedField === f.id ? "selected afs-structure-item" : "quiet afs-structure-item")),
              h("div", { className: "afs-add-fields" },
                h("small", null, "ADD FIELD"),
                fields.map(([type, label]) =>
                  press("+ " + label, () => addField(type), "quiet", !editable))))
            : h("div", { className: "afs-structure" },
              h("p", null, doc.kind === "form" ? "Reusable appearance & behavior" :
                "This resource stays linked to its existing published runtime."),
              doc.kind !== "form" && can(doc.kind + "s.openSource") ?
                press("Open original editor", () => adapter.openSource(doc), "primary") : null)),
        h("div", { className: "afs-canvas" },
          h("div", { className: "afs-devicebar" },
            ["desktop", "tablet", "mobile"].map(d => press(d[0].toUpperCase() + d.slice(1),
              () => setDevice(d), device === d ? "selected" : "quiet"))),
          doc.kind === "form" ?
            h("div", { className: "afs-form-preview afs-" + device, style: {
              "--afs-preview-accent": appearance.accent || "#7c3aed",
              "--afs-preview-radius": Math.min(24, Math.max(4, Number(appearance.radius) || 12)) + "px",
            } },
              h("small", null, doc.settings?.theme?.org_name || "FORM PREVIEW"),
              h("h2", null, doc.intro?.heading || doc.title),
              h("p", null, doc.intro?.subheading || doc.description || ""),
              h("div", { className: "afs-form-fields" },
                doc.fields.filter(f => f.is_active !== 0).map(f => h("label", { key: f.id },
                  h("strong", null, f.label || "Question", f.is_required && " *"),
                  f.field_type === "textarea"
                    ? h("textarea", { disabled: true, placeholder: f.placeholder || "Your answer" })
                    : h("input", { type: fieldTypes.has(f.field_type) ? f.field_type : "text",
                      disabled: true, placeholder: f.placeholder || "Your answer" })))),
              h("button", { type: "button", disabled: true }, doc.settings?.submit_label || "Submit"),
              h("small", { className: "afs-preview-note" }, "Preview only — no data is submitted"))
            : h("div", { className: "afs-resource-preview" }, h("small", null, doc.kind.toUpperCase()),
              h("h2", null, doc.title), h("p", null, doc.description || "Existing resource"),
              h("p", null, "Editing is available when the installed adapter supports this resource."),
              can(doc.kind + "s.openSource") ? press("Open current editor", () => adapter.openSource(doc)) : null)),
        h("aside", { className: "afs-right" },
          h("strong", null, "Inspector"),
          doc.kind === "form" && panel === "build" && selected
            ? h("div", { className: "afs-inspector-controls" },
              input("Question label", { value: selected.label || "",
                onChange: e => patchField(selected.id, { label: e.target.value }), disabled: !editable }),
              input("Placeholder", { value: selected.placeholder || "",
                onChange: e => patchField(selected.id, { placeholder: e.target.value }), disabled: !editable }),
              h("label", { className: "afs-toggle" },
                h("input", { type: "checkbox", checked: !!selected.is_required,
                  onChange: e => patchField(selected.id, { is_required: e.target.checked }), disabled: !editable }),
                "Required field"),
              press("Remove field", () => {
                patch({ fields: doc.fields.filter(f => f.id !== selected.id) }); setSelectedField(null);
              }, "danger", !editable || selected.is_system))
            : panel === "design" && doc.kind === "form"
              ? h("div", { className: "afs-inspector-controls" },
                input("Accent color", { type: "color", value: appearance.accent || "#7c3aed",
                  onChange: e => updateTheme({ accent: e.target.value }), disabled: !editable }),
                input("Corner radius", { type: "number", min: 4, max: 24, value: appearance.radius || 12,
                  onChange: e => updateTheme({ radius: Number(e.target.value) }), disabled: !editable }))
              : h("div", { className: "afs-inspector-controls" },
                input("Title", { value: doc.title, onChange: e => patch({ title: e.target.value }),
                  disabled: !editable }),
                input("Description", { value: doc.description || "",
                  onChange: e => patch({ description: e.target.value }), disabled: !editable }, true),
                h("p", { className: "afs-muted" }, "The website, form submissions and payment provider remain managed by the host.")))));
  };
}
