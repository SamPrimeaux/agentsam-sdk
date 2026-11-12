/**
 * Real in-window browser viewport for the Tauri desktop shell.
 * The underlying native child WebView is kept by session id; React only owns its bounds.
 * No remote site is embedded through a frame, and no native tool bridge is injected into pages.
 */
import { useEffect, useRef, useState } from 'react';
import { getTauriInvoke } from '@/lib/desktop/tauri';

interface Bounds { x: number; y: number; width: number; height: number }

function boundsOf(node: HTMLElement): Bounds | null {
  const rect = node.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return null;
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
}

export function EmbeddedBrowserViewport({ sessionId, url }: { sessionId: string; url: string }) {
  const nodeRef = useRef<HTMLDivElement>(null);
  const lifecycle = useRef(0);
  const [failure, setFailure] = useState<string | null>(null);
  useEffect(() => {
    const invoke = getTauriInvoke();
    const node = nodeRef.current;
    if (!invoke || !node || !url) return;
    let disposed = false;
    let started = false;
    let busy = false;
    let pendingUpdate = false;
    const token = ++lifecycle.current;
    let frame = 0;
    const hide = () => { void invoke('embedded_browser_hide', { sessionId }).catch(() => undefined); };
    const update = () => {
      frame = 0;
      if (disposed) return;
      const bounds = boundsOf(node);
      const modalOpen = document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]');
      if (!bounds || !node.isConnected || document.visibilityState === 'hidden' || modalOpen) {
        hide();
        return;
      }
      if (busy) { pendingUpdate = true; return; }
      const command = started ? 'embedded_browser_resize' : 'embedded_browser_sync';
      busy = true;
      void invoke(command, { sessionId, ...(command === 'embedded_browser_sync' ? { url } : {}), bounds })
        .then(() => {
          started = true;
          if (disposed) {
            if (lifecycle.current === token) hide();
          } else if (document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')) {
            hide();
          } else setFailure(null);
        })
        .catch((error) => { started = false; if (!disposed) setFailure(String(error)); })
        .finally(() => { busy = false; if (pendingUpdate && !disposed) { pendingUpdate = false; schedule(); } });
    };
    const schedule = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    const observer = new ResizeObserver(schedule);
    const visibility = () => { if (document.visibilityState === 'hidden') hide(); else schedule(); };
    // Native child views paint over the host webview: suppress the viewport while a
    // Studio dialog is open so permissions and confirmations stay unobstructed.
    const modalObserver = new MutationObserver(() => {
      if (document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')) hide();
      else schedule();
    });
    modalObserver.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-state'] });
    observer.observe(node);
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    document.addEventListener('visibilitychange', visibility);
    schedule();
    return () => {
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      modalObserver.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
      document.removeEventListener('visibilitychange', visibility);
      hide();
    };
  }, [sessionId, url]);

  return (
    <div className="as-embedded-browser-viewport" ref={nodeRef} data-native-browser-session={sessionId}>
      {failure && <div className="as-embedded-browser-error" role="alert">
        <strong>Native browser unavailable</strong>
        <span>{failure}</span>
      </div>}
    </div>
  );
}
