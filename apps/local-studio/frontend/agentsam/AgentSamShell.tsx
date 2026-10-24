import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { isStudioAdminPath } from "../../shared/studio-admin-routes.mjs";
import { Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import { Nav, type NavMode, type NavTheme, type NavValue } from '@inneranimalmedia/agentsam-nav';
import { MessageSquare as MessageSquareIcon, BookOpen, Film, Database, Folder, Globe, Home, Layers3, Settings, Pin, Files, Copy, PanelRight, LogIn, PawPrint, Box, Search, Bell, ShoppingBag, Tag, BarChart3, Megaphone, Users, Mail, CircleHelp } from "lucide-react";
import { Toaster, toast } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { CommandPalette } from '@/components/workbench/command-palette';
import { SideStage } from '@/components/workbench/side-stage';
import { SplitHandle } from '@/components/shell/split-handle';
import { CliDrawer } from '@/components/shell/cli-drawer';
import { OfflineBanner } from '@/components/shell/offline-banner';
import { useWorkStore } from '@/lib/work/store';
import { useCurrentUser } from '@/lib/auth/use-current-user';
import { registerOfflineShell } from '@/lib/offline/register-sw';
import { brand } from './brand';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import './shell.css';
import './platform-console.css';
import { AnnotationHelper } from './AnnotationHelper';
import { IconAction } from '@/components/ui/icon-action';
import { DesktopIdentityPortal } from '@/components/desktop/DesktopIdentityPortal';
import { DesktopStartupOverlay } from '@/components/desktop/DesktopStartupOverlay';
import { ToolPermissionProvider } from '@/components/workbench/ToolPermissionProvider';
import { isPackagedDesktop, listenDeepLinks, emitTauriEvent, listenTauriEvent, toggleAgentSamPet } from "@/lib/desktop/tauri";
import { formatChromeTabShare, parseChromeTabShare, type ChromeTabShare } from '@/lib/desktop/chrome-share';
import { readShellAppearancePreference } from '@inneranimalmedia/agentsam-settings';
import { AgentSamPetTrigger } from './AgentSamPetTrigger';
import { applyShellAppearance, applyTheme, readTheme, type ShellAppearancePreference } from '@/lib/work/theme';

const accents = ['#8B5CF6', '#2563EB', '#0D9488', '#BE185D'];

/** App adapter: routing, persistence and business state stay out of agentsam-nav. */
export function AgentSamShell({ embedded = false }: { embedded?: boolean } = {}) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const state = useWorkStore();
  const user = useCurrentUser();
  const [mode, setMode] = useState<NavMode>('work');
  const [theme, setTheme] = useState<NavTheme>('dark');
  const [accent, setAccent] = useState(accents[0]);
  const appearanceRef = useRef<ShellAppearancePreference | null>(null);
  const [sharing, setSharing] = useState(false);
  const [identityOpen, setIdentityOpen] = useState(false);
  const [accountAvatarUrl, setAccountAvatarUrl] = useState<string | null>(null);
  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false);
  const [avatarDraft, setAvatarDraft] = useState('');
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [globalAssistantFocused, setGlobalAssistantFocused] = useState(false);
  const [globalAssistantWidth, setGlobalAssistantWidth] = useState(390);
  const hydratedRef = useRef(state.hydrated);
  const pendingChromeShares = useRef<ChromeTabShare[]>([]);
  hydratedRef.current = state.hydrated;
  useEffect(() => {
    if (!user?.id || isPackagedDesktop()) return;
    const controller = new AbortController();
    void fetch('/api/settings/account-avatar', { credentials: 'same-origin', signal: controller.signal })
      .then(async (res) => res.ok ? res.json() as Promise<{avatar_url?: string | null}> : null)
      .then(data => { if (!controller.signal.aborted) setAccountAvatarUrl(data?.avatar_url || null); })
      .catch(() => { /* Auth image remains a usable fallback when preferences cannot be read. */ });
    return () => controller.abort();
  }, [user?.id]);
  const trail = state.trails.find((item) => item.id === state.activeTrailId);
  const project = state.projects.find((item) => item.id === trail?.projectId);
  const isConversation = pathname === '/agentsam' || pathname === '/admin/agentsam' || pathname.startsWith('/chats');
  const isCadRoute = pathname === '/cad' || pathname.startsWith('/cad/') || pathname === '/admin/cad' || pathname.startsWith('/admin/cad/');
  const isSettings = pathname === '/settings' || pathname.startsWith('/settings/');
  // The platform owns its shell; product-owned /admin pages navigate into
  // the installed Ecommerce application without recreating product routers.
  const go = (to: string) => {
    if (to.startsWith('/admin/') && !isStudioAdminPath(to.split('?')[0])) {
      if (isPackagedDesktop()) window.location.hash = '#/apps/ecommerce-cms-agentsam?page=' + encodeURIComponent(to);
      else window.location.assign(to);
      return;
    }
    if (isPackagedDesktop()) {
      const normalized = to.startsWith('/') ? to : '/' + to;
      const nextHash = '#' + normalized;
      if (window.location.hash !== nextHash) window.location.hash = nextHash;
      return;
    }
    void navigate({ to } as never);
  };
  const flushChromeShares = () => {
    if (!hydratedRef.current) return;
    const store = useWorkStore.getState();
    const shares = pendingChromeShares.current.splice(0);
    if (!shares.length) return;
    const trailId = store.activeTrailId || store.startTrail();
    const context = shares.map(formatChromeTabShare).join('\n\n');
    store.setDraft(trailId, [store.drafts[trailId]?.trimEnd(), context].filter(Boolean).join('\n\n'));
    window.location.hash = '#/agentsam';
    const first = shares[0];
    toast(`Added ${shares.length > 1 ? `${shares.length} pages` : `“${first.title || new URL(first.url).hostname}”`} to the draft`);
  };

  useEffect(() => {
    void useWorkStore.persist.rehydrate();
    registerOfflineShell();
    const stop = useWorkStore.persist.onFinishHydration(() => useWorkStore.getState().setHydrated(true));
    if (useWorkStore.persist.hasHydrated()) useWorkStore.getState().setHydrated(true);
    return stop;
  }, []);

  useEffect(() => {
    if (!isPackagedDesktop()) return;
    let active = true;
    let dispose: (() => void) | undefined;
    void listenDeepLinks((raw) => {
      if (!active) return;
      const share = parseChromeTabShare(raw);
      if (!share) return;
      pendingChromeShares.current.push(share);
      flushChromeShares();
    }).then((unlisten) => {
      if (active) dispose = unlisten;
      else unlisten();
    }).catch(() => {
      // Hosted/browser surfaces have no native deep-link transport.
    });
    return () => { active = false; dispose?.(); };
  }, []);

  // Shared assistant entrypoint: the native PET, shell icon, and contextual tools
  // activate the existing composer without navigating away from the active work.
  useEffect(() => {
    const activate = () => {
      if (pathname === '/agentsam' || pathname.startsWith('/chats')) {
        window.requestAnimationFrame(() =>
          document.querySelector<HTMLTextAreaElement>('.agentsam-conversation-dock textarea')?.focus());
        return;
      }
      const work = useWorkStore.getState();
      work.openSideTab('chat');
      work.setSideOpen(true);
    };
    window.addEventListener('agentsam:assistant:activate', activate);
    let active = true;
    let dispose: (() => void) | undefined;
    if (isPackagedDesktop()) {
      void listenTauriEvent("agentsam:pet:activate", () => {
        if (active) activate();
      }).then((unlisten) => {
        if (active) dispose = unlisten || undefined;
        else unlisten?.();
      }).catch(() => {});
    }
    return () => {
      active = false;
      dispose?.();
      window.removeEventListener('agentsam:assistant:activate', activate);
    };
  }, [pathname]);

  const petState = state.activeTrailId && state.streamingIds.includes(state.activeTrailId) ? "working" : "idle";
  useEffect(() => {
    if (!isPackagedDesktop()) return;
    void emitTauriEvent("agentsam:pet:state", { state: petState }).catch(() => {});
  }, [petState]);

  useEffect(() => {
    flushChromeShares();
  }, [state.hydrated]);

  useEffect(() => {
    const applyPreference = (preference: ShellAppearancePreference | null) => {
      appearanceRef.current = preference;
      if (preference) {
        const resolved = applyShellAppearance(preference);
        setTheme(resolved);
        setAccent(preference.accent);
        return;
      }
      const storedTheme = readTheme();
      applyTheme(storedTheme);
      setTheme(storedTheme.monacoBase === 'vs' ? 'light' : 'dark');
      setAccent(storedTheme.tokens.accent);
    };

    applyPreference(readShellAppearancePreference());

    const onAppearance = (event: Event) => {
      const detail = (event as CustomEvent<Partial<ShellAppearancePreference>>).detail;
      if (!detail) return;
      if (detail.theme !== 'dark' && detail.theme !== 'light' && detail.theme !== 'system') return;
      if (typeof detail.accent !== 'string' || !/^#[0-9a-f]{6}$/i.test(detail.accent)) return;
      applyPreference({ theme: detail.theme, accent: detail.accent });
    };
    const media =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-color-scheme: light)')
        : null;
    const onSystemChange = () => {
      if (appearanceRef.current?.theme === 'system') applyPreference(appearanceRef.current);
    };

    window.addEventListener('agentsam:shell-appearance', onAppearance);
    media?.addEventListener('change', onSystemChange);
    return () => {
      window.removeEventListener('agentsam:shell-appearance', onAppearance);
      media?.removeEventListener('change', onSystemChange);
    };
  }, []);
  useEffect(() => {
    const onNavigate = (event: Event) => {
      const detail = (event as CustomEvent<{ to?: string; params?: Record<string, string> }>).detail;
      if (!detail?.to) return;
      if (isPackagedDesktop() && !detail.params) {
        const normalized = detail.to.startsWith('/') ? detail.to : '/' + detail.to;
        const nextHash = '#' + normalized;
        if (window.location.hash !== nextHash) window.location.hash = nextHash;
        return;
      }
      void navigate({ to: detail.to, params: detail.params } as never);
    };
    const onIdentityOpen = () => setIdentityOpen(true);
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key === '`') { event.preventDefault(); useWorkStore.getState().toggleTerminal(); }
      if (event.key.toLowerCase() === 'n' && !event.shiftKey) { event.preventDefault(); useWorkStore.getState().startTrail(); void navigate({ to: '/admin/agentsam' as never }); }
    };
    const online = () => { void useWorkStore.getState().flushOfflineQueue(); };
    window.addEventListener('agentsam:navigate', onNavigate);
    window.addEventListener('agentsam:identity-open', onIdentityOpen);
    window.addEventListener('keydown', onKey);
    window.addEventListener('online', online);
    if (navigator.onLine) online();
    return () => {
      window.removeEventListener('agentsam:navigate', onNavigate);
      window.removeEventListener('agentsam:identity-open', onIdentityOpen);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('online', online);
    };
  }, [navigate]);
  // Legacy settingsOpen callers → real Settings product routes (no jank dialog).
  useEffect(() => {
    if (!state.settingsOpen) return;
    state.setSettingsOpen(false);
    void navigate({ to: '/settings/general' as never });
  }, [state.settingsOpen, state, navigate]);

  const value: NavValue = {
    brand, mode, onModeChange: setMode,
    project: project ? { id: project.id, name: project.name } : undefined,
    conversation: trail ? { id: trail.id, title: trail.title } : undefined,
    projects: state.projects.map((item) => ({ id: item.id, name: item.name })),
    conversations: state.trails.map((item) => ({ id: item.id, title: item.title, projectId: item.projectId, pinned: item.pinned })),
    account: user ? { id: user.id, name: user.isDevFallback ? 'Local account' : user.displayName ?? 'Account', avatar: accountAvatarUrl || user.profileImageUrl || undefined } : undefined,
    destinations: [
      { id: 'home', label: 'Home', icon: <Home />, href: '/admin/home', active: pathname === '/' || pathname === '/admin/home' },
      { id: 'projects', label: 'Projects', icon: <Folder />, href: '/admin/projects', active: pathname === '/admin/projects' || pathname.startsWith('/admin/projects/') || pathname === '/projects' || pathname.startsWith('/projects/') },
      { id: 'library', label: 'Library', icon: <BookOpen />, href: '/artifacts', active: pathname === '/artifacts' },
      { id: 'tickets', label: 'Tickets', icon: <Files />, href: '/tickets', active: pathname === '/tickets' },
      { id: 'sites', label: 'Sites / Online Store', icon: <Globe />, href: '/sites', active: pathname === '/sites', children: [
        { id: 'sites-open', label: 'Sites workspace', href: '/sites', icon: <Globe /> },
        { id: 'pages', label: 'Pages', href: '/admin/pages', icon: <Files /> },
        { id: 'theme-editor', label: 'Theme Editor', href: '/admin/theme-editor?slug=home', icon: <Layers3 /> },
        { id: 'site-preferences', label: 'Site preferences', href: '/admin/preferences', icon: <Settings /> },
      ] },
      { id: 'products', label: 'Products', icon: <ShoppingBag />, children: [
        { id: 'all-products', label: 'All products', href: '/admin/products', icon: <Box /> },
        { id: 'create-product', label: 'Create product', href: '/admin/products/create', icon: <ShoppingBag /> },
        { id: 'inventory', label: 'Inventory', href: '/admin/inventory', icon: <Database /> },
        { id: 'orders', label: 'Orders', href: '/admin/orders', icon: <ShoppingBag /> },
        { id: 'discounts', label: 'Discounts', href: '/admin/discounts', icon: <Tag /> },
      ] },
      { id: 'growth', label: 'Growth', icon: <Megaphone />, href: '/admin/growth' },
      { id: 'content', label: 'Content', icon: <Files />, href: '/admin/content' },
      { id: 'analytics', label: 'Analytics', icon: <BarChart3 />, children: [
        { id: 'analytics-overview', label: 'Overview', href: '/admin/analytics/overview' },
        { id: 'analytics-finance', label: 'Finance', href: '/admin/analytics/finance' },
        { id: 'analytics-health', label: 'Health', href: '/admin/analytics/health' },
      ] },
      { id: 'audience', label: 'Audience', icon: <Users />, children: [
        { id: 'subscribers', label: 'Subscribers', href: '/admin/subscribers' },
      ] },
      { id: 'apps', label: 'Apps', icon: <Layers3 aria-hidden="true" />, children: [
        { id: 'agentsam', label: 'AgentSam', icon: <MessageSquareIcon />, href: '/admin/agentsam', active: isConversation },
        { id: 'cad', label: 'CAD Creator', icon: <Box />, href: '/admin/cad', active: isCadRoute },
        { id: 'moviemode', label: 'MovieMode', icon: <Film />, href: '/admin/moviemode', active: pathname === '/admin/moviemode' || pathname.startsWith('/admin/moviemode/') || pathname === '/media' || pathname.startsWith('/media/') },
        { id: 'email', label: 'Email', icon: <Mail />, href: '/admin/email' },
      ] },
      { id: 'settings', label: 'Settings', icon: <Settings />, href: '/settings/general', active: isSettings },
      ...(isPackagedDesktop() ? [{
        id: 'desktop-pet', label: 'Desktop pet', icon: <PawPrint aria-hidden="true" />,
        onSelect: () => { void toggleAgentSamPet().then((visible) => toast.success(visible ? 'AgentSam pet is on your desktop' : 'AgentSam pet hidden')).catch(() => toast.error('Desktop pet could not be opened')); },
      }] : []),
    ],
    onNavigate: go,
    onCreateConversation: isConversation ? () => { state.startTrail(); go('/agentsam'); } : undefined,
    onSelectConversation: (id) => { state.setActiveTrail(id); go('/agentsam'); },
    onSelectProject: (id) => { state.setActiveProject(id); go('/admin/projects'); },
    onPinConversation: state.pinTrail, onRenameConversation: state.renameTrail,
    onShare: trail ? () => setSharing(true) : undefined,
    accountActions: [
      ...(isPackagedDesktop() ? [{ id: 'sign-in', label: 'Sign in to AgentSam', icon: <LogIn />, onSelect: () => setIdentityOpen(true) }] : []),
      { id: 'profile-image', label: 'Profile image', icon: <PawPrint />, onSelect: () => { setAvatarDraft(accountAvatarUrl || user?.profileImageUrl || ''); setAvatarDialogOpen(true); } },
      { id: 'settings', label: 'Account settings', icon: <Settings />, onSelect: () => go('/settings/general') },
    ],
    projectActions: [
      { id: 'home', label: 'Project home', icon: <Folder />, onSelect: () => go('/admin/projects') },
      { id: 'files', label: 'Project files', icon: <Files />, onSelect: () => state.openSideTab('files') },
    ],
    conversationActions: trail ? [
      { id: 'files', label: 'View files in conversation', icon: <Files />, onSelect: () => state.openSideTab('files') },
      { id: 'pin', label: trail.pinned ? 'Unpin conversation' : 'Pin conversation', icon: <Pin />, onSelect: () => state.pinTrail(trail.id) },
      { id: 'copy', label: 'Copy conversation', icon: <Copy />, onSelect: () => { void navigator.clipboard.writeText(trail.messages.map((item) => `${item.role}\n${item.content}`).join('\n\n')).then(() => toast('Conversation copied'), () => toast('Could not copy conversation')); } },
    ] : [],
    resourceActions: [
      { id: 'outputs', label: 'Outputs', icon: <BookOpen />, onSelect: () => state.openSideTab('artifacts') },
      { id: 'files', label: 'Files & sources', icon: <Files />, onSelect: () => state.openSideTab('files') },
      { id: 'site', label: 'Create or edit a site', icon: <Globe />, onSelect: () => go('/cms') },
    ],
  };
  return <ToolPermissionProvider><TooltipProvider><Nav.Provider value={value} theme={theme} accentColor={accent} defaultOpen peekable>
    <Nav.Scope className="agentsam-shell platform-console" data-agentsam-app-shell="local-studio" data-platform-console="true" data-conversation={isConversation ? "true" : "false"} data-embedded={embedded ? "true" : undefined}>
      {!embedded ? <Nav.Sidenav /> : null}<div className="agentsam-main">
        {!embedded && !isConversation ? <Nav.Topbar className="platform-console-topbar">
          <Nav.Trigger aria-label="Toggle sidebar" />
          <button type="button" className="platform-console-search" aria-label="Search pages and tools" title="Search pages and tools" onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))}><Search size={17} /><span>Search pages and tools</span><kbd>⌘K</kbd></button>
          <Nav.TopbarSpacer />
          <AgentSamPetTrigger state={petState} onActivate={() => window.dispatchEvent(new Event('agentsam:assistant:activate'))} />
          <IconAction className="as-nav-button" label="Help & documentation" hint="Open AgentSam documentation" onClick={() => go('/docs')}><CircleHelp size={18} /></IconAction>
          <button type="button" className="as-nav-button" title="Notifications" aria-label="Notifications" onClick={() => go('/tickets')}><Bell size={17} /><span className="sr-only">View notifications in Tickets</span></button>
          <Nav.AccountSwitcher />
        </Nav.Topbar> : null}
        <OfflineBanner />
        <div className="platform-console-stage" data-assistant-focused={!isConversation && globalAssistantFocused && state.sideOpen ? "true" : "false"}>
          <main className="agentsam-route"><Outlet /></main>
          {!isConversation && state.sideOpen ? <>
            {!globalAssistantFocused && <SplitHandle label="Resize AgentSam panel" onDrag={(delta) => setGlobalAssistantWidth((width) => Math.max(320, Math.min(720, width - delta)))} onDoubleClick={() => setGlobalAssistantWidth(390)} />}
            <aside className="platform-console-assistant" aria-label="AgentSam Side Assistant"
              style={{ "--platform-assistant-width": globalAssistantWidth + "px" } as CSSProperties}>
              <SideStage workFocused={globalAssistantFocused} onFocusToggle={() => setGlobalAssistantFocused((focused) => !focused)} />
            </aside>
          </> : null}
        </div>

      </div><CliDrawer /><CommandPalette />
      <Dialog open={sharing} onOpenChange={setSharing}><DialogContent><DialogTitle>Share conversation</DialogTitle><DialogDescription>Copy this conversation as text to share it. This does not create a public link.</DialogDescription><button type="button" className="as-nav-button" onClick={() => { if (!trail) return; void navigator.clipboard.writeText(trail.messages.map((item) => `${item.role}\n${item.content}`).join('\n\n')).then(() => { toast('Conversation copied'); setSharing(false); }, () => toast('Could not copy conversation')); }}><Copy size={18} />Copy conversation</button></DialogContent></Dialog>
      <Dialog open={avatarDialogOpen} onOpenChange={setAvatarDialogOpen}><DialogContent>
        <DialogTitle>Profile image</DialogTitle>
        <DialogDescription>Select an image from your authorized Brand/Media assets, then paste its image URL here. Saved against your signed-in user, not as an installation default.</DialogDescription>
        <label className="flex flex-col gap-1 text-sm">Image URL
          <input type="text" value={avatarDraft} onChange={event => setAvatarDraft(event.target.value)}
            className="rounded border border-border bg-background px-3 py-2" placeholder="/brand/... or https://..." />
        </label>
        <button type="button" className="as-nav-button" disabled={avatarSaving} onClick={() => {
          setAvatarSaving(true);
          void fetch('/api/settings/account-avatar', {
            method: 'PUT', credentials: 'same-origin',
            headers: { 'content-type': 'application/json' }, body: JSON.stringify({ avatar_url: avatarDraft.trim() || null }),
          }).then(async response => {
            if (!response.ok) throw Error('Could not save profile image');
            const data = await response.json() as { avatar_url: string | null };
            setAccountAvatarUrl(data.avatar_url);
            setAvatarDialogOpen(false);
            toast.success('Profile image saved');
          }).catch(() => toast.error('Profile image could not be saved')).finally(() => setAvatarSaving(false));
        }}>{avatarSaving ? 'Saving…' : 'Save profile image'}</button>
      </DialogContent></Dialog>
      <DesktopIdentityPortal open={identityOpen} onOpenChange={setIdentityOpen} />
      <DesktopStartupOverlay />
      <AnnotationHelper />
      <Toaster theme={theme === 'light' ? 'light' : 'dark'} position="bottom-center" />
    </Nav.Scope>
  </Nav.Provider></TooltipProvider></ToolPermissionProvider>;
}

export function SidePanelToggle() {
  const open = useWorkStore((state) => state.sideOpen);
  const toggle = () => {
    const state = useWorkStore.getState();
    if (state.sideOpen) state.setSideOpen(false);
    else if (state.sideTabs.length) state.setSideOpen(true);
    else state.openSideTab('browser');
  };
  return <button type="button" className="as-nav-button" aria-label="Toggle Side Panel" aria-pressed={open} title="Side Panel" onClick={toggle}><PanelRight size={18} /></button>;
}
