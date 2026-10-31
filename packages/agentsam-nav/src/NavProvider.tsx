import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type PropsWithChildren } from 'react';
import type { NavTheme, NavValue, NavTokens } from './contracts.js';
import { resolveNavDestinations, navBreadcrumbs } from './utils.js';
import { createNavState, type NavStateStore } from './state.js';

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
  stateStore: NavStateStore;
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
  /** Pass the same store to independently mounted surfaces; no global singleton. */
  stateStore?: NavStateStore;
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
  stateStore: suppliedStore,
}: NavProviderProps) {
  const data = useMemo(() => {
    const destinations = resolveNavDestinations(input.destinations ?? [], input.pathname);
    return { ...input, destinations, breadcrumbs: input.breadcrumbs ?? navBreadcrumbs(destinations) };
  }, [input]);
  const [ownedStore] = useState(() => createNavState({
    desktopOpen: defaultOpen && (typeof window === 'undefined' || window.innerWidth >= 1024),
  }));
  const stateStore = suppliedStore ?? ownedStore;
  const { menu, desktopOpen, mobileOpen, isMobile, isPeeking, width } = useSyncExternalStore(stateStore.subscribe, stateStore.getSnapshot, stateStore.getSnapshot);
  const setMenu = useCallback((menu: string | null) => stateStore.setState({ menu }), [stateStore]);
  const setPeeking = useCallback((isPeeking: boolean) => stateStore.setState({ isPeeking }), [stateStore]);
  const [loadedKey, setLoadedKey] = useState<string | undefined>();
  useEffect(() => {
    if (!storageKey) { setLoadedKey(undefined); return; }
    const initial = { desktopOpen: defaultOpen && window.innerWidth >= 1024, width: 264 };
    try {
      const saved = JSON.parse(window.localStorage.getItem(storageKey) ?? 'null');
      if (typeof saved?.open === 'boolean') initial.desktopOpen = saved.open;
      if (Number.isFinite(saved?.width)) initial.width = saved.width;
    } catch { /* Unavailable or malformed preferences never prevent navigation. */ }
    stateStore.setState(initial);
    setLoadedKey(storageKey);
  }, [storageKey, defaultOpen, stateStore]);
  useEffect(() => {
    if (!storageKey || loadedKey !== storageKey) return;
    try { window.localStorage.setItem(storageKey, JSON.stringify({ open: desktopOpen, width })); } catch { /* Private browsing / full storage. */ }
  }, [storageKey, loadedKey, desktopOpen, width]);

  useEffect(() => {
    const query = window.matchMedia(`(max-width: ${mobileBreakpoint - 1}px)`);
    const update = () => {
      if (stateStore.getSnapshot().isMobile === query.matches) return;
      stateStore.setState(query.matches ? { isMobile: true, mobileOpen: false, isPeeking: false } : { isMobile: false, isPeeking: false });
    };
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, [mobileBreakpoint, stateStore]);

  const open = isMobile ? mobileOpen : desktopOpen;
  const setOpen = useCallback((next: boolean) => {
    stateStore.setState(state => state.isMobile ? { mobileOpen: next } : { desktopOpen: next });
  }, [stateStore]);
  const close = useCallback(() => setOpen(false), [setOpen]);
  const toggle = useCallback(() => stateStore.setState(state => state.isMobile ? { mobileOpen: !state.mobileOpen } : { desktopOpen: !state.desktopOpen }), [stateStore]);
  const setWidth = useCallback((next: number) => {
    if (Number.isFinite(next)) stateStore.setState({ width: next });
  }, [stateStore]);

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
    stateStore,
    setOpen,
    toggle,
    close,
    setPeeking,
    setWidth,
    scrollToItem,
  }), [data, tokens, theme, accentColor, menu, close, isMobile, isPeeking, mobileBreakpoint, open, peekable, resizable, scrollToItem, setMenu, setOpen, setPeeking, setWidth, stateStore, storageKey, toggle, width]);

  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

export function useNav() {
  const context = useContext(NavContext);
  if (!context) throw new Error('useNav must be used inside Nav.Provider');
  return context;
}
