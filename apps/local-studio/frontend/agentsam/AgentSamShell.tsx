import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { isStudioAdminPath } from "../../shared/studio-admin-routes.mjs";
import { Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import { Nav, type NavMode, type NavTheme, type NavValue, type NavDestination, type NavTokens, type NavStateStore } from '@inneranimalmedia/agentsam-nav';
import { projectStudioShellAppearance, applyStudioShellAppearance } from '../../shared/shell-appearance.mjs';
import { MessageSquare as MessageSquareIcon, BookOpen, Film, Database, Folder, Globe, Home, Layers3, Settings, Pin, Files, Copy, PanelRight, LogIn, LogOut, PawPrint, Box, Search, Bell, ShoppingBag, Package, Store, Tag, Ticket, TrendingUp, BarChart3, Users, Mail, CircleHelp } from "lucide-react";
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
import { invokeStudioService, isPackagedDesktop, listenDeepLinks, emitTauriEvent, listenTauriEvent, toggleAgentSamPet } from "@/lib/desktop/tauri";
import { formatChromeTabShare, parseChromeTabShare, type ChromeTabShare } from '@/lib/desktop/chrome-share';
import { readShellAppearancePreference } from '@inneranimalmedia/agentsam-settings';
import { AgentSamPetTrigger } from './AgentSamPetTrigger';
import { NotificationsMenu } from './NotificationsMenu';
import { signOut } from '@/lib/auth/client';
import { hasGateSessionMarker } from '@/lib/auth/gate-session-marker';
import { applyShellAppearance, applyTheme, readTheme, type ShellAppearancePreference } from '@/lib/work/theme';
import { applyActiveStudioTheme } from '@/lib/themes/inventory';
import { THEME_PROJECTS_CHANGED } from '@/lib/themes/projects';

async function accountAvatarRequest(options: RequestInit = {}) {
  if (!isPackagedDesktop()) return fetch('/api/settings/account-avatar', options);
  const result = await invokeStudioService({
    operation: 'settings', path: '/api/settings/account-avatar',
    method: options.method === 'PUT' ? 'PUT' : 'GET',
    body: typeof options.body === 'string' ? JSON.parse(options.body) : undefined,
  });
  return new Response(result.body, { status: result.status, headers: { 'content-type': result.content_type || 'application/json' } });
}

type StudioNavigationNode = {id:string;label:string;href?:string;icon?:string;children?:StudioNavigationNode[]};
type StudioNavigationProjection = {primary?:StudioNavigationNode[];channels?:StudioNavigationNode[];apps?:StudioNavigationNode[];utilities?:StudioNavigationNode[]};
const navigationIcons = {home:Home,products:Package,orders:ShoppingBag,discounts:Tag,content:Files,analytics:BarChart3,projects:Folder,library:BookOpen,tickets:Ticket,store:Store,'online-store':Store,customers:Users,audience:Users,help:CircleHelp,settings:Settings,messageSquare:MessageSquareIcon,box:Box,film:Film,globe:Globe,growth:TrendingUp,apps:Layers3,mail:Mail,database:Database};
function destination(item:StudioNavigationNode):NavDestination {
  const Icon = navigationIcons[item.icon as keyof typeof navigationIcons];
  return {...item,icon:Icon ? <Icon /> : undefined,children:item.children?.map(destination)};
}

const accents = ['#8B5CF6', '#2563EB', '#0D9488', '#BE185D'];

/** App adapter: routing, persistence and business state stay out of agentsam-nav. */
export function AgentSamShell({ embedded = false }: { embedded?: boolean } = {}) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const searchStr = useRouterState({ select: (state) => state.location.searchStr });
  const state = useWorkStore();
  const user = useCurrentUser();
  useEffect(() => {
    const shell = window as Window & {__agentsamSignOut?:() => Promise<void>};
    const action = async () => { try { await signOut(); } catch { toast.error('Sign out could not be completed. Please try again.'); } };
    shell.__agentsamSignOut=action;
    return () => {if(shell.__agentsamSignOut===action) delete shell.__agentsamSignOut;};
  }, []);
  const [mode, setMode] = useState<NavMode>('work');
  const [theme, setTheme] = useState<NavTheme>('dark');
  const [accent, setAccent] = useState(accents[0]);
  const [navTokens, setNavTokens] = useState<NavTokens>({});
  const [navigationStore, setNavigationStore] = useState<NavStateStore | undefined>(() =>
    typeof window === 'undefined' ? undefined : (window as Window & { __agentsamNavigationStore?: NavStateStore }).__agentsamNavigationStore);
  useEffect(() => {
    const connect = () => setNavigationStore((window as Window & { __agentsamNavigationStore?: NavStateStore }).__agentsamNavigationStore);
    connect();
    window.addEventListener('agentsam:navigation-ready', connect);
    return () => window.removeEventListener('agentsam:navigation-ready', connect);
  }, []);
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
    if (!user?.id || user.isDevFallback) return;
    const controller = new AbortController();
    void accountAvatarRequest({ credentials: 'same-origin', signal: controller.signal })
      .then(async (res) => res.ok ? res.json() as Promise<{avatar_url?: string | null}> : null)
      .then(data => {
        if (controller.signal.aborted) return;
        setAccountAvatarUrl(data?.avatar_url || null);
        const shell = window as Window & { __shellUser?: Record<string, unknown>; hydrateShellProfile?: (profile: unknown) => void };
        if (shell.__shellUser?.id === user.id) shell.hydrateShellProfile?.({ ...shell.__shellUser, avatar_url: data?.avatar_url || user.profileImageUrl });
      })
      .catch(() => { /* Auth image remains a usable fallback when preferences cannot be read. */ });
    return () => controller.abort();
  }, [user?.id]);
  const trail = state.trails.find((item) => item.id === state.activeTrailId);
  const [workProjects,setWorkProjects] = useState<import('@inneranimalmedia/agentsam-work/contracts').WorkProject[]>([]);
  const [historyStatus,setHistoryStatus] = useState<'loading'|'error'|'ready'>('loading');
  const [historyRevision,setHistoryRevision] = useState(0);
  const project = workProjects.find(item => item.id === trail?.workProjectId);
  useEffect(() => {
    let cancelled=false;
    setHistoryStatus('loading');
    import('@/components/work/LocalStudioWorkPage').then(({sharedLiveWorkHost}) => sharedLiveWorkHost().snapshot({surface:'projects'})).then(snapshot => {
      if (!cancelled) {setWorkProjects(snapshot.projects);setHistoryStatus('ready');}
    }).catch(() => {if(!cancelled)setHistoryStatus('error');});
    const refresh=()=>setHistoryRevision(value=>value+1);
    window.addEventListener('agentsam:projects-changed',refresh);
    return () => {cancelled=true;window.removeEventListener('agentsam:projects-changed',refresh);};
  },[historyRevision,user?.id]);
  const isConversation = pathname === '/agentsam' || pathname === '/admin/agentsam' || pathname.startsWith('/chats');
  const isCadRoute = pathname === '/cad' || pathname.startsWith('/cad/') || pathname === '/admin/cad' || pathname.startsWith('/admin/cad/');
  const isSettings = pathname === '/settings' || pathname.startsWith('/settings/');
  const [navigation, setNavigation] = useState<StudioNavigationProjection>({});
  useEffect(() => {
    const controller = new AbortController();
    fetch('/admin/data/navigation.json', { signal: controller.signal }).then((response) => {
      if (!response.ok) throw new Error('Application navigation unavailable');
      return response.json();
    }).then((projection) => {
      if (projection.schema === 'agentsam.host-navigation.v1' && Array.isArray(projection.apps)) setNavigation(projection);
    }).catch(() => { /* No synthetic installed-app fallback. */ });
    return () => controller.abort();
  }, []);

  const isMovieModeRoute = pathname === '/media' || pathname.startsWith('/media/') ||
    pathname === '/admin/moviemode' || pathname.startsWith('/admin/moviemode/');
  // When a SideStage preview becomes the dedicated editor, close only its
  // duplicate pane. Keep tabs and terminal/browser sessions for later reopening.
  useEffect(() => {
    if (!isCadRoute && !isMovieModeRoute) return;
    const workspace = useWorkStore.getState();
    const active = workspace.sideTabs.find(tab => tab.id === workspace.activeSideTabId);
    if ((isCadRoute && active?.kind === 'app') || (isMovieModeRoute && active?.kind === 'media')) {
      workspace.setSideOpen(false);
    }
  }, [pathname, isCadRoute, isMovieModeRoute]);
  // The platform owns its shell; product-owned /admin pages navigate into
  // the installed Ecommerce application without recreating product routers.
  const go = (to: string) => {
    if (to.startsWith('/admin/') && !isStudioAdminPath(to.split('?')[0])) {
      if (isPackagedDesktop()) {
        window.location.hash = '#/apps/ecommerce-cms-agentsam?page=' + encodeURIComponent(to);
      } else {
        void navigate({ to: '/apps/ecommerce-cms-agentsam', search: { page: to } } as never);
      }
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
    window.location.hash = '#/admin/agentsam';
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
      if (pathname === '/admin/agentsam' || pathname.startsWith('/chats')) {
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
    let themeSyncRevision = 0;
    const syncRegistryTheme = async () => {
      const revision = ++themeSyncRevision;
      if (!user?.id || user.isDevFallback) {
        setNavTokens({});
        return;
      }
      try {
        const activeTheme = await applyActiveStudioTheme();
        if (revision !== themeSyncRevision) return;
        const preference = appearanceRef.current;
        const stored = readTheme();
        const fallbackTheme = preference?.theme === 'system'
          ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
          : preference?.theme ?? (stored.monacoBase === 'vs' ? 'light' : 'dark');
        const appearance = projectStudioShellAppearance(activeTheme, { theme:fallbackTheme, accentColor:preference?.accent ?? stored.tokens.accent });
        applyStudioShellAppearance(appearance, document.documentElement);
        setNavTokens(appearance.tokens);
        setAccent(appearance.accentColor);
        setTheme(appearance.theme);
        window.dispatchEvent(new CustomEvent('agentsam:theme-applied', { detail:appearance }));
      } catch (error) {
        if (revision === themeSyncRevision) console.warn('[agentsam/theme-registry]', error);
      }
    };

    const applyPreference = (preference: ShellAppearancePreference | null) => {
      appearanceRef.current = preference;
      if (preference) {
        const resolved = applyShellAppearance(preference);
        setTheme(resolved);
        setAccent(preference.accent);
      } else {
        const storedTheme = readTheme();
        applyTheme(storedTheme);
        setTheme(storedTheme.monacoBase === 'vs' ? 'light' : 'dark');
        setAccent(storedTheme.tokens.accent);
      }
      // Base appearance is applied first; the account's active cms_themes record
      // then supplies the final shared shell and navigation color tokens.
      void syncRegistryTheme();
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
    const onStorage = () => applyPreference(readShellAppearancePreference());
    const onRegistryThemeChanged = () => { void syncRegistryTheme(); };
    window.addEventListener('storage', onStorage);
    window.addEventListener('agentsam:shell-appearance', onAppearance);
    window.addEventListener(THEME_PROJECTS_CHANGED, onRegistryThemeChanged);
    media?.addEventListener('change', onSystemChange);
    return () => {
      themeSyncRevision += 1;
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('agentsam:shell-appearance', onAppearance);
      window.removeEventListener(THEME_PROJECTS_CHANGED, onRegistryThemeChanged);
      media?.removeEventListener('change', onSystemChange);
    };
  }, [user?.id, user?.isDevFallback]);
  useEffect(() => {
    const onNavigate = (event: Event) => {
      const detail = (event as CustomEvent<{ to?: string; params?: Record<string, string> }>).detail;
      if (!detail?.to) return;
      if (!detail.params) { go(detail.to); return; }
      void navigate({ to: detail.to, params: detail.params } as never);
    };
    const onIdentityOpen = () => setIdentityOpen(true);
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key === '`') { event.preventDefault(); useWorkStore.getState().toggleTerminal(); }
      if (event.key.toLowerCase() === 'n' && !event.shiftKey) { event.preventDefault(); useWorkStore.getState().startTrail(); void navigate({ to: '/admin/agentsam' }); }
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

  const navPathname = pathname === '/apps/ecommerce-cms-agentsam'
    ? new URLSearchParams(searchStr).get('page') || pathname
    : pathname + searchStr;
  const value: NavValue = {
    brand, mode, onModeChange: setMode, pathname: navPathname,
    project: project ? { id: project.id, name: project.name } : undefined,
    conversation: trail ? { id: trail.id, title: trail.title } : undefined,
    projects: workProjects.map(item => ({id:item.id,name:item.name,pinned:item.starred,updatedAt:item.updatedAt ? Date.parse(item.updatedAt) : undefined})),
    historyStatus,onRetryHistory:()=>setHistoryRevision(value=>value+1),
    conversations: state.trails.filter(item => item.id !== "trail-studio" || item.messages.some(message => message.role === "user")).map((item) => ({ id: item.id, title: item.title, projectId: item.workProjectId, pinned: item.pinned,updatedAt:item.updatedAt })),
    account: user ? { id: user.id, name: user.isDevFallback ? 'Local account' : user.displayName ?? 'Account', avatar: accountAvatarUrl || user.profileImageUrl || undefined } : undefined,
    showSidebarHeader: false,
    newConversationAfter: 'home',
    showHistory: isConversation,
    destinations: [
      // Render the platform-owned business destinations first. These are the
      // canonical primary entries from the same host projection as installed apps.
      ...(navigation.primary || []),
      ...(navigation.channels?.length ? [{id:'sales-channels',label:'Sales channels',icon:'store',children:navigation.channels}] : []),
      ...(navigation.apps?.length ? [{id:'installed-apps',label:'Apps',icon:'apps',children:navigation.apps}] : []),
      ...(navigation.utilities || []),
    ].map(destination),
    onNavigate: go,
    onCreateConversation: isConversation ? () => { state.startTrail(); go('/admin/agentsam'); } : undefined,
    onSelectConversation: (id) => { state.setActiveTrail(id); go('/admin/agentsam'); },
    onSelectProject: (id) => go('/admin/projects/'+encodeURIComponent(id)),
    onPinProject: (id) => {
      const selected=workProjects.find(item=>item.id===id);
      if (!selected) return;
      void import('@/components/work/LocalStudioWorkPage').then(async ({sharedLiveWorkHost}) => {
        const host=sharedLiveWorkHost();if(!host.updateProject) throw new Error('Project pinning unavailable');
        const updated=await host.updateProject(id,{starred:!selected.starred});
        setWorkProjects(items=>items.map(item=>item.id===id?updated:item));
      }).catch(()=>toast.error('Project pin could not be saved.'));
    },
    onRenameProject: (id, name) => {
      const normalized = name.trim();
      if (!normalized) return;
      void import('@/components/work/LocalStudioWorkPage').then(async ({sharedLiveWorkHost}) => {
        const host=sharedLiveWorkHost();if(!host.updateProject) throw new Error('Project rename unavailable');
        const updated=await host.updateProject(id,{name:normalized});
        setWorkProjects(items=>items.map(item=>item.id===id?updated:item));
      }).catch(()=>toast.error('Project name could not be saved.'));
    },
    onPinConversation: state.pinTrail, onRenameConversation: state.renameTrail,
    onShare: trail ? () => setSharing(true) : undefined,
    accountActions: [
      {id:'profile-image',label:'Profile image',icon:<PawPrint />,onSelect:() => { setAvatarDraft(accountAvatarUrl || user?.profileImageUrl || ''); setAvatarDialogOpen(true); }},
      {id:'settings',label:'Settings',icon:<Settings />,onSelect:() => go('/settings/general')},
      ...(isPackagedDesktop() ? [{id:'desktop-pet',label:'Desktop pet',icon:<PawPrint />,onSelect:() => { void toggleAgentSamPet().then((visible) => toast.success(visible ? 'AgentSam pet is on your desktop' : 'AgentSam pet hidden')).catch(() => toast.error('Desktop pet could not be opened')); }}] : []),
      ...(!user || user.isDevFallback ? [{id:'sign-in',label:'Sign in',icon:<LogIn />,onSelect:() => isPackagedDesktop() ? setIdentityOpen(true) : go('/auth/login')}] : hasGateSessionMarker() ? [] : [{id:'sign-out',label:'Sign out',icon:<LogOut />,onSelect:() => {void signOut().catch(() => toast.error('Sign out could not be completed. Please try again.'));}}]),
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
  useEffect(() => {
    const projection = {projects:value.projects,conversations:value.conversations,project:value.project,conversation:value.conversation,historyStatus:value.historyStatus,onRetryHistory:value.onRetryHistory,onSelectConversation:value.onSelectConversation,onSelectProject:value.onSelectProject,onPinConversation:value.onPinConversation,onPinProject:value.onPinProject,onRenameConversation:value.onRenameConversation,onRenameProject:value.onRenameProject};
    const host=window as Window & {__agentsamWorkspaceNavigation?:typeof projection};
    host.__agentsamWorkspaceNavigation=projection;
    window.dispatchEvent(new Event('agentsam:workspace-navigation'));
    return () => {if(host.__agentsamWorkspaceNavigation===projection)delete host.__agentsamWorkspaceNavigation;};
  },[state.trails,state.activeTrailId,workProjects,historyStatus]);
  return <ToolPermissionProvider><TooltipProvider><Nav.Provider value={value} theme={theme} accentColor={accent} tokens={navTokens} defaultOpen resizable stateStore={navigationStore} storageKey={navigationStore ? undefined : "agentsam-nav:" + (user && !user.isDevFallback ? user.id : "local")}>
    <Nav.Scope className="agentsam-shell platform-console" data-agentsam-app-shell="local-studio" data-platform-console="true" data-conversation={isConversation ? "true" : "false"} data-embedded={embedded ? "true" : undefined}>
      {!embedded ? <Nav.Sidenav /> : null}<div className="agentsam-main">
        {!embedded && !isConversation ? <Nav.Topbar className="platform-console-topbar">
          <Nav.Trigger aria-label="Toggle sidebar" />
          <button type="button" className="platform-console-search" aria-label="Search pages and tools" title="Search pages and tools" onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))}><Search size={17} /><span>Search pages and tools</span><kbd>⌘K</kbd></button>
          <Nav.TopbarSpacer />
          <AgentSamPetTrigger state={petState} avatarUrl={accountAvatarUrl || user?.profileImageUrl} onActivate={() => window.dispatchEvent(new Event('agentsam:assistant:activate'))} />
          <NotificationsMenu />
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
          void accountAvatarRequest({
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
