import { useMemo, useState } from 'react';
import type { AgentArtifact } from '@inneranimalmedia/agentsam-contracts';

export function ArtifactCard({ artifact, className, onOpen }: { artifact: AgentArtifact; className?: string; onOpen?: (artifact: AgentArtifact) => void }) {
  return (
    <button type="button" className={className} data-artifact-kind={artifact.kind} onClick={() => onOpen?.(artifact)}>
      <span>{artifact.title ?? artifact.kind}</span>
    </button>
  );
}

/** Render generated vector art in an image context, never as executable DOM. */
export function inlineSvgImageSource(source: string): string | null {
  if (new TextEncoder().encode(source).length > 256000 || typeof DOMParser === 'undefined') return null;
  if (/<!DOCTYPE|<!ENTITY|<\?xml-stylesheet/i.test(source)) return null;
  const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
  const root = doc.documentElement;
  if (root.localName !== 'svg' || root.namespaceURI !== 'http://www.w3.org/2000/svg' || doc.querySelector('parsererror')) return null;
  for (const el of [root, ...Array.from(root.querySelectorAll('*'))]) {
    if (el.namespaceURI !== root.namespaceURI || /^(script|foreignObject|iframe|object|embed|image|audio|video|style|feImage|a|animate|animateMotion|animateTransform|set)$/i.test(el.localName)) return null;
    for (const attr of Array.from(el.attributes)) {
      if (/^on/i.test(attr.localName) || attr.localName === 'style') return null;
      if ((attr.localName === 'href' || attr.localName === 'src') && !attr.value.trim().startsWith('#')) return null;
      if (/url\s*\(/i.test(attr.value) && !/^url\(\s*['"]?#[\w.-]+['"]?\s*\)$/i.test(attr.value.trim())) return null;
    }
  }
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(source);
}

export async function inlineSvgRevision(source: string): Promise<string> {
  const bytes = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function InlineSvgPreview({ source, complete = true, onReview }: {
  source: string;
  complete?: boolean;
  onReview?: (review: { decision: 'approve' | 'revise'; sha256: string; backdrop: string }) => void;
}) {
  const url = useMemo(() => complete ? inlineSvgImageSource(source) : null, [source, complete]);
  const [backdrop, setBackdrop] = useState('dark');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [failedUrl, setFailedUrl] = useState('');
  if (!url) return null;
  const failed = failedUrl === url;
  const colors = { dark: '#141414', light: '#f3f3f3', canvas: '#a3a3a3' };
  async function review(decision: 'approve' | 'revise') {
    setBusy(true); setError('');
    try { const sha256 = await inlineSvgRevision(source); onReview?.({ decision, sha256, backdrop }); }
    catch { setError('Could not identify this revision. No approval was prepared.'); }
    finally { setBusy(false); }
  }
  return <section aria-label="Inline SVG design preview" style={{border:'1px solid var(--nav-border, currentColor)',borderRadius:16,overflow:'hidden',marginBlock:8,padding:12}}>
    <div style={{display:'flex',flexWrap:'wrap',gap:8,alignItems:'center',marginBottom:8}}>
      <strong style={{marginRight:'auto'}}>Design preview</strong>
      <label>Backdrop <select value={backdrop} onChange={e => setBackdrop(e.target.value)} aria-label="Preview backdrop">
        <option value="dark">Dark</option><option value="light">Light</option><option value="canvas">Canvas</option>
      </select></label>
    </div>
    <div style={{background:colors[backdrop as keyof typeof colors],padding:12,borderRadius:12,display:'grid',placeItems:'center',minHeight:80}}>
      {failed ? <span style={{color:'#777'}}>Preview unavailable. Source is retained below.</span> : <img src={url} onError={() => setFailedUrl(url)} alt="Generated SVG design" style={{display:'block',maxWidth:'100%',maxHeight:600,height:'auto',objectFit:'contain'}}/>}
    </div>
    {onReview && !failed ? <div style={{display:'flex',flexWrap:'wrap',gap:8,marginTop:12}}>
      <button type="button" disabled={busy} onClick={() => void review('revise')} style={{minHeight:44,padding:'0 12px',border:'1px solid var(--nav-border,currentColor)',borderRadius:12}}>Request changes</button>
      <button type="button" disabled={busy} onClick={() => void review('approve')} style={{minHeight:44,padding:'0 12px',borderRadius:12,background:'var(--nav-accent,#555)',color:'var(--nav-accent-ink,#fff)'}}>Prepare approval & build request</button>
    </div> : null}
    {error ? <p role="alert">{error}</p> : null}
  </section>;
}
