import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import type { NavTheme, NavValue, NavTokens } from './contracts.js';
import { resolveNavDestinations, navBreadcrumbs } from './utils.js';

export type NavContextValue = {
  data: NavValue;
  tokens: NavTokens;
  theme: NavTheme;
  accentColor: string;
  menu: string | null;
  setMenu: (menu: string | null) => void;
  open: boolean;
  isMobile: boolean;
  isPeeking: boolean;
  peekable: boolean;
  resizable: boolean;
  width: number;
  mobileBreakpoint: number;
  storageKey?: string;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  close: () => void;
  setPeeking: (peeking: boolean) => void;
  setWidth: (width: number) => void;
  scrollToItem: (itemId: string) => void;
};

const NavContext = createContext<NavContextValue | null>(null);

export type NavProviderProps = PropsWithChildren<{
  value?: NavValue;
  tokens?: NavTokens;
  theme?: NavTheme;
  accentColor?: string;
  defaultOpen?: boolean;
  mobileBreakpoint?: number;
  peekable?: boolean;
  resizable?: boolean;
  /** Installation/account scoped key. Omit to keep shell preferences in memory. */
  storageKey?: string;
}>;

export function NavProvider({
  children,
  value: input = {},
  tokens = {},
  theme = 'dark',
  accentColor = '#8B5CF6',
  defaultOpen = true,
  mobileBreakpoint = 768,
  peekable = false,
  resizable = false,
  storageKey,
}: NavProviderProps) {
  const data = useMemo(() => {
    const destinations = resolveNavDestinations(input.destinations ?? [], input.pathname);
    return { ...input, destinations, breadcrumbs: input.breadcrumbs ?? navBreadcrumbs(destinations) };
  }, [input]);
  const [menu, setMenu] = useState<string | null>(null);
  const [desktopOpen, setDesktopOpen] = useState(() => defaultOpen && (typeof window === 'undefined' || window.innerWidth >= 1024));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isPeeking, setPeeking] = useState(false);
  const [width, setWidthState] = useState(264);
  const [loadedKey, setLoadedKey] = useState<string | undefined>();
  useEffect(() => {
    if (!storageKey) { setLoadedKey(undefined); return; }
    setDesktopOpen(defaultOpen && window.innerWidth >= 1024);
    setWidthState(264);
    try {
      const saved = JSON.parse(window.localStorage.getItem(storageKey) ?? 'null');
      if (typeof saved?.open === 'boolean') setDesktopOpen(saved.open);
      if (Number.isFinite(saved?.width)) setWidthState(Math.max(208, Math.min(400, Math.round(saved.width))));
    } catch { /* Unavailable or malformed preferences never prevent navigation. */ }
    setLoadedKey(storageKey);
  }, [storageKey, defaultOpen]);
  useEffect(() => {
    if (!storageKey || loadedKey !== storageKey) return;
    try { window.localStorage.setItem(storageKey, JSON.stringify({ open: desktopOpen, width })); } catch { /* Private browsing / full storage. */ }
  }, [storageKey, loadedKey, desktopOpen, width]);

  useEffect(() => {
    const query = window.matchMedia(`(max-width: ${mobileBreakpoint - 1}px)`);
    const update = () => {
      setIsMobile(query.matches);
      if (query.matches) setMobileOpen(false);
      else setPeeking(false);
    };
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, [mobileBreakpoint]);

  const open = isMobile ? mobileOpen : desktopOpen;
  const setOpen = useCallback((next: boolean) => {
    if (isMobile) setMobileOpen(next);
    else setDesktopOpen(next);
  }, [isMobile]);
  const close = useCallback(() => setOpen(false), [setOpen]);
  const toggle = useCallback(() => setOpen(!open), [open, setOpen]);
  const setWidth = useCallback((next: number) => {
    if (Number.isFinite(next)) setWidthState(Math.max(208, Math.min(400, Math.round(next))));
  }, []);

  useEffect(() => {
    if (!isMobile || !open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [close, isMobile, open]);

  const scrollToItem = useCallback((itemId: string) => {
    document.querySelector<HTMLElement>(`[data-nav-item-id="${CSS.escape(itemId)}"]`)
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, []);

  const value = useMemo<NavContextValue>(() => ({
    data, tokens, theme, accentColor, menu, setMenu,
    open,
    isMobile,
    isPeeking,
    peekable,
    resizable,
    width,
    mobileBreakpoint,
    storageKey,
    setOpen,
    toggle,
    close,
    setPeeking,
    setWidth,
    scrollToItem,
  }), [data, tokens, theme, accentColor, menu, close, isMobile, isPeeking, mobileBreakpoint, open, peekable, resizable, scrollToItem, setOpen, setWidth, storageKey, toggle, width]);

  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

export function useNav() {
  const context = useContext(NavContext);
  if (!context) throw new Error('useNav must be used inside Nav.Provider');
  return context;
}
