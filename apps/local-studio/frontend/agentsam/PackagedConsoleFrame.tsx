import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useRouterState } from '@tanstack/react-router';
import './packaged-console-frame.css';

type WindowWithConsole = Window & {
  renderShell?: (active: string, html: string, options?: Record<string, unknown>) => void;
};

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const current = document.querySelector<HTMLScriptElement>('script[src="' + src + '"]');
    if (current?.dataset.loaded === 'true') { resolve(); return; }
    const script = current || document.createElement('script');
    if (!current) {
      script.src = src;
      script.async = false;
      document.head.appendChild(script);
    }
    script.addEventListener('load', () => { script.dataset.loaded = 'true'; resolve(); }, { once: true });
    script.addEventListener('error', () => reject(new Error('Console script missing: ' + src)), { once: true });
  });
}

/**
 * Mount the actual packaged Ecommerce Console renderer around Local Studio's
 * existing routes. No reproduction, no duplicated nav primitives.
 */
export function PackagedConsoleFrame({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: state => state.location.pathname });
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadScript('/admin/js/shell.js');
      await loadScript('/admin/host-config.js');
      if (cancelled) return;
      const render = (window as WindowWithConsole).renderShell;
      if (typeof render !== 'function') throw new Error('Packaged console renderer missing');
      // The persistent Console sidebar already handles responsive navigation.\n      // Adding its separate mobile drawer here renders a second sidebar on desktop.\n      render(pathname, '<div id="agentsam-host-workspace"></div>', { fullBleed: true });
      if (cancelled) return;
      const outlet = document.getElementById('agentsam-host-workspace');
      if (!outlet) throw new Error('Packaged console workspace mount missing');
      setTarget(outlet);
    })().catch(cause => { if (!cancelled) setError(String(cause)); });
    return () => { cancelled = true; };
  // Shell is persistent; routing updates the React Outlet without discarding the workbench.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <>
    <div id="console-app" data-agentsam-console-host />
    {target ? createPortal(children, target) : null}
    {error ? <div role="alert" className="agentsam-console-error">{error}</div> : null}
  </>;
}
