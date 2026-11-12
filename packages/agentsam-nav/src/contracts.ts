import type { ReactNode } from 'react';

export type NavMode = 'chat' | 'work';
export type NavTheme = 'dark' | 'light' | 'system';
export type NavTokens = Partial<Record<'canvas' | 'sidebar' | 'surface' | 'popover' | 'text' | 'muted' | 'border' | 'hover' | 'selected' | 'danger' | 'font' | 'label-size' | 'meta-size' | 'row-height' | 'radius' | 'menu-radius' | 'shadow' | 'width' | 'rail-width', string>>;
export interface NavBrand { name: string; logo?: string; lightLogo?: string; home?: string }
export interface NavProject { id: string; name: string; pinned?: boolean; updatedAt?: number }
export interface NavConversation { id: string; title: string; projectId?: string; pinned?: boolean; updatedAt?: number }
export interface NavPinnedResource { id: string; title: string; kind: string; open?: string | null }
export interface NavAccount { id: string; name: string; plan?: string; avatar?: string }
export interface NavAction { id: string; label: string; icon?: ReactNode; disabled?: boolean; loading?: boolean; shortcut?: string; destructive?: boolean; separatorBefore?: boolean; children?: NavAction[]; onSelect?: () => void }
export interface NavDestination { id: string; label: string; icon?: ReactNode; href?: string; onSelect?: () => void; active?: boolean; exact?: boolean; children?: NavDestination[]; /** Host-provided action displayed beside a destination; no implicit install or permission change. */ action?: { label: string; onSelect: () => void; disabled?: boolean } }
export interface NavBreadcrumb { id: string; label: string; href?: string }

/** Consumer-owned application context. Only optional shell preferences are persisted. */
export interface NavValue {
  brand?: NavBrand;
  mode?: NavMode;
  project?: NavProject;
  conversation?: NavConversation;
  projects?: NavProject[];
  conversations?: NavConversation[];
  pinnedResources?: NavPinnedResource[];
  onOpenResource?: (resource: NavPinnedResource) => void;
  account?: NavAccount;
  accounts?: NavAccount[];
  destinations?: NavDestination[];
  /** Router-owned pathname; when present, the deepest matching destination is selected. */
  pathname?: string;
  /** Commerce or other non-conversation hosts may omit the history region. */
  showHistory?: boolean;
  /** Insert the built-in New chat action after this destination id. */
  newConversationAfter?: string;
  historyStatus?: "loading" | "error" | "ready";
  onRetryHistory?: () => void;
  /** Set false when the host already owns the single global sidebar toggle. */
  showSidebarHeader?: boolean;
  breadcrumbs?: NavBreadcrumb[];
  accountActions?: NavAction[];
  projectActions?: NavAction[];
  conversationActions?: NavAction[];
  resourceActions?: NavAction[];
  /** Live thread activity. Entries carry their actual target action, never a fixture. */
  pinnedSummary?: {
    subagents?: Array<{ id: string; label: string; status?: string; onSelect?: () => void }>;
    outputs?: Array<string | { id: string; label: string; kind?: string; onSelect?: () => void }>;
    sources?: Array<string | { id: string; label: string; kind?: string; onSelect?: () => void }>;
    /** Typed context actions for the Outputs plus button. */
    outputActions?: NavAction[];
    onAddOutput?: () => void;
    /** Typed context actions for the Sources plus button. */
    sourceActions?: NavAction[];
    onAddSource?: () => void;
  };
  getProjectActions?: (project: NavProject) => NavAction[];
  getConversationActions?: (conversation: NavConversation) => NavAction[];
  /** Host-owned global search. Navigation never owns the command implementation. */
  onSearch?: () => void;
  onNavigate?: (href: string) => void;
  onModeChange?: (mode: NavMode) => void;
  onCreateConversation?: () => void;
  onSelectConversation?: (id: string) => void;
  onSelectProject?: (id: string) => void;
  onPinConversation?: (id: string) => void;
  onRenameConversation?: (id: string, title: string) => void;
  onDeleteConversation?: (id: string) => void;
  /** Archive persisted conversations; unavailable local chats remain outside this action. */
  onArchiveConversation?: (id: string) => void;
  /** Persist the conversation/project association through the host's account or Work API. */
  onAssignConversationToProject?: (conversationId: string, projectId: string | null) => void;
  onPinProject?: (id: string) => void;
  onRenameProject?: (id: string, name: string) => void;
  onDeleteProject?: (id: string) => void;
  onAccountChange?: (id: string) => void;
  onShare?: () => void;
}
