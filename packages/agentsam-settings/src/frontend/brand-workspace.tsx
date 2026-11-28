import "./brand-workspace.css";
import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { brandColors, normalizeBrandWorkspace, renderBrandCoverSvg, type BrandWorkspaceEntry } from "@inneranimalmedia/agentsam-brand/workspace";

type View = "overview" | "assets" | "sources" | "usage" | "review";
type FormMode = "create" | "edit" | null;
type BrandForm = {
  name: string;
  slug: string;
  tagline: string;
  description: string;
  mission: string;
  parentBrandId: string;
  architectureModel: "master_brand" | "monolithic_sub" | "standalone_brand" | "endorsed_brand";
};
type Props = {
  data: unknown;
  initialBrandSlug?: string;
  onBrandSelected?: (slug: string) => void;
  onCreateBrand?: (input: Record<string, unknown>) => Promise<unknown>;
  onUpdateBrand?: (slug: string, input: Record<string, unknown>) => Promise<unknown>;
  onRefresh?: () => Promise<void>;
};

const views: { id: View; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "assets", label: "Assets" },
  { id: "sources", label: "Sources" },
  { id: "usage", label: "Usage" },
  { id: "review", label: "Review" },
];

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
const asList = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const str = (value: unknown): string => typeof value === "string" ? value.trim() : "";
const named = (value: unknown) => {
  const entry = asRecord(value);
  return str(entry.name || entry.display_name || entry.title || entry.role || entry.path || entry.asset_key || entry.id);
};
const listOfAssets = (brand: BrandWorkspaceEntry) => {
  const source = asRecord(brand.assets);
  return asList(Array.isArray(brand.assets) ? brand.assets : source.items);
};
const slugify = (value: string) => value.toLowerCase().trim()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
const emptyForm = (parentBrandId = ""): BrandForm => ({
  name: "",
  slug: "",
  tagline: "",
  description: "",
  mission: "",
  parentBrandId,
  architectureModel: parentBrandId ? "endorsed_brand" : "standalone_brand",
});
const FieldEmpty = ({ title, detail }: { title: string; detail: string }) =>
  <div className="rounded-xl border border-dashed border-border/80 bg-muted/10 p-6">
    <p className="text-[13px] font-medium text-foreground">{title}</p>
    <p className="mt-2 max-w-xl text-[12px] leading-5 text-muted-foreground">{detail}</p>
  </div>;

export function BrandPluginWorkspace({
  data,
  initialBrandSlug,
  onBrandSelected,
  onCreateBrand,
  onUpdateBrand,
  onRefresh,
}: Props) {
  const model = useMemo(() => normalizeBrandWorkspace(data), [data]);
  const [selectedBrandSlug, setSelectedBrandSlug] = useState("");
  const [view, setView] = useState<View>("overview");
  const [themeId, setThemeId] = useState("");
  const [formMode, setFormMode] = useState<FormMode>(null);
  const [form, setForm] = useState<BrandForm>(emptyForm());
  const [slugTouched, setSlugTouched] = useState(false);
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");

  const activeSlug = model.brands.some(brand => brand.slug === selectedBrandSlug)
    ? selectedBrandSlug
    : model.activeBrandSlug || model.brands[0]?.slug || "";
  const brand = model.brands.find(item => item.slug === activeSlug) ||
    model.brands.find(item => item.id === model.activeBrandId);
  const assets = brand ? listOfAssets(brand) : [];
  const sources = brand && asList(brand.sources).length ? asList(brand.sources) : model.connections;
  const contract = asRecord(brand?.contract);
  const variants = asList(brand?.themes).filter(item => str(asRecord(item).id));
  const colors = useMemo(() => brand ? brandColors(brand.colors, themeId) : [], [brand, themeId]);
  const cover = useMemo(() => brand ? renderBrandCoverSvg({
    id: brand.id,
    name: brand.name,
    tagline: brand.tagline || str(contract.tagline || contract.slogan),
    colors: brand.colors,
    themeId,
  }) : null, [brand, themeId, contract]);
  const dataRecord = asRecord(data);
  const usage = asRecord(dataRecord.usage);
  const findings = asList(dataRecord.findings);
  const reviewQueue = asList(dataRecord.review_queue);
  const revisions = asList(brand?.contractRevisions);
  const totalAssets = Number(brand?.assetCount || asRecord(brand?.assets).total || assets.length);
  const variantCount = assets.reduce<number>((total, asset) => total + asList(asRecord(asset).variants).length, 0);
  const parent = model.brands.find(item => item.id === brand?.parentBrandId);
  const contractApproved = brand?.contractStatus === "approved";

  useEffect(() => {
    const fromUrl = typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("brand") || "";
    const preferred = initialBrandSlug || fromUrl || model.activeBrandSlug || model.brands[0]?.slug || "";
    if (preferred && model.brands.some(item => item.slug === preferred)) setSelectedBrandSlug(preferred);
    else if (!model.brands.some(item => item.slug === selectedBrandSlug)) setSelectedBrandSlug(model.brands[0]?.slug || "");
  }, [initialBrandSlug, model.activeBrandSlug, model.brands]);

  useEffect(() => {
    const onPopState = () => {
      const slug = new URLSearchParams(window.location.search).get("brand") || "";
      if (model.brands.some(item => item.slug === slug)) setSelectedBrandSlug(slug);
    };
    if (typeof window === "undefined") return;
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [model.brands]);

  useEffect(() => {
    setView("overview");
    setThemeId("");
    setFormMode(null);
    setFormError("");
  }, [activeSlug]);

  function selectBrand(slug: string) {
    setSelectedBrandSlug(slug);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (slug) url.searchParams.set("brand", slug);
      else url.searchParams.delete("brand");
      window.history.pushState(window.history.state, "", url.pathname + url.search + url.hash);
    }
    onBrandSelected?.(slug);
  }

  function openCreate() {
    setForm(emptyForm(brand?.id || ""));
    setSlugTouched(false);
    setFormError("");
    setNotice("");
    setFormMode("create");
  }

  function openEdit() {
    if (!brand) return;
    setForm({
      name: brand.name,
      slug: brand.slug,
      tagline: brand.tagline || "",
      description: brand.description || "",
      mission: brand.mission || "",
      parentBrandId: brand.parentBrandId || "",
      architectureModel: (brand.architectureModel || "standalone_brand") as BrandForm["architectureModel"],
    });
    setSlugTouched(true);
    setFormError("");
    setNotice("");
    setFormMode("edit");
  }

  async function saveBrand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setNotice("");
    if (!form.name.trim()) {
      setFormError("A brand name is required.");
      return;
    }
    if (formMode === "create" && (!form.slug.trim() || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug))) {
      setFormError("Use a lowercase, URL-safe brand slug.");
      return;
    }
    setFormBusy(true);
    try {
      if (formMode === "create") {
        if (!onCreateBrand) throw new Error("Brand creation is not available on this host.");
        const result = asRecord(await onCreateBrand({
          name: form.name.trim(),
          displayName: form.name.trim(),
          slug: form.slug.trim(),
          tagline: form.tagline.trim() || null,
          description: form.description.trim() || null,
          mission: form.mission.trim() || null,
          parentBrandId: form.parentBrandId || null,
          architectureModel: form.architectureModel,
        }));
        const created = asRecord(result.brand || result);
        const createdSlug = str(created.slug) || form.slug;
        setFormMode(null);
        setNotice("Brand created in the shared registry.");
        if (createdSlug) selectBrand(createdSlug);
      } else if (formMode === "edit" && brand) {
        if (!onUpdateBrand) throw new Error("Brand editing is not available on this host.");
        await onUpdateBrand(brand.slug, {
          name: form.name.trim(),
          displayName: form.name.trim(),
          tagline: form.tagline.trim() || null,
          description: form.description.trim() || null,
          mission: form.mission.trim() || null,
          parentBrandId: form.parentBrandId || null,
          architectureModel: form.architectureModel,
        });
        setFormMode(null);
        setNotice("Brand identity updated. Its stable slug and links were preserved.");
      }
      await onRefresh?.();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unable to save brand identity.");
    } finally {
      setFormBusy(false);
    }
  }

  return <section className="space-y-5" aria-label="Brand identities workspace">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h3 className="text-[16px] font-semibold text-foreground">Brand identities</h3>
        <p className="mt-1 max-w-2xl text-[12px] leading-5 text-muted-foreground">
          Each brand keeps its own stable identity, source evidence, assets, tokens and approvals. Shared systems do not merge brand identities.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span className="rounded-lg border border-border px-3 py-2 text-[12px] text-muted-foreground">
          {model.brands.length} recorded brand{model.brands.length === 1 ? "" : "s"}
        </span>
        <button type="button" onClick={openCreate} disabled={!onCreateBrand}
          className="rounded-lg bg-primary px-3 py-2 text-[12px] font-medium text-primary-foreground disabled:opacity-50">
          New brand
        </button>
      </div>
    </header>

    {notice ? <p role="status" className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3 py-2 text-[12px] text-emerald-700 dark:text-emerald-300">{notice}</p> : null}

    {formMode ? <form onSubmit={saveBrand} className="space-y-4 rounded-xl border border-border/80 bg-muted/10 p-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h4 className="text-[14px] font-semibold">{formMode === "create" ? "Create brand identity" : "Edit brand identity"}</h4>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {formMode === "create" ? "Creates a record in the existing brands registry." : "The display name can change without changing this brand's permanent slug."}
          </p>
        </div>
        <button type="button" onClick={() => setFormMode(null)} className="rounded-lg border border-border px-3 py-1.5 text-[11px]">Cancel</button>
      </header>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-[11px] text-muted-foreground">
          Brand name
          <input required maxLength={160} value={form.name} onChange={event => setForm(current => ({
            ...current,
            name: event.target.value,
            slug: formMode === "create" && !slugTouched ? slugify(event.target.value) : current.slug,
          }))} className="block w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground"/>
        </label>
        <label className="space-y-1 text-[11px] text-muted-foreground">
          Stable slug
          <input required disabled={formMode === "edit"} maxLength={80} value={form.slug} onChange={event => {
            setSlugTouched(true);
            setForm(current => ({ ...current, slug: slugify(event.target.value) }));
          }} className="block w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground disabled:opacity-70"/>
        </label>
        <label className="space-y-1 text-[11px] text-muted-foreground">
          Parent brand
          <select value={form.parentBrandId} onChange={event => setForm(current => ({ ...current, parentBrandId: event.target.value }))}
            className="block w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground">
            <option value="">No parent</option>
            {model.brands.filter(item => item.id !== brand?.id).map(item =>
              <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-[11px] text-muted-foreground">
          Brand architecture
          <select value={form.architectureModel} onChange={event => setForm(current => ({ ...current, architectureModel: event.target.value as BrandForm["architectureModel"] }))}
            className="block w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground">
            <option value="master_brand">Master brand</option>
            <option value="monolithic_sub">Monolithic sub-brand</option>
            <option value="standalone_brand">Standalone brand</option>
            <option value="endorsed_brand">Endorsed brand</option>
          </select>
        </label>
        <label className="space-y-1 text-[11px] text-muted-foreground sm:col-span-2">
          Tagline
          <input maxLength={240} value={form.tagline} onChange={event => setForm(current => ({ ...current, tagline: event.target.value }))}
            className="block w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground"/>
        </label>
        <label className="space-y-1 text-[11px] text-muted-foreground sm:col-span-2">
          Description
          <textarea rows={3} maxLength={2000} value={form.description} onChange={event => setForm(current => ({ ...current, description: event.target.value }))}
            className="block w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground"/>
        </label>
        <label className="space-y-1 text-[11px] text-muted-foreground sm:col-span-2">
          Mission
          <textarea rows={3} maxLength={2000} value={form.mission} onChange={event => setForm(current => ({ ...current, mission: event.target.value }))}
            className="block w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground"/>
        </label>
      </div>
      {formMode === "edit" ? <p className="text-[10px] text-muted-foreground">Permanent URL identity: {brand?.slug}. Renaming the brand does not alter asset relationships or deep links.</p> : null}
      {formError ? <p role="alert" className="text-[11px] text-[var(--settings-danger-ink)]">{formError}</p> : null}
      <button type="submit" disabled={formBusy || (formMode === "create" ? !onCreateBrand : !onUpdateBrand)}
        className="rounded-lg bg-primary px-4 py-2 text-[12px] font-medium text-primary-foreground disabled:opacity-50">
        {formBusy ? "Saving…" : formMode === "create" ? "Create brand" : "Save identity"}
      </button>
    </form> : null}

    {!brand ? <FieldEmpty title="No recorded brand identity" detail="Create a brand record or connect the Brand workspace to inspect the existing registry. This workspace will not invent a logo, palette or approved contract."/> : <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/10 p-3">
        <label className="flex min-w-0 items-center gap-3 text-[12px]">
          <span className="text-muted-foreground">Brand</span>
          <select aria-label="Select brand identity" value={activeSlug} onChange={event => selectBrand(event.target.value)}
            className="min-w-[165px] max-w-[280px] rounded-lg border border-border bg-background px-3 py-2 text-foreground">
            {model.brands.map(item => <option key={item.id} value={item.slug}>{item.name || item.id}</option>)}
          </select>
        </label>
        <div className="flex items-center gap-2">
          <span className="rounded-lg border border-border px-3 py-2 text-[11px] text-muted-foreground">
            {contractApproved ? "Approved BrandContract" : "Registry record · " + (brand.contractStatus || "no approved contract")}
          </span>
          <button type="button" onClick={openEdit} disabled={!onUpdateBrand}
            className="rounded-lg border border-border px-3 py-2 text-[11px] hover:bg-muted disabled:opacity-50">Edit identity</button>
        </div>
      </div>
      <nav aria-label="Brand workspace sections" className="flex flex-wrap gap-2 border-b border-border/70 pb-3">
        {views.map(item => <button type="button" key={item.id} onClick={() => setView(item.id)} aria-current={view === item.id ? "page" : undefined}
          className={view === item.id
            ? "rounded-lg border border-border bg-muted px-3 py-2 text-[12px] font-medium text-foreground"
            : "rounded-lg border border-transparent px-3 py-2 text-[12px] text-muted-foreground hover:border-border/70 hover:text-foreground"}>
          {item.label}
        </button>)}
      </nav>

      {view === "overview" && <div className="space-y-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(200px,1fr)]">
          <div className="min-w-0 overflow-hidden rounded-xl border border-border/70 bg-muted/10">
            {cover ? <img className="block aspect-video w-full object-cover" src={"data:image/svg+xml;charset=utf-8," + encodeURIComponent(cover)} alt={brand.name + " token-derived cover"} /> :
              <div className="flex aspect-video items-center justify-center p-7 text-center text-[12px] text-muted-foreground">
                Cover preview requires a recorded brand name, three usable colors and a verified contrast pair. No placeholder mark is generated.
              </div>}
            <p className="border-t border-border/70 px-3 py-2 text-[11px] text-muted-foreground">Generated preview from recorded colors · not a published asset or replacement for an approved cover</p>
          </div>
          <div className="space-y-3 rounded-xl border border-border/70 p-4">
            <h4 className="text-[15px] font-semibold text-foreground">{brand.name || brand.id}</h4>
            <p className="text-[11px] text-muted-foreground">Permanent slug: {brand.slug}</p>
            {brand.tagline ? <p className="text-[12px] text-foreground">{brand.tagline}</p> : null}
            {brand.description ? <p className="text-[12px] leading-5 text-muted-foreground">{brand.description}</p> : null}
            <dl className="grid grid-cols-2 gap-3 border-t border-border/70 pt-3">
              <div><dt className="text-[11px] text-muted-foreground">Assets</dt><dd className="text-xl font-semibold">{totalAssets}</dd></div>
              <div><dt className="text-[11px] text-muted-foreground">Evidence sources</dt><dd className="text-xl font-semibold">{sources.length}</dd></div>
              <div><dt className="text-[11px] text-muted-foreground">Asset variants</dt><dd className="text-xl font-semibold">{variantCount}</dd></div>
              <div><dt className="text-[11px] text-muted-foreground">Contract revisions</dt><dd className="text-xl font-semibold">{revisions.length}</dd></div>
            </dl>
            <p className="text-[11px] text-muted-foreground">Architecture: {brand.architectureModel || "Not specified"}</p>
            {parent ? <p className="text-[11px] text-muted-foreground">Parent brand: {parent.name}</p> : null}
            {brand.mission ? <p className="border-t border-border/70 pt-3 text-[12px] leading-5 text-muted-foreground">{brand.mission}</p> : null}
            {variants.length ? <label className="block space-y-1 pt-2 text-[11px] text-muted-foreground">Preview variant
              <select value={themeId} onChange={event => setThemeId(event.target.value)}
                className="block w-full rounded-lg border border-border bg-background px-3 py-2 text-[12px] text-foreground">
                <option value="">Default source values</option>
                {variants.map(item => <option key={str(asRecord(item).id)} value={str(asRecord(item).id)}>{named(item)}</option>)}
              </select>
            </label> : null}
          </div>
        </div>
        {colors.length ? <section aria-label="Brand color roles" className="space-y-3">
          <h4 className="text-[13px] font-semibold">Recorded color roles</h4>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {colors.map(item => <article key={item.name} className="overflow-hidden rounded-lg border border-border/70">
              <div className="h-16 brand-workspace-swatch" style={{ "--brand-swatch-color": item.value } as CSSProperties} aria-label={item.name + " color sample"}/>
              <div className="space-y-1 px-3 py-2"><p className="text-[12px] font-medium">{item.name}</p>
                <p className="break-all text-[11px] text-muted-foreground">{item.sourceValue}</p>
                {item.usage && <p className="text-[11px] text-muted-foreground">{item.usage}</p>}
              </div>
            </article>)}
          </div>
        </section> : <FieldEmpty title="No verified palette recorded" detail="A brand record does not automatically create color tokens. Add source-backed colors to its theme or approved BrandContract."/>}
      </div>}

      {view === "assets" && <div className="space-y-3">
        <div className="flex items-center justify-between gap-3"><h4 className="text-[13px] font-semibold">Account-owned brand assets</h4><span className="text-[11px] text-muted-foreground">{totalAssets} records</span></div>
        {assets.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {assets.map((item, index) => {
            const asset = asRecord(item);
            const preview = str(asset.previewUrl || asset.preview_url || asRecord(asset.primaryVariant).deliveryUrl || asRecord(asset.primaryVariant).delivery_url);
            return <article key={str(asset.id) || index} className="overflow-hidden rounded-xl border border-border/70">
              {preview ? <img src={preview} alt={str(asset.altText || asset.alt_text || asset.title)} className="h-32 w-full bg-muted/20 object-contain p-3"/> :
                <div className="flex h-32 items-center justify-center bg-muted/20 text-[11px] text-muted-foreground">{str(asset.category || "Asset")}</div>}
              <div className="space-y-1 p-3"><p className="text-[12px] font-medium">{named(item)}</p>
                <p className="text-[10px] text-muted-foreground">{str(asset.category)} · {str(asset.version || "version unspecified")}</p>
                <p className="break-all text-[10px] text-muted-foreground">{str(asset.asset_key || asset.path || asset.id)}</p>
                <p className="text-[10px] text-muted-foreground">{asList(asset.variants).length} stored variants</p>
              </div>
            </article>;
          })}
        </div> : <FieldEmpty title="No assets registered for this brand" detail="The registry is account-scoped. Assets from another account or an unmatched brand slug are not presented as belonging to this brand."/>}
      </div>}

      {view === "sources" && <div className="space-y-3">
        <h4 className="text-[13px] font-semibold">Authorized evidence sources</h4>
        {sources.length ? sources.map((item, index) => {
          const source = asRecord(item);
          return <article key={str(source.id) || index} className="rounded-xl border border-border/70 p-4">
            <p className="text-[12px] font-medium">{str(source.provider || source.source || source.name || source.id) || "Authorized source"}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{str(source.kind || source.connectionKind)} · {str(source.status || "status not provided")}</p>
            {source.resource ? <p className="mt-2 break-all text-[11px] text-muted-foreground">{str(source.resource)}</p> : null}
          </article>;
        }) : <FieldEmpty title="No connected sources returned" detail="Connect or provide brand source material before treating evidence discovery as complete."/>}
      </div>}

      {view === "usage" && <div className="space-y-3">
        <h4 className="text-[13px] font-semibold">Brand usage</h4>
        {usage.available ? <div className="grid gap-3 sm:grid-cols-2">
          <article className="rounded-xl border border-border/70 p-4"><p className="text-[11px] text-muted-foreground">Color references</p><p className="text-xl font-semibold">{Number(usage.color_references || 0)}</p></article>
          <article className="rounded-xl border border-border/70 p-4"><p className="text-[11px] text-muted-foreground">Typography references</p><p className="text-xl font-semibold">{Number(usage.typography_references || 0)}</p></article>
          {asList(usage.references).map((item, index) => <article key={index} className="rounded-xl border border-border/70 p-3 text-[12px]">
            <p className="font-medium">{str(asRecord(item).value)}</p><p className="mt-1 text-[10px] text-muted-foreground">{str(asRecord(item).kind)} · {Number(asRecord(item).occurrences || 0)} occurrences</p>
          </article>)}
        </div> : <FieldEmpty title="Usage evidence not yet scanned" detail={str(usage.reason) || "Registry assets are available, but repository and published-site usage requires an explicit scan."}/>}
      </div>}

      {view === "review" && <div className="space-y-4">
        <article className="space-y-3 rounded-xl border border-border/70 p-4">
          <h4 className="text-[13px] font-semibold">Identity review</h4>
          <p className="text-[12px] text-muted-foreground">Registry status: {brand.status}. BrandContract: {brand.contractStatus || "not defined"}. Registry metadata is not an approved contract.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border/70 p-3 text-[12px]">Stable identity: {brand.id} · {brand.slug}</div>
            <div className="rounded-lg border border-border/70 p-3 text-[12px]">Last updated: {str(brand.lastChange) || "Not provided"}</div>
          </div>
          {revisions.length ? <section className="space-y-2">
            <h5 className="text-[12px] font-semibold">BrandContract history</h5>
            {revisions.map((item, index) => {
              const revision = asRecord(item);
              return <article key={str(revision.id) || index} className="rounded-lg border border-border/70 p-3 text-[11px]">
                <div className="flex flex-wrap justify-between gap-2"><strong>{str(revision.status || "revision")}</strong><span className="text-muted-foreground">{str(revision.updated_at || revision.created_at)}</span></div>
                <p className="mt-1 text-muted-foreground">Schema {str(revision.schema_version || "unspecified")} · {str(revision.id)}</p>
              </article>;
            })}
          </section> : <FieldEmpty title="No brand-specific contract revisions" detail="Legacy workspace-only contracts remain unassigned; they are not silently attached to this brand."/>}
          <details className="rounded-lg border border-border/70 p-3">
            <summary className="cursor-pointer text-[12px] font-medium">Inspect source contract</summary>
            <pre className="mt-3 max-h-[500px] overflow-auto whitespace-pre-wrap break-words text-[11px] leading-5 text-muted-foreground">{JSON.stringify(contract, null, 2)}</pre>
          </details>
        </article>
        {findings.length ? <section className="space-y-2"><h4 className="text-[13px] font-semibold">Evidence findings</h4>
          {findings.map((item, index) => <article key={index} className="rounded-lg border border-border/70 p-3 text-[11px]">
            <p className="font-medium">{str(asRecord(item).title || asRecord(item).kind)}</p>
            <p className="mt-1 text-muted-foreground">{str(asRecord(item).detail)}</p>
          </article>)}
        </section> : null}
        {reviewQueue.length ? <section className="space-y-2"><h4 className="text-[13px] font-semibold">Review queue</h4>
          {reviewQueue.map((item, index) => <article key={index} className="rounded-lg border border-border/70 p-3 text-[11px]">
            <p className="font-medium">{str(asRecord(item).title)}</p>
            <p className="mt-1 text-muted-foreground">{str(asRecord(item).detail)}</p>
          </article>)}
        </section> : null}
        {model.unmatchedAssetSlugs.length ? <section className="space-y-2"><h4 className="text-[13px] font-semibold">Unmatched asset slugs</h4>
          {model.unmatchedAssetSlugs.map((item, index) => <article key={index} className="rounded-lg border border-amber-500/25 p-3 text-[11px]">
            <p className="font-medium">{str(asRecord(item).brandSlug || asRecord(item).brand_slug)}</p>
            <p className="mt-1 text-muted-foreground">{Number(asRecord(item).assetCount || asRecord(item).asset_count || 0)} assets have no matching brands registry row.</p>
          </article>)}
        </section> : null}
        {model.warnings.map((warning, index) => <p key={index} className="text-[11px] text-muted-foreground">{warning}</p>)}
      </div>}
    </>}
  </section>;
}
