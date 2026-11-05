import {
  Archive, Box, Columns3, Copy, ExternalLink, FileArchive, FileAudio2, FileCode2, FileImage, FileText,
  FileVideo2, Folder, Grid2X2, LayoutGrid, List, MoreHorizontal, Palette, Pencil,
  Presentation, RotateCcw, Star, StickyNote, Table2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { WorkArtifact } from "../../contracts/index";
import { WorkSearch } from "../WorkShell";

const sourceLabels: Record<WorkArtifact["source"], string> = {
  artifacts: "Saved work", r2: "R2", cf_images: "Cloudflare Images", stream: "Cloudflare Stream",
  "google-drive": "Google Drive", "shared-drives": "Shared drives", local: "My computer",
};
function iconFor(kind: WorkArtifact["kind"]) {
  switch (kind) {
    case "image": return FileImage;
    case "video": return FileVideo2;
    case "audio": return FileAudio2;
    case "model": return Box;
    case "code": return FileCode2;
    case "archive": return FileArchive;
    case "design": case "website": case "product": return Palette;
    case "presentation": return Presentation;
    case "spreadsheet": return Table2;
    case "note": return StickyNote;
    case "folder": return Folder;
    default: return FileText;
  }
}

export function ArtifactsSurface({
  artifacts,
  title = "Library",
  initialSource = "all",
  initialView = "all",
  onOpenArtifact,
  onRefresh,
  emptyMessage = "No saved work is registered yet.",
}: {
  artifacts: WorkArtifact[];
  title?: string;
  heading?: string;
  initialSource?: WorkArtifact["source"] | "all";
  initialView?: "all" | "recent" | "starred" | "shared" | "trash";
  emptyMessage?: string;
  onOpenArtifact?: (artifact: WorkArtifact) => void | Promise<void>;
  onRefresh?: () => void | Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [layout, setLayout] = useState<"grid" | "list" | "masonry">("grid");
  const [source, setSource] = useState<WorkArtifact["source"] | "all">(initialSource);
  const [kind, setKind] = useState<WorkArtifact["kind"] | "all">("all");
  const [view, setView] = useState(initialView);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [mutating, setMutating] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => setView(initialView), [initialView]);
  useEffect(() => setSource(initialSource), [initialSource]);
  const sources = useMemo(
    () => [...new Set(artifacts.map(item => item.source))].sort(),
    [artifacts],
  );
  const kinds = useMemo(
    () => [...new Set(artifacts.map(item => item.kind))].sort(),
    [artifacts],
  );
  const visible = useMemo(
    () => artifacts.filter(item =>
      item.name.toLowerCase().includes(query.toLowerCase()) &&
      (source === "all" || item.source === source) &&
      (kind === "all" || item.kind === kind) &&
      (view === "trash" ? item.deleted : !item.deleted) &&
      (view !== "starred" || item.starred === true) &&
      (view !== "shared" || item.shared === true)
    ).sort((a,b) => (b.updatedAt || 0)-(a.updatedAt || 0)),
    [artifacts,query,source,kind,view],
  );
  const assetMutation = async (artifact: WorkArtifact, patch: {name?: string; starred?: boolean; archived?: boolean}) => {
    if (artifact.resourceType !== "artifact" || !artifact.providerId) return;
    setMutating(artifact.id);
    setError("");
    try {
      const response = await fetch("/api/work/library/artifacts/"+encodeURIComponent(artifact.providerId),{
        method:"PATCH",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify(patch),
      });
      if (!response.ok) throw new Error("We couldn't save that change. Please try again.");
      await onRefresh?.();
      setRenaming(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "We couldn't finish that. Please try again.");
    } finally {setMutating(null);}
  };
  const openArtifact = (artifact: WorkArtifact) => {
    if (artifact.open) {window.open(artifact.open,"_blank","noopener,noreferrer");return;}
    if (artifact.source === "local" && onOpenArtifact) {void onOpenArtifact(artifact);return;}
    if (artifact.preview) window.open(artifact.preview,"_blank","noopener,noreferrer");
  };

  const buttons: Array<{id:string;label:string;filter: WorkArtifact["kind"]|"all";view:"all"|"starred"}> = [
    {id:"all",label:"All",filter:"all",view:"all"},
    {id:"starred",label:"Favorites",filter:"all",view:"starred"},
    {id:"folders",label:"Folders",filter:"folder",view:"all"},
    {id:"images",label:"Images",filter:"image",view:"all"},
  ];

  return <div className="agentsam-work-artifacts agentsam-library">
    <div className="agentsam-work-artifacts__content">
      <div className="agentsam-work-artifacts__heading">
        <div><h1>{title}</h1><p className="agentsam-library__description">Everything you create, save, and bring into your workspace.</p></div>
        <div className="agentsam-work-artifacts__spacer"/>
        <div className="agentsam-library__layout" role="group" aria-label="Library layout">
          {([
            {id:"masonry",icon:Columns3,label:"Masonry view"},
            {id:"grid",icon:Grid2X2,label:"Grid view"},
            {id:"list",icon:List,label:"List view"},
          ] as const).map(option=><button key={option.id} type="button" data-active={layout===option.id}
            aria-pressed={layout===option.id} aria-label={option.label} title={option.label}
            onClick={()=>setLayout(option.id)}><option.icon size={15}/></button>)}
        </div>
      </div>
      <div className="agentsam-library__toolbar">
        <div className="agentsam-library__search"><WorkSearch value={query} onChange={setQuery} placeholder="Search saved work"/></div>
        <div className="agentsam-library__quickfilters" role="group" aria-label="Quick filters">
          {buttons.map(button=><button type="button" key={button.id}
            data-active={view===button.view && kind===button.filter && source==="all"}
            onClick={()=>{setView(button.view);setKind(button.filter);setSource("all");}}>
            {button.label}
          </button>)}
        </div>
      </div>
      <div className="agentsam-work-artifacts__filters">
        <label className="agentsam-library__select">Type <select aria-label="Filter by type"
          value={kind} onChange={event=>setKind(event.target.value as WorkArtifact["kind"]|"all")}>
          <option value="all">All types</option>
          {kinds.map(value=><option key={value} value={value}>{value.charAt(0).toUpperCase()+value.slice(1)}</option>)}
        </select></label>
        <label className="agentsam-library__select">Source <select aria-label="Filter by source"
          value={source} onChange={event=>setSource(event.target.value as WorkArtifact["source"]|"all")}>
          <option value="all">All sources</option>
          {sources.map(value=><option key={value} value={value}>{sourceLabels[value]}</option>)}
        </select></label>
        <div className="agentsam-work-artifacts__spacer"/>
        <span className="agentsam-work-artifacts__muted">{visible.length} {visible.length===1?"item":"items"}</span>
        {view==="trash"?<button type="button" className="agentsam-library__quiet-button" onClick={()=>setView("all")}>Back to Library</button>:null}
      </div>
      {error?<div role="alert" className="agentsam-library__error"><span>{error}</span><button type="button" onClick={()=>setError("")}>Dismiss</button></div>:null}
      {!visible.length?<div className="agentsam-library__empty">
        <Folder size={23} strokeWidth={1.3}/><strong>{query ? "No matching saved work" : view==="trash" ? "Trash is empty" : "Nothing in this view"}</strong>
        <span>{query ? "Try another search or filter." : artifacts.length ? "Change the filters to see your other resources." : emptyMessage}</span>
      </div>:null}
      <div className={"agentsam-work-artifacts__items is-"+layout}>
        {visible.map(artifact=>{
          const Icon=iconFor(artifact.kind);
          const ownerEditable=artifact.resourceType==="artifact" && Boolean(artifact.providerId);
          const hasDestination=Boolean(artifact.open || artifact.preview || (artifact.source==="local" && onOpenArtifact));
          const isRenaming=renaming===artifact.id;
          const isBusy=mutating===artifact.id;
          const visual=Boolean(artifact.preview && (artifact.kind==="image" || artifact.kind==="video" || artifact.mime==="application/pdf"));
          return <article key={artifact.id} className="agentsam-work-artifacts__item"
              data-kind={artifact.kind} data-preview={visual?"image":"symbol"} data-busy={isBusy||undefined}>
            {layout!=="list"?<div className="agentsam-work-artifacts__preview" aria-label={artifact.kind+" preview"}>
              {visual && artifact.preview ? (
                artifact.mime==="application/pdf"
                  ? <iframe title={artifact.name+" preview"} src={artifact.preview+"#toolbar=0&navpanes=0"} loading="lazy" tabIndex={-1}/>
                  : <img src={artifact.preview} alt="" loading="lazy" decoding="async"/>
              ) : <div className="agentsam-library__symbol">
                <div className="agentsam-library__symbol-icon"><Icon size={34} strokeWidth={1.35}/></div>
                <span>{artifact.kind==="design"?"Design":artifact.kind==="model"?"3D model":artifact.kind==="note"?"Note":artifact.kind==="spreadsheet"?"Spreadsheet":artifact.kind==="presentation"?"Presentation":artifact.kind==="folder"?"Folder":artifact.kind==="document"?"Document":artifact.kind==="code"?"Code":artifact.kind==="archive"?"Archive":artifact.kind.charAt(0).toUpperCase()+artifact.kind.slice(1)}</span>
              </div>}
            </div>:null}
            <div className="agentsam-library__item-footer">
              <Icon size={16} className="agentsam-library__type-icon" strokeWidth={1.5}/>
              <div className="agentsam-library__item-details">
                {isRenaming?<form className="agentsam-library__rename" onSubmit={event=>{
                  event.preventDefault();
                  if(newName.trim())void assetMutation(artifact,{name:newName.trim()});
                }}>
                  <input autoFocus aria-label="Rename artifact" value={newName} maxLength={160}
                    onChange={event=>setNewName(event.target.value)} onKeyDown={event=>{if(event.key==="Escape")setRenaming(null);}}/>
                  <button type="submit" disabled={!newName.trim()||isBusy}>Save</button>
                </form>:<button type="button" title={artifact.name} className="agentsam-library__item-name"
                  disabled={!hasDestination} onClick={()=>openArtifact(artifact)}>{artifact.name}</button>}
                <div className="agentsam-library__item-meta">{artifact.sourceLabel||sourceLabels[artifact.source]}
                  {artifact.updatedLabel?" · "+artifact.updatedLabel:""}{artifact.sizeLabel?" · "+artifact.sizeLabel:""}
                </div>
              </div>
              {artifact.starred?<Star className="agentsam-library__star" size={13} fill="currentColor"/>:null}
              {hasDestination||ownerEditable?<details className="agentsam-library__menu">
                <summary aria-label={artifact.name+" options"}><MoreHorizontal size={17}/></summary>
                <div className="agentsam-library__menu-content">
                  {hasDestination?<button type="button" onClick={event=>{openArtifact(artifact);event.currentTarget.closest("details")?.removeAttribute("open");}}>
                    <ExternalLink size={14}/> Open
                  </button>:null}
                  {artifact.open?<button type="button" onClick={event=>{
                    void navigator.clipboard.writeText(new URL(artifact.open!,window.location.href).href);
                    event.currentTarget.closest("details")?.removeAttribute("open");
                  }}><Copy size={14}/> Copy link</button>:null}
                  {ownerEditable?<><button type="button" disabled={isBusy} onClick={()=>{setRenaming(artifact.id);setNewName(artifact.name);}}>
                    <Pencil size={14}/> Rename
                  </button><button type="button" disabled={isBusy} onClick={()=>void assetMutation(artifact,{starred:!artifact.starred})}>
                    <Star size={14}/> {artifact.starred?"Remove favorite":"Favorite"}
                  </button><button type="button" disabled={isBusy} onClick={()=>void assetMutation(artifact,{archived:!artifact.deleted})}>
                    {artifact.deleted?<RotateCcw size={14}/>:<Archive size={14}/>}
                    {artifact.deleted?"Restore":"Move to trash"}
                  </button></>:null}
                </div>
              </details>:null}
            </div>
          </article>;
        })}
      </div>
    </div>
  </div>;
}
