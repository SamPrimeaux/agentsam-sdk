import { useEffect, useMemo, useState } from 'react';
import { FileText, FolderOpen, Search, X } from 'lucide-react';
import { classifyAsset, previewUrl, type MediaAsset } from '@/components/media/media-utils';

import { IconAction } from '@/components/ui/icon-action';
/** Select existing owner-authorized images; download through their actual delivery URLs before staging. */
export function ComposerLibraryPicker({ open, onClose, onAttach }: {
  open: boolean; onClose: () => void; onAttach: (file: File) => Promise<void>;
}) {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true); setError('');
    const sources = ['cf_images','r2'];
    void Promise.allSettled(sources.map(async source => {
      const response=await fetch(`/api/admin/media?source=${source}&provider=cloudflare&page=1&per_page=60`, {
        signal:controller.signal,credentials:'same-origin',headers:{accept:'application/json'},
      });
      const body=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(String(body.message||body.error||`Library ${source} unavailable (HTTP ${response.status})`));
      const rows:MediaAsset[]=Array.isArray(body.assets)?body.assets:Array.isArray(body.images)?body.images:Array.isArray(body.data)?body.data:[];
      return rows.filter(asset=>Boolean(asset.delivery_url||asset.url||asset.thumbnail_url)&&
        (classifyAsset(asset)==='image'||/\.(txt|md|csv|json|html|xml)$/i.test(asset.filename)));
    })).then(results=>{
      if(controller.signal.aborted)return;
      const found=results.filter(result=>result.status==='fulfilled').flatMap(result=>result.value);
      const seen=new Set<string>();
      setAssets(found.filter(asset=>{if(seen.has(asset.id))return false;seen.add(asset.id);return true;}));
      if(!results.some(result=>result.status==='fulfilled'))setError(results.map(result=>result.status==='rejected'?String(result.reason):'').filter(Boolean).join(' · ')||'Library unavailable');
    }).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return () => controller.abort();
  }, [open]);
  const filtered = useMemo(() => assets.filter(asset => asset.filename?.toLowerCase().includes(query.toLowerCase())), [assets, query]);
  async function choose(asset: MediaAsset) {
    const url = asset.delivery_url || asset.url || asset.thumbnail_url;
    if (!url) return;
    setBusy(asset.id); setError('');
    try {
      const response = await fetch(url, { credentials: new URL(url, location.origin).origin === location.origin ? 'same-origin' : 'omit' });
      if (!response.ok) throw new Error(`Cannot access this image (HTTP ${response.status}).`);
      const blob = await response.blob();
      const image = classifyAsset(asset)==='image';
      const type = blob.type || asset.mime_type || asset.content_type || (image?'image/png':'text/plain');
      if (image && (!['image/png','image/jpeg','image/webp'].includes(type) || blob.size > 5_000_000))
        throw new Error('This image must be PNG, JPEG or WebP and under 5 MB.');
      if (!image && (!/\.(txt|md|csv|json|html|xml)$/i.test(asset.filename) || blob.size > 1_000_000))
        throw new Error('Reference files must be supported text formats under 1 MB.');
      await onAttach(new File([blob], asset.filename || 'library-reference.txt', { type }));
      onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'This media could not be attached.'); }
    finally { setBusy(''); }
  }
  if (!open) return null;
  return <div className="as-composer-library-backdrop" role="presentation" onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="as-composer-library-dialog" role="dialog" aria-modal="true" aria-label="Add from library">
      <header><strong><FolderOpen size={17}/> Add from library</strong><IconAction type="button" label="Close library" onClick={onClose}><X size={17}/></IconAction></header>
      <label><Search size={15}/><input autoFocus type="search" placeholder="Search media…" aria-label="Search your library" value={query} onChange={event => setQuery(event.target.value)} /></label>
      {loading ? <p role="status">Loading your saved images…</p> : error ? <p role="alert">{error}</p> : !filtered.length ? <p>No matching media or reference files are available in your connected library.</p> : null}
      <div className="as-composer-library-grid">{filtered.map(asset => <button type="button" key={asset.id} disabled={Boolean(busy)} onClick={() => void choose(asset)}>{classifyAsset(asset)==='image'?<img src={previewUrl(asset)} alt="" loading="lazy"/>:<span className="as-library-file-icon"><FileText size={27} aria-hidden="true"/></span>}<span>{busy===asset.id?'Attaching…':asset.filename}</span></button>)}</div>
    </section>
  </div>;
}
