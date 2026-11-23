import { useEffect, useMemo, useState } from "react";
import { brandColors, normalizeBrandWorkspace, renderBrandCoverSvg, type BrandWorkspaceEntry } from "@inneranimalmedia/agentsam-brand/workspace";

type View = "overview" | "assets" | "sources" | "usage" | "review";
const views: { id: View; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "assets", label: "Assets" },
  { id: "sources", label: "Sources" },
  { id: "usage", label: "Usage" },
  { id: "review", label: "Review" },
];

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const asList = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const str = (value: unknown): string => typeof value === "string" ? value.trim() : "";
const named = (value: unknown) => {
  const entry = asRecord(value);
  return str(entry.name || entry.display_name || entry.title || entry.role || entry.path || entry.id);
};
const listOfAssets = (brand: BrandWorkspaceEntry) => {
  const source = asRecord(brand.assets);
  return asList(Array.isArray(brand.assets) ? brand.assets : source.items);
};
const FieldEmpty = ({ title, detail }: { title: string; detail: string }) =>
  <div className="rounded-xl border border-dashed border-border/80 bg-muted/10 p-6">
    <p className="text-[13px] font-medium text-foreground">{title}</p>
    <p className="mt-2 max-w-xl text-[12px] leading-5 text-muted-foreground">{detail}</p>
  </div>;

/**
 * Read-only presentation of the authorized Brand plugin's saved records.
 * Never seeds a brand, invents token values, or alters an approved contract.
 * Design-system authoring and publish require explicit, separate operations.
 */
export function BrandPluginWorkspace({ data }: { data: unknown }) {
  const model = useMemo(() => normalizeBrandWorkspace(data), [data]);
  const [selectedBrandId, setSelectedBrandId] = useState("");
  const [view, setView] = useState<View>("overview");
  const [themeId, setThemeId] = useState("");
  const activeId = model.brands.some(brand => brand.id === selectedBrandId)
    ? selectedBrandId : model.activeBrandId || model.brands[0]?.id || "";
  const brand = model.brands.find(item => item.id === activeId);
  useEffect(() => { setView("overview"); setThemeId(""); }, [activeId]);
  const colors = useMemo(() => brand ? brandColors(brand.colors, themeId) : [], [brand, themeId]);
  const cover = useMemo(() => brand ? renderBrandCoverSvg({
    id: brand.id,
    name: brand.name,
    tagline: str(asRecord(brand.contract).tagline || asRecord(brand.contract).slogan),
    colors: brand.colors,
    themeId,
  }) : null, [brand, themeId]);
  const assets = brand ? listOfAssets(brand) : [];
  const sources = brand && asList(brand.sources).length ? asList(brand.sources) : model.connections;
  const contract = asRecord(brand?.contract);
  const variants = asList(brand?.themes).filter(item => str(asRecord(item).id));
  return <section className="space-y-5" aria-label="Brand identities workspace">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h3 className="text-[16px] font-semibold text-foreground">Brand identities</h3>
        <p className="mt-1 max-w-2xl text-[12px] leading-5 text-muted-foreground">
          Each brand owns its source evidence, tokens, assets and approvals. Shared components and presentation rules may be reused without merging brand identities.
        </p>
      </div>
      <span className="rounded-lg border border-border px-3 py-2 text-[12px] text-muted-foreground">{model.brands.length} recorded brand{model.brands.length === 1 ? "" : "s"}</span>
    </header>
    {!brand ? <FieldEmpty title="No recorded brand identity" detail="The connected Brand workspace has not returned a saved identity. Inspect authorized brand sources, draft a contract and approve it explicitly. This workspace will not invent a logo, palette or brand name."/> : <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/10 p-3">
        <label className="flex min-w-0 items-center gap-3 text-[12px]">
          <span className="text-muted-foreground">Brand</span>
          <select aria-label="Select brand identity" value={activeId} onChange={event => setSelectedBrandId(event.target.value)}
            className="min-w-[165px] max-w-[280px] rounded-lg border border-border bg-background px-3 py-2 text-foreground">
            {model.brands.map(item => <option key={item.id} value={item.id}>{item.name || item.id}</option>)}
          </select>
        </label>
        <span className="rounded-lg border border-border px-3 py-2 text-[11px] text-muted-foreground">
          {brand.status === "approved" ? "Approved identity" : "Not approved · " + brand.status}
        </span>
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
            {cover ? <img className="block aspect-video w-full object-cover" src={"data:image/svg+xml;charset=utf-8," + encodeURIComponent(cover)} alt={(brand.name || brand.id) + " token-derived cover"} /> :
              <div className="flex aspect-video items-center justify-center p-7 text-center text-[12px] text-muted-foreground">
                Cover preview requires a recorded brand name, at least three usable colors and a verified 4.5:1 text/surface contrast pair. No placeholder mark is generated.
              </div>}
            <p className="border-t border-border/70 px-3 py-2 text-[11px] text-muted-foreground">Generated preview from recorded colors · not a published asset or replacement for an approved cover</p>
          </div>
          <div className="space-y-3 rounded-xl border border-border/70 p-4">
            <h4 className="text-[15px] font-semibold text-foreground">{brand.name || brand.id}</h4>
            <p className="text-[12px] text-muted-foreground">Identity: {brand.id}</p>
            <dl className="grid grid-cols-2 gap-3 pt-2">
              <div><dt className="text-[11px] text-muted-foreground">Colors</dt><dd className="text-xl font-semibold">{colors.length}</dd></div>
              <div><dt className="text-[11px] text-muted-foreground">Assets</dt><dd className="text-xl font-semibold">{assets.length}</dd></div>
              <div><dt className="text-[11px] text-muted-foreground">Evidence sources</dt><dd className="text-xl font-semibold">{sources.length}</dd></div>
              <div><dt className="text-[11px] text-muted-foreground">Variants</dt><dd className="text-xl font-semibold">{variants.length}</dd></div>
            </dl>
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
              <div className="h-16" style={{ backgroundColor: item.value }} aria-label={item.name + " color sample"}/>
              <div className="space-y-1 px-3 py-2"><p className="text-[12px] font-medium">{item.name}</p>
                <p className="break-all text-[11px] text-muted-foreground">{item.sourceValue}</p>
                {item.usage && <p className="text-[11px] text-muted-foreground">{item.usage}</p>}
              </div>
            </article>)}
          </div>
        </section> : <FieldEmpty title="No validated palette" detail="Color values must come from the connected BrandContract or brand pack. Unresolved aliases and unsupported CSS values are excluded; use the Sources section to inspect evidence."/>}
      </div>}
      {view === "assets" && (assets.length ? <div className="grid gap-3 sm:grid-cols-2">
        {assets.map((asset, index) => {
          const row = asRecord(asset);
          return <article key={str(row.id || row.path || row.key) || index} className="rounded-xl border border-border/70 p-4">
            <p className="break-words text-[13px] font-medium">{named(asset) || "Unlabeled source asset"}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{str(row.role || row.mime_type || row.type) || "Asset"} · {str(row.status) || "Status not provided"}</p>
            {str(row.path || row.key) ? <p className="mt-2 break-all font-mono text-[11px] text-muted-foreground">{str(row.path || row.key)}</p> : null}
          </article>;
        })}
      </div> : <FieldEmpty title="No registered brand assets" detail="Logos, icons, photos and fonts are read from actual source records and approved asset references. No replacement logos or invented asset cards are generated."/>)}
      {view === "sources" && (sources.length ? <div className="grid gap-3">
        {sources.map((source, index) => {
          const entry = asRecord(source);
          return <article key={str(entry.id || entry.connection_id) || index} className="rounded-xl border border-border/70 p-4">
            <p className="text-[13px] font-medium">{named(source) || str(entry.source || entry.provider) || "Evidence source"}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">Source type: {str(entry.type || entry.kind || entry.provider) || "Not specified"}</p>
            {str(entry.status) && <p className="mt-1 text-[11px] text-muted-foreground">Status: {str(entry.status)}</p>}
          </article>;
        })}
      </div> : <FieldEmpty title="No connected brand evidence" detail="Use the Brand plugin's authorized inspection and source connection operations. Importing files or connecting a repository does not itself approve a brand identity."/>)}
      {view === "usage" && <div className="grid gap-3 lg:grid-cols-2">
        {(["preservation", "rules", "concept", "components"] as const).map(key => {
          const value = contract[key];
          return <article key={key} className="rounded-xl border border-border/70 p-4">
            <h4 className="text-[13px] font-semibold capitalize">{key}</h4>
            {value && (typeof value !== "object" || Object.keys(asRecord(value)).length || asList(value).length) ?
              <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-5 text-muted-foreground">{JSON.stringify(value, null, 2)}</pre> :
              <p className="mt-2 text-[12px] text-muted-foreground">No verified {key} guidance recorded.</p>}
          </article>;
        })}
      </div>}
      {view === "review" && <article className="space-y-4 rounded-xl border border-border/70 p-4">
        <header><h4 className="text-[13px] font-semibold">Identity review</h4>
          <p className="mt-2 text-[12px] text-muted-foreground">Status: {brand.status}. Review does not write, approve or publish a contract.</p></header>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-border/70 p-3 text-[12px]">Contract: {str(contract.schema || contract.schema_version) || "Unspecified"}</div>
          <div className="rounded-lg border border-border/70 p-3 text-[12px]">Updated: {str(brand.lastChange || contract.updated_at) || "Not provided"}</div>
        </div>
        <details className="rounded-lg border border-border/70 p-3">
          <summary className="cursor-pointer text-[12px] font-medium">Inspect source contract</summary>
          <pre className="mt-3 max-h-[500px] overflow-auto whitespace-pre-wrap break-words text-[11px] leading-5 text-muted-foreground">{JSON.stringify(contract, null, 2)}</pre>
        </details>
      </article>}
    </>}
  </section>;
}
