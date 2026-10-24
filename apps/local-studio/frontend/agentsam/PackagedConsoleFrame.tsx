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
  // The packaged nav renders only once. Keep the active link in sync with
  // client-side route transitions without repainting the sidebar or losing the portal.
  useEffect(() => {
    if (!target) return;
    const activePath = pathname.startsWith('/chats') ? '/admin/agentsam' : pathname;
    document.querySelectorAll<HTMLAnchorElement>('#console-app .console-sidenav a.console-nav-item, #console-app .console-sidenav a.console-nav-child')
      .forEach((link) => {
        const url = new URL(link.href, window.location.href);
        const active = url.pathname === activePath;
        link.classList.toggle('is-active', active);
        if (active) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      });
  }, [pathname, target]);
  // The Ecommerce shell owns the navigation. The conversation page supplies its
  // own centered mode switch; do not stack a second global topbar above it.
  useEffect(() => {
    document.body.classList.toggle('agentsam-conversation-route', (pathname === '/admin/agentsam' || pathname.startsWith('/chats')));
    return () => document.body.classList.remove('agentsam-conversation-route');
  }, [pathname]);
  useEffect(() => {
    let cancelled = false;
    let petCleanup: (() => void) | undefined;
    (async () => {
      await loadScript('/admin/js/shell.js');
      await loadScript('/admin/host-config.js');
      if (cancelled) return;
      const render = (window as WindowWithConsole).renderShell;
      if (typeof render !== 'function') throw new Error('Packaged console renderer missing');
      render(pathname, '<div id="agentsam-host-workspace"></div>', { fullBleed: true, includeMobileDrawer: false });
      if (cancelled) return;
      const outlet = document.getElementById('agentsam-host-workspace');
      if (!outlet) throw new Error('Packaged console workspace mount missing');
      // Local Studio owns the current-page assistant. Intercept the packaged
      // pet trigger before the legacy Ecommerce assistant opens a second chat.
      const pet = document.getElementById('agentsam-toggle');
      const activatePet = (event: MouseEvent) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        window.dispatchEvent(new Event('agentsam:assistant:activate'));
      };
      pet?.addEventListener('click', activatePet, true);
      petCleanup = () => pet?.removeEventListener('click', activatePet, true);
      setTarget(outlet);
    })().catch(cause => { if (!cancelled) setError(String(cause)); });
    return () => { cancelled = true; petCleanup?.(); };
  // Shell is persistent; routing updates the React Outlet without discarding the workbench.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <>
    <div id="console-app" data-agentsam-console-host />
    {target ? createPortal(children, target) : null}
    {error ? <div role="alert" className="agentsam-console-error">{error}</div> : null}
  </>;
}
