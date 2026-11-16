/**
 * In-app web viewport for the hosted (non-desktop) Browser tab.
 * Other sites are loaded through the signed-in page route, which serves them in a sandboxed
 * document so they can be shown here; this app's own pages are framed directly. Link clicks
 * and GET forms inside the page are reported back so history, title and the address bar follow.
 */
import { useEffect, useRef, useState } from 'react';
import { useWorkStore } from '@/lib/work/store';

export function browserFrameSource(rawUrl: string): { src: string; sameOrigin: boolean } | null {
  let parsed: URL;
  try { parsed = new URL(/^[a-z][a-z0-9+.-]*:/i.test(rawUrl) ? rawUrl : `https://${rawUrl}`); } catch { return null; }
  if (!['http:', 'https:'].includes(parsed.protocol)) return null;
  if (parsed.origin === window.location.origin) return { src: parsed.href, sameOrigin: true };
  return { src: `/api/browser/page?url=${encodeURIComponent(parsed.href)}`, sameOrigin: false };
}

export function WebBrowserViewport({ tabId, url }: { tabId: string; url: string }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [loading, setLoading] = useState(true);
  const source = browserFrameSource(url);

  useEffect(() => { setLoading(true); }, [url]);
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { source?: string; type?: string; url?: string; title?: string } | null;
      if (!data || data.source !== 'agentsam-browser' || event.source !== frameRef.current?.contentWindow) return;
      if (data.type === 'navigate' && typeof data.url === 'string' && /^https?:\/\//i.test(data.url)) {
        useWorkStore.getState().setTabUrl(tabId, data.url);
      } else if (data.type === 'title' && typeof data.title === 'string' && data.title.trim()) {
        const title = data.title.trim().slice(0, 120);
        useWorkStore.setState((state) => ({
          sideTabs: state.sideTabs.map((item) => item.id === tabId ? { ...item, title } : item),
        }));
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [tabId]);

  if (!source) return <div className="as-browser-no-iframe" role="status"><strong>That address can't be opened</strong><p>Enter a web address starting with http or https.</p></div>;
  return (
    <div className="as-web-browser-viewport">
      {loading && <div className="as-web-browser-progress" role="progressbar" aria-label="Loading page" />}
      <iframe ref={frameRef} title="Browser page" src={source.src} onLoad={() => setLoading(false)}
        // Proxied pages run in an opaque origin; only this app's own pages keep same-origin.
        sandbox={source.sameOrigin ? 'allow-scripts allow-same-origin allow-forms allow-popups' : 'allow-scripts allow-forms allow-popups'}
        referrerPolicy="no-referrer" allow="clipboard-write" className="as-web-browser-frame" />
    </div>
  );
}
