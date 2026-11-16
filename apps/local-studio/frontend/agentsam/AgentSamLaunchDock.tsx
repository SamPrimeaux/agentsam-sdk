import { BookOpen, House, Lightbulb, MessageCircle, SquareCheckBig } from 'lucide-react';
import { Nav, useNav } from '@inneranimalmedia/agentsam-nav';
import { useWorkStore } from '@/lib/work/store';

/**
 * Phone launch destinations for the existing Local Studio shell.
 * Work's editor/terminal tabs remain contextual, not a second global dock.
 */
export function AgentSamLaunchDock() {
  const { data, isMobile, open, setOpen } = useNav();
  const setSideOpen = useWorkStore((state) => state.setSideOpen);
  const [path, routeSearch = ''] = (data.pathname ?? '').split('?');
  // The launch dock is navigation for primary destinations, not editor chrome.
  // Focused tools (Canvas, Library, CMS, Media, Settings, etc.) own their stage.
  // Chats reserves the bottom edge for its single composer, as do focused tools.
  // Keep quick destinations only on lightweight landing pages.
  const launchRoute = path === '/admin/home' || path === '/admin/ideas' || path === '/admin/goalguru' || path === '/goalguru';
  // A modal navigation drawer takes precedence over the dock and underlying stage.
  if (!isMobile || open || !launchRoute) return null;
  const installedAdminPage = path === '/admin/apps/ecommerce-cms-agentsam' ? new URLSearchParams(routeSearch).get('page') : null;
  const showPage = (path: string) => {
    setOpen(false);
    // A dedicated route must not open a second SideStage over itself.
    setSideOpen(false);
    data.onNavigate?.(path);
  };

  return <Nav.LaunchDock items={[
    {
      id: 'chats', label: 'Chats', icon: <MessageCircle />,
      active: path === '/admin/agentsam' || path.startsWith('/admin/chats'),
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
      active: path === '/admin/library' || path === '/admin/media' || path.startsWith('/admin/media/') || path === '/admin/artifacts',
      onSelect: () => showPage('/admin/library'),
    },
  ]} />;
}
