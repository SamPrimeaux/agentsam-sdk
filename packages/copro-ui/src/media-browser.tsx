import { IconAction } from "./icon-action.js";
import React, { useEffect, useId, useMemo, useState } from "react";
import {
  ArrowLeft,
  AudioLines,
  Clock3,
  Film,
  Image as ImageIcon,
  Search,
  Sparkles,
  UploadCloud,
  Pause,
  Play,
  Pencil,
  Trash2,
} from "lucide-react";
import type { CoProMotionSampler, CoProCreativeAsset, CoProTransitionPreviewFactory } from "./creative-types.js";
import type { CoProMediaShelfItem } from "./tool-sheet.js";
import { CoProAssetPreview } from "./asset-preview.js";
import { CoProSystemIcon, type CoProSystemIconMap } from "./system-icon.js";

export type CoProMediaBrowserSection = "import" | "media" | "subprojects" | "yours" | "generate" | "spaces" | "library";

type CreativeCategory = "all" | CoProCreativeAsset["category"];

type CoProMediaBrowserProps = {
  section: CoProMediaBrowserSection;
  initialCategory?:CreativeCategory;
  currentAssetId?:string;
  createTransitionPreview?:CoProTransitionPreviewFactory;
  renderCreativePreview?:(id:string,timeUs:number)=>string|null;
  sampleMotion?:CoProMotionSampler;
  mediaItems: CoProMediaShelfItem[];
  projectMediaIds: ReadonlySet<string>;
  creativeAssets: CoProCreativeAsset[];
  selectedClipId?: string | null;
  previewMediaPair?: { before?:string; after?:string };
  onImportFiles: (files: File[]) => void;
  onAddMedia: (id: string) => void;
  onUseCreativeAsset: (asset: CoProCreativeAsset) => void;
  onOpenCreativeTemplate?: (id: string) => void;
  onRenameMedia?: (id:string,name:string) => void;
  onDeleteMedia?: (id:string) => void;
  onNavigate?: (section: CoProMediaBrowserSection) => void;
  systemIcons?: CoProSystemIconMap;
};

const CATEGORY_OPTIONS: { id: CreativeCategory; label: string }[] = [
  { id: "all", label: "All assets" },
  { id: "template", label: "Compositions" },
  { id: "animation", label: "Motion" },
  { id: "transition", label: "Transitions" },
  { id: "overlay", label: "Overlays" },
  { id: "treatment", label: "Looks" },
  { id: "graphic", label: "Graphics" },
];

const CATEGORY_LABEL: Record<CoProCreativeAsset["category"], string> = {
  template: "Composition",
  animation: "Motion",
  transition: "Transition",
  overlay: "Overlay",
  treatment: "Look",
  graphic: "Graphic",
};

function formatDuration(durationUs?: number) {
  if (!durationUs || durationUs <= 0) return null;
  return (durationUs / 1_000_000).toFixed(1) + "s";
}

function MediaKindIcon({ kind, systemIcons }: { kind: CoProMediaShelfItem["kind"]; systemIcons?: CoProSystemIconMap }) {
  const name = kind === "audio" ? "audio" : kind === "image" ? "camera" : "film";
  const fallback = kind === "audio"
    ? <AudioLines size={19} aria-hidden="true" />
    : kind === "image"
      ? <ImageIcon size={19} aria-hidden="true" />
      : <Film size={19} aria-hidden="true" />;
  return <CoProSystemIcon name={name} icons={systemIcons} size={19} fallback={fallback} />;
}

function MediaPreview({ item, systemIcons }: { item: CoProMediaShelfItem; systemIcons?: CoProSystemIconMap }) {
  const thumbnail = item.thumbnails?.[0];
  if (item.kind === "image") {
    return <img src={item.url} alt="" loading="lazy" />;
  }
  if (item.kind === "video" && thumbnail) {
    return <img src={thumbnail} alt="" loading="lazy" />;
  }
  return <MediaKindIcon kind={item.kind} systemIcons={systemIcons} />;
}

function CreativePreview({ asset, large = false, systemIcons }: { asset: CoProCreativeAsset; large?: boolean; systemIcons?: CoProSystemIconMap }) {
  return (
    <span className={large ? "mm-creative-preview mm-creative-preview-large" : "mm-creative-preview"}>
      {asset.previewUrl ? (
        <img src={asset.previewUrl} alt={asset.name + " preview"} loading="lazy" />
      ) : (
        <span className="mm-creative-preview-fallback" aria-hidden="true">
          <CoProSystemIcon
            name={asset.category === "template" ? "film" : asset.category === "animation" ? "workflow" : asset.category === "transition" || asset.category === "overlay" ? "layers" : asset.category === "treatment" ? "adjust" : "document"}
            icons={systemIcons}
            size={large ? 34 : 23}
            fallback={<Sparkles size={large ? 34 : 23} />}
          />
          <small>{CATEGORY_LABEL[asset.category]}</small>
        </span>
      )}
    </span>
  );
}

export function CoProMediaBrowser({
  section,
  initialCategory="all", currentAssetId, renderCreativePreview, sampleMotion, createTransitionPreview,
  mediaItems,
  projectMediaIds,
  creativeAssets,
  selectedClipId,
  previewMediaPair,
  onImportFiles,
  onAddMedia,
  onUseCreativeAsset,
  onOpenCreativeTemplate,
  onRenameMedia,
  onDeleteMedia,
  onNavigate,
  systemIcons,
}: CoProMediaBrowserProps) {
  const uploadId = useId();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CreativeCategory>(initialCategory);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [hoverAssetId,setHoverAssetId]=useState<string|null>(null);
  const [dragging, setDragging] = useState(false);
  const [lastAppliedAssetId, setLastAppliedAssetId] = useState<string | null>(null);
  const [previewPlaying,setPreviewPlaying] = useState(true);
  useEffect(()=>{
    if(!selectedAssetId)return;
    setPreviewPlaying(true);
    const timer=window.setTimeout(()=>setPreviewPlaying(false),Math.max(1000,creativeAssets.find(asset=>asset.id===selectedAssetId)?.durationUs??2800000)/1000);
    return()=>window.clearTimeout(timer);
  },[selectedAssetId]);

  const normalizedQuery = query.trim().toLowerCase();
  const projectMedia = useMemo(
    () => mediaItems.filter((item) => projectMediaIds.has(item.id)),
    [mediaItems, projectMediaIds],
  );
  const visibleMedia = useMemo(() => {
    const source = section === "yours" ? mediaItems : projectMedia;
    if (!normalizedQuery) return source;
    return source.filter((item) => item.name.toLowerCase().includes(normalizedQuery));
  }, [mediaItems, normalizedQuery, projectMedia, section]);

  const visibleCreativeAssets = useMemo(
    () =>
      creativeAssets.filter((asset) => {
        if (category !== "all" && asset.category !== category) return false;
        if (!normalizedQuery) return true;
        return (asset.name + " " + (asset.group ?? "") + " " + (asset.source ?? "") + " " + (asset.description ?? ""))
          .toLowerCase()
          .includes(normalizedQuery);
      }),
    [category, creativeAssets, normalizedQuery],
  );
  const selectedAsset = selectedAssetId
    ? creativeAssets.find((asset) => asset.id === selectedAssetId) ?? null
    : null;

  function renameMedia(item:CoProMediaShelfItem) {
    const next=window.prompt("Rename media",item.name)?.trim();
    if(next&&next!==item.name)onRenameMedia?.(item.id,next);
  }

  function deleteMedia(item:CoProMediaShelfItem) {
    const message="Delete the original file " + String.fromCharCode(8220) + item.name + String.fromCharCode(8221) + " from Your media? Projects using it will need the source relinked.";
    if(window.confirm(message))onDeleteMedia?.(item.id);
  }

  function importFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList).filter((file) =>
      file.type.startsWith("video/") ||
      file.type.startsWith("audio/") ||
      file.type.startsWith("image/"),
    );
    if (files.length) onImportFiles(files);
  }

  function applyCreativeAsset(asset: CoProCreativeAsset) {
    if (asset.category === "template") {
      onOpenCreativeTemplate?.(asset.id);
      return;
    }
    if (!selectedClipId) return;
    onUseCreativeAsset(asset);
    setLastAppliedAssetId(asset.id);
  }

  if (section === "import") {
    return (
      <section className="mm-media-browser-content" aria-label="Import media">
        <header className="mm-media-browser-heading">
          <div>
            <span className="mm-media-browser-eyebrow">ADD TO PROJECT</span>
            <h3>Import media</h3>
            <p>Add footage, images and sound to your project.</p>
          </div>
          <span className="mm-media-browser-count">MULTI-FILE</span>
        </header>
        <div
          className={"mm-import-dropzone" + (dragging ? " is-dragging" : "")}
          onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            importFiles(event.dataTransfer.files);
          }}
        >
          <input
            id={uploadId}
            className="mm-import-input"
            type="file"
            accept="video/*,audio/*,image/*"
            multiple
            onChange={(event) => {
              if (event.currentTarget.files) importFiles(event.currentTarget.files);
              event.currentTarget.value = "";
            }}
          />
          <label htmlFor={uploadId} className="mm-import-dropzone-label">
            <span className="mm-import-icon"><CoProSystemIcon name="attachment" icons={systemIcons} size={27} fallback={<UploadCloud size={27} />} /></span>
            <strong>Drop files here or browse</strong>
            <span>Video · Audio · Images</span>
            <span className="mm-import-button">Choose files</span>
          </label>
        </div>

      </section>
    );
  }

  if (section === "subprojects" || section === "generate" || section === "spaces") {
    const panels = {
      subprojects: {
        eyebrow: "PROJECT STRUCTURE",
        title: "Compound clips",
        status: "ENGINE INTEGRATION",
        description: "Organize related clips into reusable sequences.",
        action: "Browse project media",
        icon: "layers",
      },
      generate: {
        eyebrow: "ASSISTED CREATION",
        title: "Media generation",
        status: "PROVIDER CONNECTION",
        description: "Choose a connected provider to generate new media.",
        action: "Use imported media",
        icon: "agent",
      },
      spaces: {
        eyebrow: "CONNECTED STORAGE",
        title: "Connected spaces",
        status: "STORAGE CONNECTION",
        description: "Choose a connected space to browse its media.",
        action: "Browse available media",
        icon: "cloud",
      },
    } as const;
    const panel = panels[section];
    return (
      <section className="mm-media-browser-content mm-media-wip-panel" aria-label={panel.title}>
        <header className="mm-media-browser-heading">
          <div>
            <span className="mm-media-browser-eyebrow">{panel.eyebrow}</span>
            <h3>{panel.title}</h3>
            <p>Choose media and settings for this project.</p>
          </div>
          <span className="mm-media-browser-count">WIP</span>
        </header>
        <div className="mm-media-wip-card">
          <span className="mm-media-wip-icon" aria-hidden="true"><CoProSystemIcon name={panel.icon} icons={systemIcons} size={29} fallback={<Sparkles size={29}/>} /></span>
          <span className="mm-media-wip-status">{panel.status}</span>
          <h4>{panel.title}</h4>
          <p>{panel.description}</p>
          <button type="button" onClick={() => onNavigate?.("media")}>{panel.action}</button>
        </div>
      </section>
    );
  }

  if (section === "media" || section === "yours") {
    const inProject = section === "media";
    return (
      <section className="mm-media-browser-content" aria-label={inProject ? "Project media" : "Your media"}>
        <header className="mm-media-browser-heading">
          <div>
            <span className="mm-media-browser-eyebrow">{inProject ? "CURRENT EDIT" : "DEVICE LIBRARY"}</span>
            <h3>{inProject ? "Media in this project" : "Your media"}</h3>
            <p>
              {inProject
                ? "Source files already referenced by the current timeline."
                : "Imported originals available on this device, ready to reuse."}
            </p>
          </div>
          <span className="mm-media-browser-count">{visibleMedia.length} {visibleMedia.length === 1 ? "FILE" : "FILES"}</span>
        </header>
        <label className="mm-media-search">
          <CoProSystemIcon name="search" icons={systemIcons} size={16} fallback={<Search size={16} aria-hidden="true" />} />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Find media by filename"
            aria-label="Search media"
          />
        </label>
        {visibleMedia.length ? (
          <div className="mm-media-card-grid">
            {visibleMedia.map((item) => (
              <article className="mm-media-card" key={item.id}>
                <div className="mm-media-card-preview">
                  <MediaPreview item={item} systemIcons={systemIcons} />
                  {formatDuration(item.durationUs) && <span className="mm-media-duration">{formatDuration(item.durationUs)}</span>}
                </div>
                <div className="mm-media-card-copy">
                  <strong title={item.name}>{item.name}</strong>
                  <span>{item.kind === "audio" ? "Audio" : item.kind === "image" ? "Image" : "Video"}</span>
                </div>
                <div className="mm-media-card-actions">
                  <button type="button" className="mm-media-add-action" onClick={() => onAddMedia(item.id)}>
                    Add to timeline
                  </button>
                  {!inProject&&<IconAction type="button" className="mm-media-icon-action" aria-label={"Rename "+item.name} title="Rename media" onClick={()=>renameMedia(item)}><Pencil size={14}/></IconAction>}
                  {!inProject&&<IconAction type="button" className="mm-media-icon-action is-danger" aria-label={"Delete "+item.name} title="Delete original media" onClick={()=>deleteMedia(item)}><Trash2 size={14}/></IconAction>}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="mm-media-empty-state">
            <span><MediaKindIcon kind="video" systemIcons={systemIcons} /></span>
            <strong>{inProject ? "No media in this edit yet" : "Your device library is empty"}</strong>
            <p>
              {inProject
                ? "Import a source file or add one from Your media to start building this timeline."
                : "Use Import to bring in source footage, images or audio. Your imports will appear here."}
            </p>
          </div>
        )}
      </section>
    );
  }

  const totalCount = creativeAssets.length;
  const selectedCategoryLabel = selectedAsset ? CATEGORY_LABEL[selectedAsset.category] : "Creative asset";

  return (
    <section className="mm-media-browser-content mm-creative-library" aria-label="Creative library">
      <header className="mm-media-browser-heading">
        <div>
          <span className="mm-media-browser-eyebrow">COPRO CREATIVE LIBRARY</span>
          <h3>Creative assets</h3>
          <p>Reusable compositions, motion, transitions, overlays, looks and graphics.</p>
        </div>
        <span className="mm-media-browser-count">{totalCount} ASSETS</span>
      </header>
      <label className="mm-media-search">
        <CoProSystemIcon name="search" icons={systemIcons} size={16} fallback={<Search size={16} aria-hidden="true" />} />
        <input
          type="search"
          value={query}
          onChange={(event) => { setQuery(event.currentTarget.value); setSelectedAssetId(null); }}
          placeholder="Search the creative library"
          aria-label="Search creative assets"
        />
      </label>
      <div className="mm-creative-category-list" role="tablist" aria-label="Creative asset categories">
        {CATEGORY_OPTIONS.map((option) => {
          const count = option.id === "all"
            ? totalCount
            : creativeAssets.filter((asset) => asset.category === option.id).length;
          return (
            <button
              key={option.id}
              type="button"
              role="tab"
              aria-selected={category === option.id}
              className={category === option.id ? "is-active" : ""}
              onClick={() => { setCategory(option.id); setSelectedAssetId(null); }}
            >
              <CoProSystemIcon
                name={option.id === "all" ? "layers" : option.id === "template" ? "film" : option.id === "animation" ? "workflow" : option.id === "transition" || option.id === "overlay" ? "layers" : option.id === "treatment" ? "adjust" : "document"}
                icons={systemIcons}
                size={13}
                fallback={<Sparkles size={13}/>}
              />
              {option.label}<span>{count}</span>
            </button>
          );
        })}
      </div>
      {selectedAsset ? (
        <div className="mm-creative-detail">
          <button type="button" className="mm-creative-back" onClick={() => setSelectedAssetId(null)}>
            <CoProSystemIcon name="back" icons={systemIcons} size={15} fallback={<ArrowLeft size={15} />} /> Back to library
          </button>
          <div className="mm-creative-detail-layout">
            <div className={"mm-creative-preview-player"+(previewPlaying?" is-playing":"")}>
              <CoProAssetPreview asset={selectedAsset} playing={previewPlaying} renderCreativePreview={renderCreativePreview} sampleMotion={sampleMotion} createTransitionPreview={createTransitionPreview}
                before={previewMediaPair?.before??creativeAssets.find(asset=>asset.category==="template")?.previewUrl}
                after={previewMediaPair?.after??creativeAssets.filter(asset=>asset.category==="template")[1]?.previewUrl}/>
              <button type="button" className="mm-creative-preview-play" aria-label={previewPlaying?"Pause asset preview":"Play asset preview"} onClick={()=>setPreviewPlaying(value=>!value)}>{previewPlaying?<Pause size={16}/>:<Play size={16}/>}</button>
              <div className="mm-creative-preview-progress"><i/></div>
              <span className="mm-creative-preview-caption">{selectedAsset.category==="transition"?"Transition demonstration":selectedAsset.category==="animation"?"Motion demonstration":"Asset preview"} · {previewPlaying?"Playing":"Paused"}</span>
            </div>
            <div className="mm-creative-detail-copy">
              <span className="mm-media-browser-eyebrow">{selectedCategoryLabel.toUpperCase()}</span>
              <h4>{selectedAsset.name}</h4>
              <p>{selectedAsset.description || "Reusable " + selectedCategoryLabel.toLowerCase() + " from the CoPro creative catalog."}</p>

              <div className="mm-creative-metadata">
                {formatDuration(selectedAsset.durationUs) && <span><CoProSystemIcon name="time" icons={systemIcons} size={13} fallback={<Clock3 size={13} />} /> {formatDuration(selectedAsset.durationUs)}</span>}
                {selectedAsset.aspectRatio && <span>{selectedAsset.aspectRatio}</span>}
                {selectedAsset.group && <span>{selectedAsset.group}</span>}
              </div>
              {selectedAsset.category === "template" ? (
                <>
                  <button
                    type="button"
                    className="mm-creative-use"
                    onClick={() => onOpenCreativeTemplate?.(selectedAsset.id)}
                    disabled={!onOpenCreativeTemplate}
                  >
                    Apply to current project
                  </button>
                  <p className="mm-creative-selection-hint">Adds editable composition layers. Undo to revert.</p>
                  <dl className="mm-creative-metadata"><dt>Included</dt><dd>Animated composition · editable text · accent color · timed layers</dd></dl>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="mm-creative-use"
                    onClick={() => applyCreativeAsset(selectedAsset)}
                    disabled={!selectedClipId}
                  >
                    {lastAppliedAssetId === selectedAsset.id ? "Applied to selected clip" : "Apply to selected clip"}
                  </button>
                  {!selectedClipId && <p className="mm-creative-selection-hint">Select a clip on the timeline to apply this asset.</p>}
                  {lastAppliedAssetId === selectedAsset.id && <span className="mm-creative-applied" role="status">Added to the current edit.</span>}
                </>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="mm-creative-library-grid">
          {visibleCreativeAssets.map((asset) => (
            <button
              type="button"
              className={"mm-creative-library-card"+(currentAssetId===asset.id?" is-active":"")}
              key={asset.id}
              onMouseEnter={()=>setHoverAssetId(asset.id)}
              onMouseLeave={()=>setHoverAssetId(null)}
              onFocus={()=>setHoverAssetId(asset.id)}
              onBlur={()=>setHoverAssetId(null)}
              aria-pressed={currentAssetId===asset.id}
              onClick={() => setSelectedAssetId(asset.id)}
              aria-label={"Preview " + asset.name}
            >
              {hoverAssetId===asset.id?<CoProAssetPreview asset={asset} playing renderCreativePreview={renderCreativePreview} sampleMotion={sampleMotion} createTransitionPreview={createTransitionPreview}
                before={previewMediaPair?.before??creativeAssets.find(item=>item.category==="template")?.previewUrl}
                after={previewMediaPair?.after??creativeAssets.filter(item=>item.category==="template")[1]?.previewUrl}/>:<CreativePreview asset={asset} systemIcons={systemIcons} />}
              <span className="mm-creative-library-card-copy">
                <strong>{asset.name}</strong>
                <small>{CATEGORY_LABEL[asset.category]}{formatDuration(asset.durationUs) ? " · " + formatDuration(asset.durationUs) : ""}</small>
              </span>
            </button>
          ))}
          {!visibleCreativeAssets.length && (
            <div className="mm-media-empty-state mm-library-no-results">
              <span><Search size={19} /></span>
              <strong>No matching creative assets</strong>
              <p>Try another search or choose a different category.</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
