import { Bell } from 'lucide-react';
import { Nav, useNav } from '@inneranimalmedia/agentsam-nav';

/** Reuse the platform navigation menu and never fabricate notification records. */
export function NotificationsMenu() {
  const { data } = useNav();
  return <Nav.OverflowMenu label="Notifications" align="end" actions={[
    { id: 'notification-connection', label: 'Notification feed not connected', disabled: true },
    { id: 'open-tickets', label: 'Open tickets', onSelect: () => data.onNavigate?.('/tickets') },
  ]}><Bell size={18} /></Nav.OverflowMenu>;
}
