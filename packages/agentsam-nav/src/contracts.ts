import type { ReactNode } from 'react';

export type NavMode = 'chat' | 'work';
export type NavTheme = 'dark' | 'light' | 'system';
export type NavTokens = Partial<Record<'canvas' | 'sidebar' | 'surface' | 'popover' | 'text' | 'muted' | 'border' | 'hover' | 'selected' | 'danger' | 'font' | 'label-size' | 'meta-size' | 'row-height' | 'radius' | 'menu-radius' | 'shadow' | 'width' | 'rail-width', string>>;
export interface NavBrand { name: string; logo?: string; lightLogo?: string; home?: string }
export interface NavProject { id: string; name: string; pinned?: boolean }
export interface NavConversation { id: string; title: string; projectId?: string; pinned?: boolean }
export interface NavAccount { id: string; name: string; plan?: string; avatar?: string }
export interface NavAction { id: string; label: string; icon?: ReactNode; disabled?: boolean; destructive?: boolean; separatorBefore?: boolean; children?: NavAction[]; onSelect?: () => void }
export interface NavDestination { id: string; label: string; icon?: ReactNode; href?: string; onSelect?: () => void; active?: boolean }
/** Consumer-owned context. This package never fetches or persists application data. */
export interface NavValue {
  brand?: NavBrand;
  mode?: NavMode;
  project?: NavProject;
  conversation?: NavConversation;
  projects?: NavProject[];
  conversations?: NavConversation[];
  account?: NavAccount;
  accounts?: NavAccount[];
  destinations?: NavDestination[];
  accountActions?: NavAction[];
  projectActions?: NavAction[];
  conversationActions?: NavAction[];
  resourceActions?: NavAction[];
  onNavigate?: (href: string) => void;
  onModeChange?: (mode: NavMode) => void;
  onCreateConversation?: () => void;
  onSelectConversation?: (id: string) => void;
  onSelectProject?: (id: string) => void;
  onPinConversation?: (id: string) => void;
  onRenameConversation?: (id: string, title: string) => void;
  onAccountChange?: (id: string) => void;
  onShare?: () => void;
}
