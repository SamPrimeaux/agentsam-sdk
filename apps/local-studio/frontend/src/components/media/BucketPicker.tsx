import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Database, Search, Star } from "lucide-react";
import { formatCount, type R2Bucket } from "./media-utils";

const PIN_KEY = "agentsam.media.pinnedBuckets";

export function loadPinnedBuckets(): string[] {
  try {
    const raw = window.localStorage.getItem(PIN_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function savePinnedBuckets(names: string[]) {
  try {
    window.localStorage.setItem(PIN_KEY, JSON.stringify(names));
  } catch {
    /* storage unavailable — pins last for this session only */
  }
}

/**
 * One control for any number of R2 buckets: searchable, with pinned favourites on top.
 * Replaces the row-of-pills navigation, which could not scale past a few dozen buckets.
 */
export function BucketPicker({
  buckets,
  active,
  pinned,
  onPick,
  onTogglePin,
}: {
  buckets: R2Bucket[];
  active: string | null;
  pinned: string[];
  onPick: (name: string) => void;
  onTogglePin: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const q = query.trim().toLowerCase();
  const matches = useMemo(
    () => buckets.filter((b) => !q || b.name.toLowerCase().includes(q)),
    [buckets, q],
  );
  const pinnedSet = useMemo(() => new Set(pinned), [pinned]);
  const pinnedMatches = matches.filter((b) => pinnedSet.has(b.name));
  const restMatches = matches.filter((b) => !pinnedSet.has(b.name));

  const row = (bucket: R2Bucket) => (
    <li key={bucket.name} className="agentsam-media-picker__row">
      <button
        type="button"
        className={`agentsam-media-picker__pick${active === bucket.name ? " is-active" : ""}`}
        onClick={() => {
          onPick(bucket.name);
          setOpen(false);
          setQuery("");
        }}
      >
        <Database size={14} aria-hidden="true" />
        <span>{bucket.name}</span>
        {active === bucket.name ? <Check size={14} aria-hidden="true" /> : null}
      </button>
      <button
        type="button"
        className={`agentsam-media-picker__pin${pinnedSet.has(bucket.name) ? " is-pinned" : ""}`}
        onClick={() => onTogglePin(bucket.name)}
        aria-label={pinnedSet.has(bucket.name) ? `Unpin ${bucket.name}` : `Pin ${bucket.name}`}
        aria-pressed={pinnedSet.has(bucket.name)}
      >
        <Star size={14} />
      </button>
    </li>
  );

  return (
    <div className="agentsam-media-picker" ref={rootRef}>
      <button
        type="button"
        className="agentsam-media-select"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Database size={14} aria-hidden="true" />
        <span>{active || "Choose a bucket"}</span>
        <small>{formatCount(buckets.length) ?? "0"}</small>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open ? (
        <div className="agentsam-media-picker__panel" role="dialog" aria-label="R2 buckets">
          <label className="agentsam-media-picker__search">
            <Search size={14} aria-hidden="true" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${formatCount(buckets.length) ?? ""} buckets`}
              aria-label="Search buckets"
            />
          </label>
          <ul className="agentsam-media-picker__list" role="listbox">
            {pinnedMatches.length ? <li className="agentsam-media-picker__group">Pinned</li> : null}
            {pinnedMatches.map(row)}
            {restMatches.length ? <li className="agentsam-media-picker__group">{pinnedMatches.length ? "All buckets" : "Buckets"}</li> : null}
            {restMatches.map(row)}
            {!matches.length ? <li className="agentsam-media-picker__empty">No bucket matches “{query}”.</li> : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
