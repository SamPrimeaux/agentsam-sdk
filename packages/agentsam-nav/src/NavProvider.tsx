import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';

export type NavContextValue = {
  open: boolean;
  isMobile: boolean;
  isPeeking: boolean;
  peekable: boolean;
  resizable: boolean;
  width: number;
  mobileBreakpoint: number;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  close: () => void;
  setPeeking: (peeking: boolean) => void;
  setWidth: (width: number) => void;
  scrollToItem: (itemId: string) => void;
};

const NavContext = createContext<NavContextValue | null>(null);

export type NavProviderProps = PropsWithChildren<{
  defaultOpen?: boolean;
  mobileBreakpoint?: number;
  peekable?: boolean;
  resizable?: boolean;
}>;

export function NavProvider({
  children,
  defaultOpen = true,
  mobileBreakpoint = 768,
  peekable = false,
  resizable = false,
}: NavProviderProps) {
  const [desktopOpen, setDesktopOpen] = useState(defaultOpen);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isPeeking, setPeeking] = useState(false);
  const [width, setWidthState] = useState(268);

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
    setWidthState(Math.max(208, Math.min(400, Math.round(next))));
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
    open,
    isMobile,
    isPeeking,
    peekable,
    resizable,
    width,
    mobileBreakpoint,
    setOpen,
    toggle,
    close,
    setPeeking,
    setWidth,
    scrollToItem,
  }), [close, isMobile, isPeeking, mobileBreakpoint, open, peekable, resizable, scrollToItem, setOpen, setWidth, toggle, width]);

  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

export function useNav() {
  const context = useContext(NavContext);
  if (!context) throw new Error('useNav must be used inside Nav.Provider');
  return context;
}
