import { BookOpen, Clock3, FileCode, Files, Folder, House, Images, Lightbulb, MessageCircle, MonitorPlay, SquareCheckBig, SquareTerminal, UserRound, Users } from 'lucide-react';
import { Nav, useNav } from '@inneranimalmedia/agentsam-nav';
import { useNavigate } from '@tanstack/react-router';
import { useWorkStore } from '@/lib/work/store';

/**
 * The shell owns which navigation profile applies; agentsam-nav owns the
 * single floating dock. Work surfaces and global destinations never stack.
 */
export function AgentSamLaunchDock() {
  const { data, isMobile, open, setOpen } = useNav();
  const navigate = useNavigate();
  const setSideOpen = useWorkStore((state) => state.setSideOpen);
  const workSurface = useWorkStore((state) => state.workSurface);
  const setWorkSurface = useWorkStore((state) => state.setWorkSurface);
  const [path, routeSearch = ''] = (data.pathname ?? '').split('?');
  const installedAdminPage = path === '/admin/apps/ecommerce-cms-agentsam' ? new URLSearchParams(routeSearch).get('page') : null;
  const chatsActive = path === '/admin/agentsam' || path.startsWith('/admin/chats');
  const libraryActive = path === '/admin/library' || path === '/admin/media' || path.startsWith('/admin/media/') || path === '/admin/artifacts';
  // Only lightweight landing pages and the AgentSam conversation host opt in.
  // Editors, CMS, Library, and creative apps keep their own contextual chrome.
  const launchRoute = path === '/admin/home' || path === '/admin/ideas' || path === '/admin/goalguru' || path === '/goalguru';
  const conversationRoute = path === '/admin/agentsam' || path.startsWith('/admin/chats');
  const libraryRoute = path === '/admin/library' || path === '/admin/artifacts' || path === '/admin/media';
  const libraryView = new URLSearchParams(routeSearch).get('view') || 'all';
  const storePath = installedAdminPage?.split('?')[0] || path;
  const storeRoute = ['/admin/store','/admin/pages','/admin/preferences','/admin/products','/admin/orders'].includes(storePath);
  // The sidebar drawer takes precedence. Beyond the nav provider's 901px
  // mobile threshold, only Work opts into the 902–1099px compact dock.
  if ((isMobile && open) || (!launchRoute && !conversationRoute && !libraryRoute && !storeRoute)) return null;
  const showPage = (path: string) => {
    setOpen(false);
    // A dedicated route must not open a second SideStage over itself.
    setSideOpen(false);
    data.onNavigate?.(path);
  };

  if (storeRoute && !isMobile) return null;

  if (libraryRoute) {
    const showArtifacts = (view: 'all' | 'yours' | 'shared' | 'recent') => {
      setOpen(false);
      setSideOpen(false);
      void navigate({ to: '/admin/library', search: view === 'all' ? {} : { view } } as never);
    };
    return <Nav.LaunchDock coverage="tablet" label="Library navigation" items={[
      { id: 'artifacts', label: 'Artifacts', icon: <Files />, active: path !== '/admin/media' && libraryView === 'all', onSelect: () => showArtifacts('all') },
      { id: 'yours', label: 'Yours', icon: <UserRound />, active: path !== '/admin/media' && libraryView === 'yours', onSelect: () => showArtifacts('yours') },
      { id: 'shared', label: 'Shared', icon: <Users />, active: path !== '/admin/media' && libraryView === 'shared', onSelect: () => showArtifacts('shared') },
      { id: 'recent', label: 'Recent', icon: <Clock3 />, active: path !== '/admin/media' && libraryView === 'recent', onSelect: () => showArtifacts('recent') },
      { id: 'media', label: 'Media', icon: <Images />, active: path === '/admin/media', onSelect: () => showPage('/admin/media') },
    ]} />;
  }

  if (conversationRoute) {
    return <Nav.LaunchDock coverage="tablet" label="Work surfaces" items={[
      { id: 'chat', label: 'Chat', icon: <MessageCircle />, active: workSurface === 'chat', onSelect: () => setWorkSurface('chat') },
      { id: 'files', label: 'Files', icon: <Folder />, active: workSurface === 'files', onSelect: () => setWorkSurface('files') },
      { id: 'code', label: 'Code', icon: <FileCode />, active: workSurface === 'code', onSelect: () => setWorkSurface('code') },
      { id: 'terminal', label: 'Terminal', icon: <SquareTerminal />, active: workSurface === 'terminal', onSelect: () => setWorkSurface('terminal') },
      { id: 'preview', label: 'Preview', icon: <MonitorPlay />, active: workSurface === 'preview', onSelect: () => setWorkSurface('preview') },
    ]} />;
  }

  return <Nav.LaunchDock coverage="tablet" items={[
    {
      id: 'chats', label: 'Chats', icon: <MessageCircle />,
      active: chatsActive,
      onSelect: () => showPage('/admin/agentsam'),
    },
    {
      id: 'home', label: 'Home', icon: <House />,
      active: path === '/admin/home' || installedAdminPage === '/admin/home',
      // / is the public product site, not this signed-in destination.
      onSelect: () => showPage('/admin/home'),
    },
    {
      id: 'ideas', label: 'Ideas', icon: <Lightbulb />,
      active: path === '/admin/ideas',
      onSelect: () => showPage('/admin/ideas'),
    },
    {
      id: 'goals', label: 'Goals', icon: <SquareCheckBig />,
      active: path === '/admin/goalguru',
      onSelect: () => showPage('/admin/goalguru'),
    },
    {
      id: 'library', label: 'Library', icon: <BookOpen />,
      active: libraryActive,
      onSelect: () => showPage('/admin/library'),
    },
  ]} />;
}
