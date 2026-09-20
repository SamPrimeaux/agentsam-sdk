/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Package: @inneranimalmedia/ecommerce-cms-agentsam
 * Design System: Composable Sidebar Suite (Cloudflare Kumo Inspired)
 *
 * Implements a composable sidebar navigation architecture with:
 * - Collapsible groups and nested sub-menus
 * - Icon-only rail mode with auto-tooltips
 * - Peeking mode (clean hover slide-open on desktop)
 * - Sliding views for animated surface switching (e.g. Store ↔ Completeful POD ↔ Settings)
 * - Drag-to-resize handle with boundary constraints
 * - Responsive mobile drawer with smooth morphing transitions
 * - Frosted white glassmorphism aesthetic matching the reference platform standard
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback
} from 'react';
import {
  ChevronDown,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  X,
  Sparkles
} from 'lucide-react';

export type SidebarState = 'expanded' | 'collapsed' | 'peeking';
export type SidebarVariant = 'sidebar' | 'floating' | 'inset';
export type SidebarSide = 'left' | 'right';
export type SidebarCollapsibleMode = 'icon' | 'offcanvas' | 'none';

export interface SidebarContextValue {
  state: SidebarState;
  open: boolean;
  setOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  isPeeking: boolean;
  isMobile: boolean;
  width: number;
  setWidth: (width: number) => void;
  side: SidebarSide;
  variant: SidebarVariant;
  collapsible: SidebarCollapsibleMode;
  peekable: boolean;
  resizable: boolean;
  scrollToItem: (itemId: string, options?: ScrollIntoViewOptions) => void;
  registerItemRef: (itemId: string, element: HTMLElement | null) => void;
  activeView: string;
  setActiveView: (view: string) => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function useSidebar(): SidebarContextValue {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error('useSidebar must be used within a Sidebar.Provider');
  }
  return context;
}

// ---------------------------------------------------------------------------
// 1. Sidebar.Provider
// ---------------------------------------------------------------------------
export interface SidebarProviderProps {
  children: React.ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onOpenChangeComplete?: (open: boolean) => void;
  variant?: SidebarVariant;
  side?: SidebarSide;
  collapsible?: SidebarCollapsibleMode;
  resizable?: boolean;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  contained?: boolean;
  peekable?: boolean;
  animationDuration?: number;
  mobileBreakpoint?: number;
  className?: string;
}

export const SidebarProvider: React.FC<SidebarProviderProps> = ({
  children,
  defaultOpen = true,
  open: controlledOpen,
  onOpenChange,
  onOpenChangeComplete,
  variant = 'sidebar',
  side = 'left',
  collapsible = 'icon',
  resizable = false,
  defaultWidth = 248,
  minWidth = 190,
  maxWidth = 360,
  contained = false,
  peekable = true,
  animationDuration = 200,
  mobileBreakpoint = 1024,
  className = ''
}) => {
  const [internalOpen, setInternalOpen] = useState(() => {
    try {
      const saved = localStorage.getItem('agentsam_sidebar_collapsed');
      if (saved !== null) {
        return saved !== 'true';
      }
    } catch (_) {}
    return defaultOpen;
  });
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;

  const [isPeeking, setIsPeeking] = useState(false);
  const [width, setWidth] = useState(defaultWidth);
  const [isMobile, setIsMobile] = useState(false);
  const [activeView, setActiveView] = useState('root');

  const itemRegistryRef = useRef<Map<string, HTMLElement>>(new Map());

  // Detect mobile breakpoint
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < mobileBreakpoint;
      setIsMobile(mobile);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [mobileBreakpoint]);

  const setOpen = useCallback(
    (newVal: boolean) => {
      if (!isControlled) {
        setInternalOpen(newVal);
        try {
          localStorage.setItem('agentsam_sidebar_collapsed', String(!newVal));
        } catch (_) {}
      }
      onOpenChange?.(newVal);
      if (onOpenChangeComplete) {
        setTimeout(() => {
          onOpenChangeComplete(newVal);
        }, animationDuration);
      }
    },
    [isControlled, onOpenChange, onOpenChangeComplete, animationDuration]
  );

  const toggleSidebar = useCallback(() => {
    setOpen(!open);
  }, [open, setOpen]);

  // Derived state: 'expanded' | 'collapsed' | 'peeking'
  const state: SidebarState = isPeeking ? 'peeking' : open ? 'expanded' : 'collapsed';

  const registerItemRef = useCallback((id: string, el: HTMLElement | null) => {
    if (el) {
      itemRegistryRef.current.set(id, el);
    } else {
      itemRegistryRef.current.delete(id);
    }
  }, []);

  const scrollToItem = useCallback((id: string, options?: ScrollIntoViewOptions) => {
    const el = itemRegistryRef.current.get(id);
    if (el) {
      el.scrollIntoView({
        behavior: options?.behavior || 'smooth',
        block: options?.block || 'nearest',
        inline: options?.inline || 'nearest'
      });
    }
  }, []);

  const contextValue: SidebarContextValue = {
    state,
    open,
    setOpen,
    toggleSidebar,
    isPeeking,
    isMobile,
    width,
    setWidth,
    side,
    variant,
    collapsible,
    peekable,
    resizable,
    scrollToItem,
    registerItemRef,
    activeView,
    setActiveView
  };

  return (
    <SidebarContext.Provider value={contextValue}>
      <div
        className={`sidebar-root relative flex w-full min-h-full ${className}`}
        data-state={state}
        data-side={side}
        data-collapsible={collapsible}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  );
};

// ---------------------------------------------------------------------------
// 2. Sidebar Main Container
// ---------------------------------------------------------------------------
export interface SidebarProps extends React.HTMLAttributes<HTMLElement> {
  children: React.ReactNode;
  fullScreenOnMobile?: boolean;
}

export const SidebarComponent: React.FC<SidebarProps> = ({
  children,
  className = '',
  fullScreenOnMobile = false,
  ...props
}) => {
  const {
    state,
    open,
    setOpen,
    width,
    isMobile,
    peekable,
    collapsible
  } = useSidebar();

  const [hoverPeeking, setHoverPeeking] = useState(false);
  const hoverTimeoutRef = useRef<any>(null);
  const asideRef = useRef<HTMLElement>(null);

  const isCollapsed = !open;
  const isEffectiveExpanded = open || (peekable && hoverPeeking);

  // Handle peeking on desktop when collapsed (hover + keyboard focus)
  const handleMouseEnter = () => {
    if (isMobile || open || !peekable || collapsible === 'none') return;
    clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      setHoverPeeking(true);
    }, 60);
  };

  const handleMouseLeave = () => {
    if (isMobile || open) return;
    clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      setHoverPeeking(false);
    }, 120);
  };

  // Keyboard accessibility: focus into collapsed rail triggers peek; blur leaves peek
  const handleFocusCapture = () => {
    if (isMobile || open || !peekable || collapsible === 'none') return;
    clearTimeout(hoverTimeoutRef.current);
    setHoverPeeking(true);
  };

  const handleBlurCapture = (e: React.FocusEvent) => {
    if (isMobile || open) return;
    // Check if new focus target is still inside this aside
    if (!asideRef.current?.contains(e.relatedTarget as Node)) {
      clearTimeout(hoverTimeoutRef.current);
      setHoverPeeking(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && hoverPeeking) {
      setHoverPeeking(false);
    }
  };

  // Mobile navigation drawer
  if (isMobile) {
    if (!open) return null;
    return (
      <div className="fixed inset-0 z-50 flex lg:hidden animate-fade-in">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity duration-300"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />

        {/* Drawer Sheet: White Frosted Glass */}
        <aside
          role="dialog"
          aria-modal="true"
          className={`relative z-10 flex flex-col h-full bg-white/95 backdrop-blur-2xl border-r border-zinc-200/90 shadow-2xl transition-all duration-300 ${
            fullScreenOnMobile ? 'w-full' : 'w-72 max-w-[85vw]'
          } ${className}`}
          {...props}
        >
          {children}
        </aside>
      </div>
    );
  }

  // Desktop Rail:
  // Non-reflowing layout spacer: maintains exact width in flex layout.
  // When open: width (e.g. 248px)
  // When collapsed: 68px (STAYS 68px even when peeking, so dashboard does NOT reflow!)
  const layoutPlaceholderWidth = open ? `${width}px` : '68px';
  const isOverlayPeeking = !open && hoverPeeking && peekable;

  return (
    <div
      style={{ width: layoutPlaceholderWidth }}
      className="hidden lg:block relative flex-shrink-0 select-none transition-[width] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]"
    >
      <aside
        ref={asideRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onFocusCapture={handleFocusCapture}
        onBlurCapture={handleBlurCapture}
        onKeyDown={handleKeyDown}
        style={{
          width: isEffectiveExpanded ? `${width}px` : '68px'
        }}
        data-state={isEffectiveExpanded ? 'expanded' : 'collapsed'}
        data-peeking={hoverPeeking ? 'true' : 'false'}
        className={`flex flex-col h-[calc(100vh-3.5rem)] sticky top-14 transition-[width,box-shadow,transform] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          isOverlayPeeking
            ? 'absolute top-0 left-0 z-40 glass-sidebar-white shadow-2xl shadow-zinc-950/15 border-r border-zinc-300/90'
            : 'relative z-30 glass-sidebar-white border-r border-zinc-200/80'
        } ${className}`}
        {...props}
      >
        {/* Subtle accent highlight while peeking */}
        {isOverlayPeeking && (
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500 z-50 animate-pulse" />
        )}
        {children}
      </aside>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 3. Subcomponents: Header, Content, Footer, Groups, Menus
// ---------------------------------------------------------------------------

export const SidebarHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  children,
  className = '',
  ...props
}) => {
  return (
    <div
      className={`px-3 py-3.5 border-b border-zinc-200/70 flex items-center justify-between gap-2 flex-shrink-0 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

export const SidebarContent: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  children,
  className = '',
  ...props
}) => {
  return (
    <div
      className={`flex-1 overflow-y-auto overflow-x-hidden custom-scroll-light p-2.5 space-y-3 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

export const SidebarFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  children,
  className = '',
  ...props
}) => {
  return (
    <div
      className={`p-2.5 border-t border-zinc-200/70 bg-white/40 flex items-center justify-between flex-shrink-0 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

export const SidebarGroup: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  children,
  className = '',
  ...props
}) => {
  return (
    <div className={`space-y-1 ${className}`} {...props}>
      {children}
    </div>
  );
};

export const SidebarGroupLabel: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  children,
  className = '',
  ...props
}) => {
  const { open, isPeeking } = useSidebar();
  const isExpanded = open || isPeeking;

  if (!isExpanded) {
    return (
      <div className="my-2 border-t border-zinc-200/60 mx-2" aria-hidden="true" />
    );
  }

  return (
    <div
      className={`px-3 py-1 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider select-none truncate ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

export const SidebarMenu: React.FC<React.HTMLAttributes<HTMLUListElement>> = ({
  children,
  className = '',
  ...props
}) => {
  return (
    <ul className={`space-y-0.5 list-none p-0 m-0 ${className}`} {...props}>
      {children}
    </ul>
  );
};

export const SidebarMenuItem: React.FC<React.HTMLAttributes<HTMLLIElement>> = ({
  children,
  className = '',
  ...props
}) => {
  return (
    <li className={`relative ${className}`} {...props}>
      {children}
    </li>
  );
};

// ---------------------------------------------------------------------------
// 4. Sidebar.MenuButton
// ---------------------------------------------------------------------------
export interface SidebarMenuButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: React.ReactNode;
  active?: boolean;
  tooltip?: string;
  itemId?: string;
  badge?: React.ReactNode;
  chevron?: boolean | React.ReactNode;
  size?: 'sm' | 'base';
  href?: string;
}

export const SidebarMenuButton: React.FC<SidebarMenuButtonProps> = ({
  children,
  icon,
  active = false,
  tooltip,
  itemId,
  badge,
  chevron,
  size = 'base',
  className = '',
  onClick,
  ...props
}) => {
  const { open, isPeeking, registerItemRef } = useSidebar();
  const isExpanded = open || isPeeking;
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (itemId && buttonRef.current) {
      registerItemRef(itemId, buttonRef.current);
    }
  }, [itemId, registerItemRef]);

  const buttonContent = (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      title={!isExpanded ? tooltip || (typeof children === 'string' ? children : undefined) : undefined}
      className={`w-full flex items-center ${
        isExpanded ? 'justify-between px-3' : 'justify-center px-0'
      } ${size === 'sm' ? 'py-1.5 min-h-[34px]' : 'py-2 min-h-[38px]'} rounded-xl text-left transition-all duration-150 group relative font-sans text-xs select-none ${
        active
          ? 'bg-zinc-100 text-zinc-950 font-semibold shadow-xs border border-zinc-200/80'
          : 'text-zinc-700 hover:text-zinc-950 hover:bg-zinc-100/70 border border-transparent'
      } ${className}`}
      {...props}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        {icon && (
          <span
            className={`flex-shrink-0 transition-transform group-hover:scale-105 ${
              active ? 'text-zinc-900' : 'text-zinc-500 group-hover:text-zinc-800'
            }`}
          >
            {icon}
          </span>
        )}
        {isExpanded && (
          <span className="truncate tracking-normal text-[13px] leading-tight">
            {children}
          </span>
        )}
      </div>

      {isExpanded && (
        <div className="flex items-center gap-1.5 flex-shrink-0 ml-1">
          {badge && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-zinc-200/70 text-zinc-700 font-mono font-medium">
              {badge}
            </span>
          )}
          {chevron === true ? (
            <ChevronRight className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-600 transition-transform" />
          ) : (
            chevron
          )}
        </div>
      )}

      {/* Subtle indicator bar for active item */}
      {active && (
        <span className="absolute left-0 top-2 bottom-2 w-1 bg-amber-500 rounded-r-full shadow-xs shadow-amber-500/30" />
      )}
    </button>
  );

  return <SidebarMenuItem>{buttonContent}</SidebarMenuItem>;
};

// ---------------------------------------------------------------------------
// 5. Sidebar.Collapsible Submenu
// ---------------------------------------------------------------------------
export interface SidebarCollapsibleProps {
  children: React.ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onOpenChangeComplete?: (open: boolean) => void;
  autoScrollOnOpen?: boolean;
}

interface CollapsibleContextValue {
  isOpen: boolean;
  toggleOpen: () => void;
  autoScrollOnOpen?: boolean;
}

const CollapsibleContext = createContext<CollapsibleContextValue | null>(null);

export const SidebarCollapsible: React.FC<SidebarCollapsibleProps> = ({
  children,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  onOpenChangeComplete,
  autoScrollOnOpen = false
}) => {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : internalOpen;

  const toggleOpen = () => {
    const next = !isOpen;
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
    if (onOpenChangeComplete) {
      setTimeout(() => onOpenChangeComplete(next), 200);
    }
  };

  return (
    <CollapsibleContext.Provider value={{ isOpen, toggleOpen, autoScrollOnOpen }}>
      <div className="sidebar-collapsible">{children}</div>
    </CollapsibleContext.Provider>
  );
};

export const SidebarCollapsibleTrigger: React.FC<{
  children?: React.ReactNode;
  render?: React.ReactNode;
}> = ({ children, render }) => {
  const context = useContext(CollapsibleContext);
  if (!context) return null;

  if (render && React.isValidElement(render)) {
    const renderElement = render as React.ReactElement<{ onClick?: (e: any) => void }>;
    return React.cloneElement(renderElement, {
      onClick: (e: any) => {
        renderElement.props?.onClick?.(e);
        context.toggleOpen();
      }
    });
  }

  return (
    <button
      type="button"
      onClick={context.toggleOpen}
      className="w-full text-left"
    >
      {children}
    </button>
  );
};

export const SidebarCollapsibleContent: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = '' }) => {
  const context = useContext(CollapsibleContext);
  const contentRef = useRef<HTMLDivElement>(null);
  const { open, isPeeking } = useSidebar();
  const isExpanded = open || isPeeking;

  useEffect(() => {
    if (context?.isOpen && context.autoScrollOnOpen && contentRef.current) {
      contentRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [context?.isOpen, context?.autoScrollOnOpen]);

  if (!context?.isOpen || !isExpanded) return null;

  return (
    <div
      ref={contentRef}
      className={`pl-6 pr-1 pt-1 pb-1 space-y-0.5 border-l border-zinc-200/80 ml-4 my-0.5 animate-slide-down ${className}`}
    >
      {children}
    </div>
  );
};

export const SidebarMenuSub: React.FC<React.HTMLAttributes<HTMLUListElement>> = ({
  children,
  className = '',
  ...props
}) => {
  return (
    <ul className={`space-y-0.5 list-none p-0 m-0 ${className}`} {...props}>
      {children}
    </ul>
  );
};

export const SidebarMenuSubButton: React.FC<{
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  badge?: React.ReactNode;
  className?: string;
}> = ({ children, active = false, onClick, badge, className = '' }) => {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
          active
            ? 'bg-zinc-100 text-zinc-950 font-semibold'
            : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100/60'
        } ${className}`}
      >
        <span className="truncate">{children}</span>
        {badge && (
          <span className="text-[10px] px-1 py-0.2 rounded bg-zinc-200/60 text-zinc-600 font-mono">
            {badge}
          </span>
        )}
      </button>
    </li>
  );
};

export const SidebarMenuChevron: React.FC<{ className?: string }> = ({
  className = ''
}) => {
  const context = useContext(CollapsibleContext);
  const isOpen = context?.isOpen || false;

  return (
    <ChevronDown
      className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 ${
        isOpen ? 'transform rotate-180 text-zinc-700' : ''
      } ${className}`}
    />
  );
};

export const SidebarMenuBadge: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = '' }) => {
  return (
    <span
      className={`text-[10px] px-1.5 py-0.2 rounded-md bg-amber-500/10 text-amber-700 font-mono font-medium ${className}`}
    >
      {children}
    </span>
  );
};

// ---------------------------------------------------------------------------
// 6. Sliding Views (for Switching Surfaces: Main ↔ Channel ↔ POD etc.)
// ---------------------------------------------------------------------------
export interface SidebarSlidingViewsProps {
  children: React.ReactNode;
  activeKey: string;
  direction?: 'left' | 'right';
  className?: string;
}

export const SidebarSlidingViews: React.FC<SidebarSlidingViewsProps> = ({
  children,
  activeKey,
  direction = 'left',
  className = ''
}) => {
  return (
    <div className={`relative overflow-hidden w-full h-full ${className}`}>
      {React.Children.map(children, (child) => {
        if (!React.isValidElement(child)) return null;
        const childElement = child as React.ReactElement<{ value?: string }>;
        const isCurrent = childElement.props.value === activeKey;
        return (
          <div
            aria-hidden={!isCurrent}
            className={`w-full h-full transition-all duration-300 ${
              isCurrent
                ? 'opacity-100 translate-x-0 relative'
                : direction === 'left'
                ? 'opacity-0 -translate-x-4 absolute inset-0 pointer-events-none'
                : 'opacity-0 translate-x-4 absolute inset-0 pointer-events-none'
            }`}
          >
            {child}
          </div>
        );
      })}
    </div>
  );
};

export const SidebarSlidingView: React.FC<{
  value: string;
  children: React.ReactNode;
}> = ({ children }) => {
  return <div className="w-full h-full flex flex-col">{children}</div>;
};

// ---------------------------------------------------------------------------
// 7. Footer Trigger & Resize Handle
// ---------------------------------------------------------------------------
export const SidebarTrigger: React.FC<{
  className?: string;
  tooltip?: string;
}> = ({ className = '', tooltip = 'Toggle sidebar' }) => {
  const { open, toggleSidebar, isPeeking } = useSidebar();
  const isExpanded = open || isPeeking;

  return (
    <button
      type="button"
      onClick={toggleSidebar}
      title={tooltip}
      aria-label={isExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
      className={`p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200/60 transition-colors ${className}`}
    >
      {isExpanded ? (
        <PanelLeftClose className="w-4 h-4" />
      ) : (
        <PanelLeftOpen className="w-4 h-4" />
      )}
    </button>
  );
};

export const SidebarClose: React.FC<{
  className?: string;
}> = ({ className = '' }) => {
  const { setOpen } = useSidebar();

  return (
    <button
      type="button"
      onClick={() => setOpen(false)}
      aria-label="Close navigation"
      className={`p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-colors ${className}`}
    >
      <X className="w-4 h-4" />
    </button>
  );
};

export const SidebarResizeHandle: React.FC<{
  minWidth?: number;
  maxWidth?: number;
}> = ({ minWidth = 190, maxWidth = 380 }) => {
  const { width, setWidth, setOpen } = useSidebar();
  const isDraggingRef = useRef(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const newWidth = Math.max(minWidth, Math.min(maxWidth, moveEvent.clientX));
      setWidth(newWidth);
      if (newWidth <= minWidth + 10) {
        setOpen(false);
      } else {
        setOpen(true);
      }
    };

    const onMouseUp = () => {
      isDraggingRef.current = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  return (
    <div
      onMouseDown={handleMouseDown}
      className="absolute top-0 right-0 bottom-0 w-1.5 cursor-col-resize hover:bg-amber-500/30 transition-colors group z-50 select-none"
      title="Drag to resize sidebar"
    >
      <div className="w-0.5 h-full mx-auto bg-transparent group-hover:bg-amber-500 transition-colors" />
    </div>
  );
};

export const SidebarLoading: React.FC = () => {
  return (
    <div className="p-3 space-y-3 animate-pulse">
      <div className="h-4 bg-zinc-200 rounded w-1/3 mb-2" />
      <div className="space-y-1.5">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="flex items-center gap-2.5 px-3 py-2">
            <div className="w-4 h-4 rounded bg-zinc-200 flex-shrink-0" />
            <div className="h-3.5 bg-zinc-200 rounded w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Compound Component Namespace Export
// ---------------------------------------------------------------------------
export const Sidebar = Object.assign(SidebarComponent, {
  Provider: SidebarProvider,
  Header: SidebarHeader,
  Content: SidebarContent,
  Footer: SidebarFooter,
  Group: SidebarGroup,
  GroupLabel: SidebarGroupLabel,
  Menu: SidebarMenu,
  MenuItem: SidebarMenuItem,
  MenuButton: SidebarMenuButton,
  Collapsible: SidebarCollapsible,
  CollapsibleTrigger: SidebarCollapsibleTrigger,
  CollapsibleContent: SidebarCollapsibleContent,
  MenuSub: SidebarMenuSub,
  MenuSubButton: SidebarMenuSubButton,
  MenuChevron: SidebarMenuChevron,
  MenuBadge: SidebarMenuBadge,
  SlidingViews: SidebarSlidingViews,
  SlidingView: SidebarSlidingView,
  Trigger: SidebarTrigger,
  Close: SidebarClose,
  ResizeHandle: SidebarResizeHandle,
  Loading: SidebarLoading
});

/**
 * Reusable package aliases conforming to the @inneranimalmedia/ecommerce-cms-agentsam spec
 */
export const ResponsiveSidebar = SidebarComponent;
export const SidebarItem = SidebarMenuButton;
