import { createRoot } from 'react-dom/client';
import { createElement, useEffect } from 'react';
import { Home, ShoppingBag, Package, Users, TrendingUp, Tag, FileText, ChartNoAxesCombined, Store, Mail, Folder, Library, Ticket, Bot, Box, Clapperboard, Settings, Database, Terminal, Globe, Puzzle, Search, Palette, Link, LifeBuoy, LogOut, LayoutDashboard, Bell, Code, Image, CreditCard } from 'lucide-react';
import { useNav } from './NavProvider.js';
import { createNavState } from './state.js';
export { createNavState } from './state.js';

/** Hosts pass semantic icon names, never serialized SVG/HTML. */
export function navIcon(name: string) {
  const icons: Record<string, typeof Home> = { home: Home, orders: ShoppingBag, products: Package, customers: Users, growth: TrendingUp, discounts: Tag, content: FileText, analytics: ChartNoAxesCombined, store: Store, 'online-store': Store, audience: Mail, mail: Mail, projects: Folder, library: Library, tickets: Ticket, agentsam: Bot, chat: Bot, cad: Box, 'cad-creator': Box, moviemode: Clapperboard, settings: Settings, database: Database, terminal: Terminal, cli: Terminal, browser: Globe, browse: Globe, apps: Puzzle, integrations: Link, search: Search, appearance: Palette, help: LifeBuoy, logout: LogOut, dashboard: LayoutDashboard, notifications: Bell, files: Code, media: Image, billing: CreditCard };
  return createElement(icons[name] ?? Puzzle, { 'aria-hidden': true });
}
import { createPortal } from 'react-dom';
import { Nav } from './Nav.js';
import type { NavProviderProps } from './NavProvider.js';

export interface MountNavOptions extends Omit<NavProviderProps, 'children'> {
  sidenav?: HTMLElement;
  topbar?: HTMLElement;
  breadcrumbs?: HTMLElement;
  startup?: boolean;
  onStateChange?: (state: { open: boolean; isMobile: boolean; width: number }) => void;
}

/** Plain HTML integration. Both portals are descendants of the same provider. */
export function mountNav(options: MountNavOptions) {
  if (!options.sidenav && !options.topbar && !options.breadcrumbs) throw new Error('mountNav requires a sidenav, topbar or breadcrumbs element');
  const anchor = document.createElement('div');
  anchor.style.display = 'contents';
  (options.sidenav ?? options.topbar ?? options.breadcrumbs)!.parentElement!.appendChild(anchor);
  const root = createRoot(anchor, { identifierPrefix: 'agentsam-host-nav-' + crypto.randomUUID() + '-' });
  const stateStore = options.stateStore ?? createNavState({ desktopOpen: (options.defaultOpen ?? true) && window.innerWidth >= 1024 });
  let current = { ...options, stateStore };
  let controls: { toggle: () => void; setOpen: (open: boolean) => void } | undefined;
  function StateBridge() {
    const nav = useNav();
    useEffect(() => {
      controls = { toggle: nav.toggle, setOpen: nav.setOpen };
      current.onStateChange?.({ open: nav.open, isMobile: nav.isMobile, width: nav.width });
    }, [nav.toggle, nav.setOpen, nav.open, nav.isMobile, nav.width]);
    return null;
  }
  const render = () => root.render(<Nav.Provider {...current}>
    <StateBridge />
    {current.sidenav ? createPortal(<Nav.Sidenav />, current.sidenav) : null}
    {current.topbar ? createPortal(<Nav.Topbar startup={current.startup} />, current.topbar) : null}
    {current.breadcrumbs ? createPortal(<Nav.Scope className="as-nav-breadcrumb-scope"><Nav.Breadcrumbs /></Nav.Scope>, current.breadcrumbs) : null}
  </Nav.Provider>);
  render();
  return {
    stateStore,
    toggle() { controls?.toggle(); },
    setOpen(open: boolean) { controls?.setOpen(open); },
    update(next: Partial<MountNavOptions>) { current = { ...current, ...next, stateStore }; render(); },
    unmount() { root.unmount(); anchor.remove(); },
  };
}
