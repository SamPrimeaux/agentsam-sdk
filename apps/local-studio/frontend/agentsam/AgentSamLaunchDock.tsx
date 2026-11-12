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
  if (!isMobile) return null;

  const [path, routeSearch = ''] = (data.pathname ?? '').split('?');
  const installedAdminPage = path === '/apps/ecommerce-cms-agentsam' ? new URLSearchParams(routeSearch).get('page') : null;
  const showPage = (path: string) => {
    setOpen(false);
    // A dedicated route must not open a second SideStage over itself.
    setSideOpen(false);
    data.onNavigate?.(path);
  };

  return <Nav.LaunchDock items={[
    {
      id: 'chats', label: 'Chats', icon: <MessageCircle />,
      active: open || path === '/agentsam' || path === '/admin/agentsam' || path.startsWith('/chats'),
      onSelect: () => setOpen(!open),
    },
    {
      id: 'home', label: 'Home', icon: <House />,
      active: path === '/admin/home' || installedAdminPage === '/admin/home',
      // / is the public product site, not this signed-in destination.
      onSelect: () => showPage('/admin/home'),
    },
    {
      id: 'ideas', label: 'Ideas', icon: <Lightbulb />,
      active: path === '/ideas',
      onSelect: () => showPage('/ideas'),
    },
    {
      id: 'goals', label: 'Goals', icon: <SquareCheckBig />,
      active: path === '/goalguru',
      onSelect: () => showPage('/goalguru'),
    },
    {
      id: 'library', label: 'Library', icon: <BookOpen />,
      active: path === '/library' || path === '/media' || path.startsWith('/media/') || path === '/artifacts',
      onSelect: () => showPage('/library'),
    },
  ]} />;
}
