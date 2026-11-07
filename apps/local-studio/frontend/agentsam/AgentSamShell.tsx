import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { isStudioAdminPath, resolveLegacyContentMediaPath } from "../../shared/studio-admin-routes.mjs";
import { Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import { Nav, NavShareIcon, type NavMode, type NavTheme, type NavValue, type NavDestination, type NavTokens, type NavStateStore } from '@inneranimalmedia/agentsam-nav';
import {
  projectStudioShellAppearance,
  applyStudioShellAppearance,
  bootstrapStudioAppearanceFromCache,
  writeStudioAppearanceCache,
  clearStudioAppearanceCache,
} from '../../shared/shell-appearance.mjs';
import { MessageSquare as MessageSquareIcon, BookOpen, Film, Database, Folder, Globe, Home, Layers3, Settings, Pin, Files, Copy, PanelRight, LogIn, LogOut, PawPrint, Box, Search, ShoppingBag, Package, Store, Tag, Ticket, TrendingUp, BarChart3, Users, Mail, CircleHelp } from "lucide-react";
import { Toaster, toast } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { CommandPalette } from '@/components/workbench/command-palette';
import { SideStage } from '@/components/workbench/side-stage';
import { SplitHandle } from '@/components/shell/split-handle';
import { CliDrawer } from '@/components/shell/cli-drawer';
import { OfflineBanner } from '@/components/shell/offline-banner';
import { useWorkStore } from '@/lib/work/store';
// Legacy browser conversations are intentionally read-only until the
// canonical platform session migration is verified end to end.
import { listAccountChats, patchAccountChat, trashAccountChat, type AccountChat } from '@/lib/work/account-chats';
import { useCurrentUser } from '@/lib/auth/use-current-user';
import { registerOfflineShell } from '@/lib/offline/register-sw';
import { brand } from './brand';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import './shell.css';
import './platform-console.css';
import { AnnotationHelper } from './AnnotationHelper';
import { DesktopIdentityPortal } from '@/components/desktop/DesktopIdentityPortal';
import { DesktopStartupOverlay } from '@/components/desktop/DesktopStartupOverlay';
import { ToolPermissionProvider } from '@/components/workbench/ToolPermissionProvider';
import { invokeStudioService, isPackagedDesktop, listenDeepLinks, emitTauriEvent, listenTauriEvent, toggleAgentSamPet } from "@/lib/desktop/tauri";
import { formatChromeTabShare, parseChromeTabShare, type ChromeTabShare } from '@/lib/desktop/chrome-share';
import { AgentSamPetTrigger } from './AgentSamPetTrigger';
import { CompanionProvider } from './CompanionContext';
import { NotificationsMenu } from './NotificationsMenu';
import { ChatShareDialog } from './ChatShareDialog';
import { shareAttachmentMetadata } from '@/lib/content/share-attachment-metadata';
import { signOut } from '@/lib/auth/client';
import { hasGateSessionMarker } from '@/lib/auth/gate-session-marker';
import { applyActiveStudioTheme } from '@/lib/themes/inventory';
import { THEME_PROJECTS_CHANGED } from '@/lib/themes/projects';
import { forgetHostedAccountId, knownHostedAccountId, resolveHostedAccountId } from '@/lib/themes/hosted-account';

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
const navigationIcons = {home:Home,products:Package,orders:ShoppingBag,discounts:Tag,content:Files,analytics:BarChart3,projects:Folder,library:BookOpen,tickets:Ticket,store:Store,'online-store':Store,customers:Users,audience:Users,help:CircleHelp,settings:Settings,messageSquare:MessageSquareIcon,box:Box,film:Film,globe:Globe,growth:TrendingUp,apps:Layers3,layers:Layers3,mail:Mail,database:Database};
function destination(item:StudioNavigationNode):NavDestination {
  const Icon = navigationIcons[item.icon as keyof typeof navigationIcons];
  return {...item,icon:Icon ? <Icon /> : undefined,children:item.children?.map(destination)};
}

const accents = ['#8B5CF6', '#2563EB', '#0D9488', '#BE185D'];

let bootstrappedAppearance: ReturnType<typeof bootstrapStudioAppearanceFromCache> | undefined;
function initialCachedAppearance() {
  if (typeof window === 'undefined') return null;
  if (bootstrappedAppearance === undefined) {
    bootstrappedAppearance = bootstrapStudioAppearanceFromCache(undefined, document.documentElement);
  }
  return bootstrappedAppearance;
}

/** App adapter: routing, persistence and business state stay out of agentsam-nav. */
export function AgentSamShell({ embedded = false }: { embedded?: boolean } = {}) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const searchStr = useRouterState({ select: (state) => state.location.searchStr });
  const state = useWorkStore();
  const user = useCurrentUser();
  useEffect(() => {
    const shell = window as Window & {__agentsamSignOut?:() => Promise<void>};
    const action = async () => {
      try {
        clearStudioAppearanceCache(user && !user.isDevFallback ? user.id : null);
        clearStudioAppearanceCache(knownHostedAccountId());
        forgetHostedAccountId();
        await signOut();
      } catch { toast.error('Sign out could not be completed. Please try again.'); }
    };
    shell.__agentsamSignOut=action;
    return () => {if(shell.__agentsamSignOut===action) delete shell.__agentsamSignOut;};
  }, [user?.id]);
  const [mode, setMode] = useState<NavMode>('work');
  const [theme, setTheme] = useState<NavTheme>(() => initialCachedAppearance()?.theme || 'dark');
  const [accent, setAccent] = useState(() => initialCachedAppearance()?.accentColor || accents[0]);
  const [navTokens, setNavTokens] = useState<NavTokens>(() => initialCachedAppearance()?.tokens || {});
  const [navigationStore, setNavigationStore] = useState<NavStateStore | undefined>(() =>
    typeof window === 'undefined' ? undefined : (window as Window & { __agentsamNavigationStore?: NavStateStore }).__agentsamNavigationStore);
  useEffect(() => {
    const connect = () => setNavigationStore((window as Window & { __agentsamNavigationStore?: NavStateStore }).__agentsamNavigationStore);
    connect();
    window.addEventListener('agentsam:navigation-ready', connect);
    return () => window.removeEventListener('agentsam:navigation-ready', connect);
  }, []);
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
  const chat = state.chats.find((item) => item.id === state.activeChatId);
  const conversationOutputFiles = chat
    ? [...(chat.files ?? []), ...((state.projects.find(item => item.id === state.activeProjectId)?.files ?? [])
        .filter(file => file.chatId === chat.id))]
        .filter((file, index, rows) => rows.findIndex(other => other.path === file.path) === index)
    : [];
  const shareableChat = Boolean(chat?.messages.some(message => message.role !== 'system' &&
    message.id !== 'welcome-msg' && (message.content.trim() ||
      (Array.isArray(message.metadata?.attachments) && message.metadata.attachments.length > 0)))
    || conversationOutputFiles.length);
  const [workProjects,setWorkProjects] = useState<import('@inneranimalmedia/agentsam-work/contracts').WorkProject[]>([]);
  const [pinnedResources,setPinnedResources] = useState<Array<{id:string;title:string;kind:string;open?:string|null}>>([]);
  const [historyStatus,setHistoryStatus] = useState<'loading'|'error'|'ready'>('loading');
  const [historyRevision,setHistoryRevision] = useState(0);
  const [accountChats, setAccountChats] = useState<AccountChat[]>([]);
  const [chatRevision, setChatRevision] = useState(0);
  useEffect(() => {
    if (!user?.id || user.isDevFallback || isPackagedDesktop()) return;
    const controller = new AbortController();
    void listAccountChats({limit:100},controller.signal)
      .then(result => {if (!controller.signal.aborted) setAccountChats(result.chats);})
      .catch(() => { /* Local unsynced messages remain accessible. */ });
    const refresh = () => setChatRevision(revision => revision + 1);
    window.addEventListener('agentsam:chats-changed',refresh);
    return () => {controller.abort();window.removeEventListener('agentsam:chats-changed',refresh);};
  }, [user?.id,chatRevision]);
  const project = workProjects.find(item => item.id === chat?.workProjectId);
  useEffect(() => {
    let cancelled=false;
    setHistoryStatus('loading');
    import('@/components/work/LocalStudioWorkPage').then(({sharedLiveWorkHost}) => sharedLiveWorkHost().snapshot({surface:'projects'})).then(snapshot => {
      if (!cancelled) {
        setWorkProjects(snapshot.projects);
        setPinnedResources(snapshot.artifacts.filter(item=>item.starred && !item.deleted).map(item=>({
          id:item.id,title:item.name,kind:item.kind,open:item.open||item.preview,
        })).slice(0,30));
        setHistoryStatus('ready');
      }
    }).catch(() => {if(!cancelled)setHistoryStatus('error');});
    const refresh=()=>setHistoryRevision(value=>value+1);
    window.addEventListener('agentsam:projects-changed',refresh);
    return () => {cancelled=true;window.removeEventListener('agentsam:projects-changed',refresh);};
  },[historyRevision,user?.id]);
  const isConversation = pathname === '/agentsam' || pathname === '/admin/agentsam' || pathname.startsWith('/chats');
  const isCadRoute = pathname === '/cad' || pathname.startsWith('/cad/') || pathname === '/admin/cad' || pathname.startsWith('/admin/cad/');
  const isSamSketchRoute = pathname === '/samsketch' || pathname.startsWith('/samsketch/');
  const isSamSculptRoute = pathname === '/samsculpt' || pathname.startsWith('/samsculpt/');
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

  const isMovieModeRoute = pathname === '/admin/moviemode' || pathname.startsWith('/admin/moviemode/');
  // When a SideStage preview becomes the dedicated editor, close only its
  // duplicate pane. Keep tabs and terminal/browser sessions for later reopening.
  useEffect(() => {
    if (!isCadRoute && !isMovieModeRoute && !isSamSketchRoute && !isSamSculptRoute) return;
    const workspace = useWorkStore.getState();
    const active = workspace.sideTabs.find(tab => tab.id === workspace.activeSideTabId);
    if (
      ((isCadRoute || isSamSketchRoute || isSamSculptRoute) && active?.kind === 'app')
      || (isMovieModeRoute && active?.kind === 'media')
    ) {
      workspace.setSideOpen(false);
    }
  }, [pathname, isCadRoute, isMovieModeRoute, isSamSketchRoute, isSamSculptRoute]);
  // Keep first-party Media and Studio mounts in the SPA. Product /admin pages
  // stay readable: navigate the installed Ecommerce host, then mirror the
  // canonical /admin/... URL in history so refresh/session stay coherent.
  const go = (to: string) => {
    const [pathOnly, query = ''] = to.split('?');
    const legacyMedia = resolveLegacyContentMediaPath(pathOnly, new URLSearchParams(query));
    if (legacyMedia) {
      go(legacyMedia);
      return;
    }
    if (pathOnly === '/docs' || pathOnly.startsWith('/docs/')) {
      go('/settings/docs');
      return;
    }
    if (pathOnly === '/admin/products/help/artwork' || pathOnly.startsWith('/admin/products/help/artwork')) {
      go('/settings/docs?topic=artwork');
      return;
    }
    if (pathOnly.startsWith('/admin/') && !isStudioAdminPath(pathOnly)) {
      if (isPackagedDesktop()) {
        window.location.hash = '#/apps/ecommerce-cms-agentsam?page=' + encodeURIComponent(to);
        return;
      }
      // Keep the real registered SPA route in the address bar. Replacing it
      // with an unregistered /admin/* URL makes TanStack render Not Found on
      // subsequent navigation despite a valid packaged server-side document.
      void navigate({ to: '/apps/ecommerce-cms-agentsam', search: { page: to } } as never);
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
    const chatId = store.activeChatId || store.startChat();
    const context = shares.map(formatChromeTabShare).join('\n\n');
    store.setDraft(chatId, [store.drafts[chatId]?.trimEnd(), context].filter(Boolean).join('\n\n'));
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

  const petState = state.activeChatId && state.streamingIds.includes(state.activeChatId) ? "working" : "idle";
  useEffect(() => {
    if (!isPackagedDesktop()) return;
    void emitTauriEvent("agentsam:pet:state", { state: petState }).catch(() => {});
  }, [petState]);

  useEffect(() => {
    flushChromeShares();
  }, [state.hydrated]);

  useEffect(() => {
    let themeSyncRevision = 0;
    // Registered AgentSam shell theme is the sole appearance authority.
    // Cache paints first; registry reconciles and updates the account-scoped cache.
    // The hosted Worker already authenticated this document; useCurrentUser() is the
    // sandbox dev fallback in the shipped bundle, so the account is resolved from IAM.
    const sessionAccountId = user?.id && !user.isDevFallback ? user.id : null;
    const paint = (appearance: ReturnType<typeof projectStudioShellAppearance>, accountId: string | null) => {
      applyStudioShellAppearance(appearance, document.documentElement);
      setNavTokens(appearance.tokens);
      setAccent(appearance.accentColor);
      setTheme(appearance.theme);
      if (accountId) writeStudioAppearanceCache(accountId, appearance);
      window.dispatchEvent(new CustomEvent('agentsam:theme-applied', { detail: appearance }));
    };
    const syncRegistryTheme = async () => {
      const revision = ++themeSyncRevision;
      // Cache paints first (account key when known, otherwise the last-account pointer
      // that the head bootstrap already used).
      const cached = bootstrapStudioAppearanceFromCache(sessionAccountId || knownHostedAccountId() || undefined, document.documentElement);
      if (cached && revision === themeSyncRevision) {
        setNavTokens(cached.tokens);
        setAccent(cached.accentColor);
        setTheme(cached.theme);
      }
      const fallbackAccent = cached?.accentColor || accents[0];
      const systemTheme = cached?.theme || (typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
      try {
        const accountId = sessionAccountId || await resolveHostedAccountId();
        if (revision !== themeSyncRevision) return;
        const activeTheme = accountId ? await applyActiveStudioTheme() : null;
        if (revision !== themeSyncRevision) return;
        paint(projectStudioShellAppearance(activeTheme, {
          theme: systemTheme,
          accentColor: fallbackAccent,
        }), accountId);
      } catch (error) {
        if (revision !== themeSyncRevision) return;
        // Keep last-known-good cache on registry failure — do not flash unrelated defaults.
        if (cached) {
          paint(cached, null);
          console.warn('[agentsam/theme-registry]', error);
          return;
        }
        paint(projectStudioShellAppearance(null, { theme: systemTheme, accentColor: fallbackAccent }), null);
        console.warn('[agentsam/theme-registry]', error);
      }
    };

    void syncRegistryTheme();
    const onRegistryThemeChanged = () => { void syncRegistryTheme(); };
    window.addEventListener(THEME_PROJECTS_CHANGED, onRegistryThemeChanged);
    window.addEventListener('agentsam:theme-registry-changed', onRegistryThemeChanged);
    return () => {
      themeSyncRevision += 1;
      window.removeEventListener(THEME_PROJECTS_CHANGED, onRegistryThemeChanged);
      window.removeEventListener('agentsam:theme-registry-changed', onRegistryThemeChanged);
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
      // New Chat (mod+n) is the shared `chat.new` command: see NativeCommandBridge.
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
    conversation: chat ? { id: chat.id, title: chat.title } : undefined,
    pinnedResources,
    onOpenResource: item => {
      if(item.open && (item.open.startsWith('/') && !item.open.startsWith('//') || item.open.startsWith('https://'))) {
        window.open(item.open,'_blank','noopener,noreferrer');
      } else go('/artifacts?view=starred');
    },
    projects: workProjects.map(item => ({id:item.id,name:item.name,pinned:item.starred,updatedAt:item.updatedAt ? Date.parse(item.updatedAt) : undefined})),
    historyStatus,onRetryHistory:()=>setHistoryRevision(value=>value+1),
    conversations: [
      ...accountChats.map(chat => ({id:chat.id,title:chat.title,projectId:chat.projectId || undefined,pinned:chat.pinned,updatedAt:chat.updatedAt * 1000})),
      ...state.chats.filter(item => item.id !== 'chat-studio' && item.messages.some(message => message.role === 'user')
        && !accountChats.some(chat => chat.id === item.id))
        .map(item => ({id:item.id,title:item.title,projectId:item.workProjectId,pinned:item.pinned,updatedAt:item.updatedAt})),
    ],
    account: user ? { id: user.id, name: user.isDevFallback ? 'Local account' : user.displayName ?? 'Account', avatar: accountAvatarUrl || user.profileImageUrl || undefined } : undefined,
    showSidebarHeader: isConversation && mode === 'work',
    newConversationAfter: 'home',
    showHistory: true,
    destinations: [
      // Render the platform-owned business destinations first. These are the
      // canonical primary entries from the same host projection as installed apps.
      ...(navigation.primary || []).map(entry => entry.id === 'projects' ? {
        ...entry,
        // Project shortcuts belong under the ONE canonical Projects destination.
        // Its label opens the Projects workspace; its chevron discloses saved projects.
        children: [...workProjects]
          .sort((a,b) => Number(Boolean(b.starred)) - Number(Boolean(a.starred)) || a.name.localeCompare(b.name))
          .map(project => ({ id: 'project-' + project.id, label: project.name,
            href: '/admin/projects/' + encodeURIComponent(project.id) })),
      } : entry),
      ...(navigation.channels?.length ? [{id:'sales-channels',label:'Sales channels',icon:'store',children:navigation.channels}] : []),
      ...(navigation.apps?.length ? [{id:'installed-apps',label:'Apps',icon:'apps',children:navigation.apps}] : []),
      ...(navigation.utilities || []),
    ].map(destination),
    onNavigate: go,
    onSearch: () => window.dispatchEvent(new Event('agentsam:open-command-palette')),
    onCreateConversation: () => { state.startChat(); go('/admin/agentsam'); },
    onSelectConversation: (id) => {
      if (state.chats.some(item => item.id === id)) state.setActiveChat(id);
      go('/chats/' + encodeURIComponent(id));
    },
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
    onPinConversation: (id) => {
      const chat = accountChats.find(item => item.id === id);
      if (chat) {
        void patchAccountChat(id,{pinned:!chat.pinned})
          .then(() => {if(state.chats.some(item=>item.id===id))state.pinChat(id);setChatRevision(value=>value+1);})
          .catch(()=>toast.error('Could not update conversation.'));
      } else state.pinChat(id);
    },
    onRenameConversation: (id,title) => {
      const chat = accountChats.find(item=>item.id===id);
      if(chat) {
        void patchAccountChat(id,{title}).then(()=>{
          if(state.chats.some(item=>item.id===id))state.renameChat(id,title);
          setChatRevision(value=>value+1);
        }).catch(()=>toast.error('Could not rename conversation.'));
      } else state.renameChat(id,title);
    },
    onDeleteConversation: (id) => {
      const chat=accountChats.find(item=>item.id===id);
      if(chat) {
        void trashAccountChat(id).then(()=>{
          if(state.chats.some(item=>item.id===id))state.deleteChat(id);
          setChatRevision(value=>value+1);
        }).catch(()=>toast.error('Could not delete conversation.'));
      } else state.deleteChat(id);
    },
    onShare: shareableChat ? () => setSharing(true) : undefined,
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
    conversationActions: chat ? [
      ...(shareableChat ? [{ id: 'share', label: 'Create a public link', icon: <NavShareIcon />, onSelect: () => setSharing(true) }] : []),
      { id: 'files', label: 'View files in conversation', icon: <Files />, onSelect: () => state.openSideTab('files') },
      { id: 'pin', label: chat.pinned ? 'Unpin conversation' : 'Pin conversation', icon: <Pin />, onSelect: () => state.pinChat(chat.id) },
      { id: 'copy', label: 'Copy conversation', icon: <Copy />, onSelect: () => { void navigator.clipboard.writeText(chat.messages.map((item) => `${item.role}\n${item.content}`).join('\n\n')).then(() => toast('Conversation copied'), () => toast('Could not copy conversation')); } },
    ] : [],
    pinnedSummary: chat ? {
      subagents: state.sideTabs.filter(tab => tab.kind === 'chat' && tab.parentChatId === chat.id).map(tab => ({
        id: tab.id, label: tab.title || 'Co-worker',
        status: state.streamingIds.includes(tab.id) ? 'Working' : 'Idle',
        onSelect: () => { state.setActiveSideTab(tab.id); state.setSideOpen(true); },
      })),
      outputs: conversationOutputFiles.map(file => ({
        id: file.id, label: file.title || file.path, kind: file.kind || 'File',
        onSelect: () => { state.openSideTab('artifacts', { fileId: file.id, ephemeral: false }); state.setSideOpen(true); },
      })),
      sources: chat.messages.flatMap(message => shareAttachmentMetadata(message).map((file, index) => ({
        id: message.id + ':' + index, label: file.name, kind: 'Attachment',
      }))),
      onAddOutput: () => { state.openSideTab('files'); state.setSideOpen(true); },
      onAddSource: () => { state.openSideTab('files'); state.setSideOpen(true); },
    } : undefined,
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
  },[state.chats,state.activeChatId,workProjects,historyStatus]);
  return <CompanionProvider accountKey={user?.id || "anonymous"}><ToolPermissionProvider><TooltipProvider><Nav.Provider value={value} theme={theme} accentColor={accent} tokens={navTokens} defaultOpen resizable stateStore={navigationStore} storageKey={navigationStore ? undefined : "agentsam-nav:" + (user && !user.isDevFallback ? user.id : "local")}>
    <Nav.Scope className="agentsam-shell platform-console" data-agentsam-app-shell="local-studio" data-platform-console="true" data-conversation={isConversation ? "true" : "false"} data-embedded={embedded ? "true" : undefined}>
      {!embedded ? <Nav.Sidenav /> : null}<div className="agentsam-main">
        {!embedded && !isConversation ? <Nav.Topbar className="platform-console-topbar">
          <Nav.Trigger aria-label="Toggle sidebar" />
          <button type="button" className="platform-console-search" aria-label="Search pages and tools" title="Search pages and tools" onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))}><Search size={17} /><span>Search pages and tools</span><kbd>⌘K</kbd></button>
          <Nav.TopbarSpacer />
          <AgentSamPetTrigger state={petState} onActivate={() => window.dispatchEvent(new Event('agentsam:assistant:activate'))} />
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
      <ChatShareDialog open={sharing} onOpenChange={setSharing} chat={chat ?? null} />
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
  </Nav.Provider></TooltipProvider></ToolPermissionProvider></CompanionProvider>;
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
