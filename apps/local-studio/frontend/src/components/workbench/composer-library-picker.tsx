import { useEffect, useMemo, useState } from 'react';
import "./composer-library.css";
import { Box, Check, FileText, Film, FolderOpen, Image as ImageIcon, Paperclip, Search, X } from 'lucide-react';
import { classifyAsset, formatBytes, guessMime, previewUrl, providerLabel, providerOf, type MediaAsset, type MediaKind } from '@/components/media/media-utils';
import { acceptsChatFile, MAX_CHAT_FILE_BYTES, MAX_CHAT_IMAGE_BYTES } from '@/lib/content/chat-images';
import { IconAction } from '@/components/ui/icon-action';

type LibraryFilter = 'all' | 'image' | 'video' | 'model' | 'file';
const FILTERS: Array<{ id: LibraryFilter; label: string }> = [
  { id: 'all', label: 'All files' },
  { id: 'image', label: 'Images' },
  { id: 'video', label: 'Videos' },
  { id: 'model', label: '3D & CAD' },
  { id: 'file', label: 'Documents' },
];
const SOURCES = ['cf_images', 'stream', 'r2'] as const;
type LibrarySource = typeof SOURCES[number];
type InitialSourceResult = { source: LibrarySource; assets: MediaAsset[]; hasMore: boolean; cursor: string | null };
const MAX_SELECTED = 20;

function mimeFor(asset: MediaAsset): string {
  return String(asset.mime_type || asset.content_type || guessMime(asset.filename || '')).toLowerCase();
}

function canAttach(asset: MediaAsset): boolean {
  const mime = mimeFor(asset);
  const size = Number(asset.size_bytes || 0);
  if (['image/png', 'image/jpeg', 'image/webp'].includes(mime)) {
    return !size || size <= MAX_CHAT_IMAGE_BYTES;
  }
  return acceptsChatFile(asset.filename || '', mime) && (!size || size <= MAX_CHAT_FILE_BYTES);
}

function kindLabel(kind: MediaKind): string {
  if (kind === 'image') return 'Image';
  if (kind === 'video') return 'Video';
  if (kind === 'model') return '3D / CAD';
  return 'File';
}

function AssetGlyph({ kind }: { kind: MediaKind }) {
  if (kind === 'image') return <ImageIcon size={25} aria-hidden="true" />;
  if (kind === 'video') return <Film size={25} aria-hidden="true" />;
  if (kind === 'model') return <Box size={25} aria-hidden="true" />;
  return <FileText size={25} aria-hidden="true" />;
}

/** Select owner-authorized library assets; download original bytes before staging conversation attachments. */
export function ComposerLibraryPicker({ open, onClose, onAttach }: {
  open: boolean; onClose: () => void; onAttach: (files: File[]) => Promise<void>;
}) {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<LibraryFilter>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sourcePages, setSourcePages] = useState<Record<string, { page: number; hasMore: boolean; cursor?: string | null }>>({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setNotice('');
    setSelectedIds(new Set());
    setSourcePages({});
    void Promise.allSettled(SOURCES.map(async source => {
      const response = await fetch(`/api/admin/media?source=${source}&provider=cloudflare&page=1&per_page=100`, {
        signal: controller.signal,
        credentials: 'same-origin',
        headers: { accept: 'application/json' },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(body.message || body.error || `Library ${source} unavailable (HTTP ${response.status})`));
      const rows: MediaAsset[] = Array.isArray(body.assets) ? body.assets : Array.isArray(body.images) ? body.images : Array.isArray(body.data) ? body.data : [];
      return {
        source,
        assets: rows.filter(asset => Boolean(asset.delivery_url || asset.url) && canAttach(asset)),
        hasMore: Boolean(body?.pagination?.has_next || (body?.truncated && body?.cursor)),
        cursor: typeof body?.pagination?.cursor === 'string' ? body.pagination.cursor : typeof body?.cursor === 'string' ? body.cursor : null,
      } satisfies InitialSourceResult;
    })).then(results => {
      if (controller.signal.aborted) return;
      const successful = results.filter((result): result is PromiseFulfilledResult<InitialSourceResult> => result.status === 'fulfilled');
      const found = successful.flatMap(result => result.value.assets);
      const seen = new Set<string>();
      setAssets(found.filter(asset => {
        if (seen.has(asset.id)) return false;
        seen.add(asset.id);
        return true;
      }));
      setSourcePages(Object.fromEntries(successful.map(result => [result.value.source, {
        page: 1, hasMore: result.value.hasMore, cursor: result.value.cursor,
      }])));
      const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
      if (!successful.length) {
        setError(failures.map(result => String(result.reason)).join(' · ') || 'Library unavailable');
      } else if (failures.length) {
        setNotice(`${failures.length} library source(s) could not be reached. Available sources are still shown.`);
      }
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [open]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return assets.filter(asset => {
      const kind = classifyAsset(asset);
      const matchesKind = filter === 'all' || kind === filter;
      const matchesQuery = !needle || [
        asset.filename,
        providerLabel(providerOf(asset)),
        asset.r2_bucket || '',
      ].join(' ').toLowerCase().includes(needle);
      return matchesKind && matchesQuery;
    });
  }, [assets, filter, query]);

  const selectedAssets = useMemo(
    () => assets.filter(asset => selectedIds.has(asset.id)),
    [assets, selectedIds],
  );

  function toggleSelected(asset: MediaAsset) {
    if (selectedIds.has(asset.id)) {
      setSelectedIds(current => {
        const next = new Set(current);
        next.delete(asset.id);
        return next;
      });
      return;
    }
    if (selectedIds.size >= MAX_SELECTED) {
      setError(`A message can include up to ${MAX_SELECTED} attachments.`);
      return;
    }
    setSelectedIds(current => new Set(current).add(asset.id));
  }

  async function loadMore() {
    if (loadingMore) return;
    const pending = Object.entries(sourcePages).filter(([, state]) => state.hasMore);
    if (!pending.length) return;
    setLoadingMore(true);
    setNotice('');
    const results = await Promise.allSettled(pending.map(async ([source, state]) => {
      const params = new URLSearchParams({ source, provider: 'cloudflare', page: String(state.page + 1), per_page: '100' });
      if (state.cursor) params.set('cursor', state.cursor);
      const response = await fetch(`/api/admin/media?${params}`, {
        credentials: 'same-origin',
        headers: { accept: 'application/json' },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(body.message || body.error || `Library ${source} unavailable (HTTP ${response.status})`));
      const rows: MediaAsset[] = Array.isArray(body.assets) ? body.assets : Array.isArray(body.images) ? body.images : Array.isArray(body.data) ? body.data : [];
      return {
        source,
        assets: rows.filter(asset => Boolean(asset.delivery_url || asset.url) && canAttach(asset)),
        page: state.page + 1,
        hasMore: Boolean(body?.pagination?.has_next || (body?.truncated && body?.cursor)),
        cursor: body?.pagination?.cursor || body?.cursor || null,
      };
    }));
    const successful = results.filter((result): result is PromiseFulfilledResult<{ source: string; assets: MediaAsset[]; page: number; hasMore: boolean; cursor: string | null }> => result.status === 'fulfilled');
    if (successful.length) {
      const incoming = successful.flatMap(result => result.value.assets);
      setAssets(current => {
        const seen = new Set(current.map(asset => asset.id));
        return [...current, ...incoming.filter(asset => {
          if (seen.has(asset.id)) return false;
          seen.add(asset.id);
          return true;
        })];
      });
      setSourcePages(current => {
        const next = { ...current };
        for (const result of successful) {
          const value = result.value;
          next[value.source] = { page: value.page, hasMore: value.hasMore, cursor: value.cursor };
        }
        return next;
      });
    }
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (failures.length) setNotice(failures.map(result => String(result.reason)).join(' · '));
    setLoadingMore(false);
  }

  async function attachSelected() {
    if (!selectedAssets.length || attaching) return;
    setAttaching(true);
    setError('');
    const files: File[] = [];
    const failures: string[] = [];
    for (const asset of selectedAssets) {
      const url = asset.delivery_url || asset.url;
      if (!url) {
        failures.push(`${asset.filename}: original file URL unavailable`);
        continue;
      }
      try {
        const response = await fetch(url, {
          credentials: new URL(url, location.origin).origin === location.origin ? 'same-origin' : 'omit',
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        const type = blob.type || mimeFor(asset);
        const name = asset.filename || 'library-file';
        const isChatImage = ['image/png', 'image/jpeg', 'image/webp'].includes(type);
        if (isChatImage && blob.size > MAX_CHAT_IMAGE_BYTES) throw new Error('image exceeds 5 MB');
        if (!isChatImage && (!acceptsChatFile(name, type) || blob.size > MAX_CHAT_FILE_BYTES)) {
          throw new Error('file type is unsupported or exceeds 20 MB');
        }
        files.push(new File([blob], name, { type }));
      } catch (cause) {
        failures.push(`${asset.filename}: ${cause instanceof Error ? cause.message : 'could not download'}`);
      }
    }
    try {
      if (files.length) await onAttach(files);
      if (failures.length) {
        setError(`Attached ${files.length} file(s). ${failures.slice(0, 3).join(' · ')}`);
        if (files.length) setSelectedIds(new Set());
      } else {
        onClose();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Some selected files could not be attached.');
    } finally {
      setAttaching(false);
    }
  }

  if (!open) return null;
  return (
    <div className="as-composer-library-backdrop" role="presentation" onPointerDown={event => { if (event.target === event.currentTarget && !attaching) onClose(); }}>
      <section className="as-composer-library-dialog" role="dialog" aria-modal="true" aria-label="Add from library">
        <header className="as-composer-library-header">
          <div>
            <strong><FolderOpen size={18} aria-hidden="true" /> Add from library</strong>
            <small>Choose existing media and files to attach to this message.</small>
          </div>
          <IconAction type="button" label="Close library" onClick={onClose} disabled={attaching}><X size={18} /></IconAction>
        </header>

        <label className="as-composer-library-search">
          <Search size={16} aria-hidden="true" />
          <input autoFocus type="search" placeholder="Search names and sources…" aria-label="Search your library" value={query} onChange={event => setQuery(event.target.value)} />
        </label>

        <nav className="as-composer-library-filters" aria-label="Filter library files">
          {FILTERS.map(item => (
            <button type="button" key={item.id} data-active={filter === item.id} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>
              {item.label}
            </button>
          ))}
        </nav>

        {loading ? <p className="as-composer-library-message" role="status">Loading your connected library…</p> : null}
        {error ? <p className="as-composer-library-message is-error" role="alert">{error}</p> : null}
        {!loading && !error && !filtered.length ? <p className="as-composer-library-message">No matching attachable files were found in the connected Images, Videos and R2 sources.</p> : null}
        {notice ? <p className="as-composer-library-notice" role="status">{notice}</p> : null}

        <div className="as-composer-library-grid">
          {filtered.map(asset => {
            const kind = classifyAsset(asset);
            const selected = selectedIds.has(asset.id);
            const preview = kind === 'image' ? previewUrl(asset) : asset.thumbnail_url || '';
            return (
              <button
                type="button"
                key={asset.id}
                className="as-composer-library-card"
                data-selected={selected}
                aria-pressed={selected}
                disabled={attaching || (!selected && selectedIds.size >= MAX_SELECTED)}
                onClick={() => toggleSelected(asset)}
                title={asset.filename}
              >
                <span className="as-composer-library-thumb">
                  {preview ? <img src={preview} alt="" loading="lazy" /> : <AssetGlyph kind={kind} />}
                  {selected ? <span className="as-composer-library-check"><Check size={15} aria-hidden="true" /></span> : null}
                </span>
                <span className="as-composer-library-card-name">{asset.filename}</span>
                <span className="as-composer-library-card-meta">{kindLabel(kind)} · {formatBytes(asset.size_bytes)}</span>
                <span className="as-composer-library-card-source">{providerLabel(providerOf(asset))}</span>
              </button>
            );
          })}
        </div>

        {Object.values(sourcePages).some(state => state.hasMore) ? (
          <button type="button" className="as-composer-library-load-more" disabled={loadingMore || loading} onClick={() => void loadMore()}>
            {loadingMore ? 'Loading more…' : 'Load more from connected sources'}
          </button>
        ) : null}

        <footer className="as-composer-library-footer">
          <span><Paperclip size={14} aria-hidden="true" /> {selectedIds.size} selected · up to {MAX_SELECTED} files</span>
          <div>
            <a href="/admin/media" target="_blank" rel="noreferrer">Open full Library</a>
            <button type="button" className="as-composer-library-attach" disabled={!selectedIds.size || attaching} onClick={() => void attachSelected()}>
              {attaching ? 'Attaching…' : selectedIds.size ? `Attach ${selectedIds.size} file${selectedIds.size === 1 ? '' : 's'}` : 'Attach selected'}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
