import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import { Nav } from './Nav.js';
import type { NavProviderProps } from './NavProvider.js';

export interface MountNavOptions extends Omit<NavProviderProps, 'children'> {
  sidenav?: HTMLElement;
  topbar?: HTMLElement;
  startup?: boolean;
}

/** Plain HTML integration. Both portals are descendants of the same provider. */
export function mountNav(options: MountNavOptions) {
  if (!options.sidenav && !options.topbar) throw new Error('mountNav requires a sidenav or topbar element');
  const anchor = document.createElement('div');
  anchor.style.display = 'contents';
  (options.sidenav ?? options.topbar)!.parentElement!.appendChild(anchor);
  const root = createRoot(anchor);
  let current = options;
  const render = () => root.render(<Nav.Provider {...current}>
    {current.sidenav ? createPortal(<Nav.Sidenav />, current.sidenav) : null}
    {current.topbar ? createPortal(<Nav.Topbar startup={current.startup} />, current.topbar) : null}
  </Nav.Provider>);
  render();
  return {
    update(next: Partial<MountNavOptions>) { current = { ...current, ...next }; render(); },
    unmount() { root.unmount(); anchor.remove(); },
  };
}
