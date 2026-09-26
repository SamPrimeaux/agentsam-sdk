import { useEffect, useState } from 'react';
import { Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import { Nav, type NavMode, type NavTheme, type NavValue } from '@inneranimalmedia/agentsam-nav';
import { BookOpen, Folder, Globe, KeyRound, Layers, Settings, Palette, Pin, Files, Copy, PanelRight } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { CommandPalette } from '@/components/workbench/command-palette';
import { CliDrawer } from '@/components/shell/cli-drawer';
import { OfflineBanner } from '@/components/shell/offline-banner';
import { useWorkStore } from '@/lib/work/store';
import { useCurrentUser } from '@/lib/auth/use-current-user';
import { registerOfflineShell } from '@/lib/offline/register-sw';
import { brand } from './brand';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import './shell.css';
import { AnnotationHelper } from './AnnotationHelper';

const APPEARANCE_KEY = 'agentsam-shell-appearance-v1';
const accents = ['#8B5CF6', '#2563EB', '#0D9488', '#BE185D'];

/** App adapter: routing, persistence and business state stay out of agentsam-nav. */
export function AgentSamShell() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const state = useWorkStore();
  const user = useCurrentUser();
  const [mode, setMode] = useState<NavMode>('work');
  const [theme, setTheme] = useState<NavTheme>('dark');
  const [accent, setAccent] = useState(accents[0]);
  const [sharing, setSharing] = useState(false);
  const trail = state.trails.find((item) => item.id === state.activeTrailId);
  const project = state.projects.find((item) => item.id === trail?.projectId);
  const isConversation = pathname === '/agentsam' || pathname.startsWith('/trails');
  const go = (to: string) => { void navigate({ to } as never); };

  useEffect(() => {
    void useWorkStore.persist.rehydrate();
    registerOfflineShell();
    const stop = useWorkStore.persist.onFinishHydration(() => useWorkStore.getState().setHydrated(true));
    if (useWorkStore.persist.hasHydrated()) useWorkStore.getState().setHydrated(true);
    try {
      const settings = JSON.parse(localStorage.getItem(APPEARANCE_KEY) ?? '{}');
      if (['dark', 'light', 'system'].includes(settings.theme)) setTheme(settings.theme);
      if (/^#[0-9a-f]{6}$/i.test(settings.accent ?? '')) setAccent(settings.accent);
    } catch { /* Appearance falls back to the supplied brand defaults. */ }
    return stop;
  }, []);
  useEffect(() => {
    const onNavigate = (event: Event) => {
      const detail = (event as CustomEvent<{ to?: string; params?: Record<string, string> }>).detail;
      if (detail?.to) void navigate({ to: detail.to, params: detail.params } as never);
    };
    const onAppearance = (event: Event) => {
      const detail = (event as CustomEvent<{ theme?: NavTheme; accent?: string }>).detail;
      if (detail?.theme && ['dark', 'light', 'system'].includes(detail.theme)) setTheme(detail.theme);
      if (detail?.accent && /^#[0-9a-f]{6}$/i.test(detail.accent)) setAccent(detail.accent);
    };
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key === '`') { event.preventDefault(); useWorkStore.getState().toggleTerminal(); }
      if (event.key.toLowerCase() === 'n' && !event.shiftKey) { event.preventDefault(); useWorkStore.getState().startTrail(); void navigate({ to: '/agentsam' }); }
    };
    const online = () => { void useWorkStore.getState().flushOfflineQueue(); };
    window.addEventListener('agentsam:navigate', onNavigate);
    window.addEventListener('agentsam:shell-appearance', onAppearance);
    window.addEventListener('keydown', onKey);
    window.addEventListener('online', online);
    if (navigator.onLine) online();
    return () => {
      window.removeEventListener('agentsam:navigate', onNavigate);
      window.removeEventListener('agentsam:shell-appearance', onAppearance);
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
    account: user ? { id: user.id, name: user.isDevFallback ? 'Local account' : user.displayName ?? 'Account', avatar: user.profileImageUrl ?? undefined } : undefined,
    destinations: [
      { id: 'library', label: 'Library', icon: <BookOpen />, href: '/artifacts', active: pathname === '/artifacts' },
      { id: 'sites', label: 'Sites', icon: <Globe />, href: '/cms', active: pathname === '/cms' },
      { id: 'cad', label: 'CAD', icon: <Layers />, href: '/cad', active: pathname === '/cad' },
      { id: 'projects', label: 'Projects', icon: <Folder />, href: '/projects', active: pathname === '/projects' },
    ],
    onNavigate: go,
    onCreateConversation: () => { state.startTrail(); go('/agentsam'); },
    onSelectConversation: (id) => { state.setActiveTrail(id); go('/agentsam'); },
    onSelectProject: (id) => { state.setActiveProject(id); go('/projects'); },
    onPinConversation: state.pinTrail, onRenameConversation: state.renameTrail,
    onShare: trail ? () => setSharing(true) : undefined,
    accountActions: [
      { id: 'settings', label: 'Account & preferences', icon: <Settings />, onSelect: () => go('/settings/general') },
      { id: 'appearance', label: 'Themes & appearance', icon: <Palette />, onSelect: () => go('/settings/themes') },
      { id: 'keys', label: 'Keys & secrets', icon: <KeyRound />, onSelect: () => go('/settings/keys') },
    ],
    projectActions: [
      { id: 'home', label: 'Project home', icon: <Folder />, onSelect: () => go('/projects') },
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
  return <TooltipProvider><Nav.Provider value={value} theme={theme} accentColor={accent} defaultOpen={false} peekable>
    <Nav.Scope className="agentsam-shell" data-agentsam-app-shell="local-studio">
      <Nav.Sidenav /><div className="agentsam-main">
        {!isConversation ? <Nav.Topbar><Nav.TopbarLogo toggle /><span>{pathname.startsWith('/cad') ? 'CAD Creator' : pathname.startsWith('/cms') ? 'Sites' : pathname.startsWith('/artifacts') ? 'Library' : pathname.split('/')[1].replace(/^./, (letter) => letter.toUpperCase())}</span><Nav.TopbarSpacer /><Nav.AccountSwitcher /></Nav.Topbar> : null}
        <OfflineBanner /><main className="agentsam-route"><Outlet /></main>
      </div><CliDrawer /><CommandPalette />
      <Dialog open={sharing} onOpenChange={setSharing}><DialogContent><DialogTitle>Share conversation</DialogTitle><DialogDescription>Copy this conversation as text to share it. This does not create a public link.</DialogDescription><button type="button" className="as-nav-button" onClick={() => { if (!trail) return; void navigator.clipboard.writeText(trail.messages.map((item) => `${item.role}\n${item.content}`).join('\n\n')).then(() => { toast('Conversation copied'); setSharing(false); }, () => toast('Could not copy conversation')); }}><Copy size={18} />Copy conversation</button></DialogContent></Dialog>
      <AnnotationHelper />
      <Toaster theme={theme === 'light' ? 'light' : 'dark'} position="bottom-center" />
    </Nav.Scope>
  </Nav.Provider></TooltipProvider>;
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
