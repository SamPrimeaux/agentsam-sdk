/**
 * Optional capabilities supplied by the embedding host.
 * The CMS remains independent of host navigation,
 * identity authority, runtime, and deployment topology.
 */

/** Minimal authenticated identity the CMS needs for context metadata. */
export type CmsHostPrincipal = {
  /** Host-stable subject identifier (consumer maps its own user id here). */
  subjectId: string;
  accountId?: string;
  displayName?: string;
  email?: string;
  metadata?: Record<string, unknown>;
};

export type CmsAgentSurfaceKind = 'cms' | string;

/** Explicit CMS selection context passed to an optional agent host. */
export type CmsAgentContext = {
  surface: CmsAgentSurfaceKind;
  accountId?: string;
  subjectId?: string;
  projectId?: string;
  metadata?: {
    route?: string | null;
    pageId?: string | null;
    sectionId?: string | null;
    blockId?: string | null;
    publicationRevision?: number | null;
    [key: string]: unknown;
  };
};

export type CmsAgentContextProvider = {
  getContext(): CmsAgentContext | Promise<CmsAgentContext>;
};

/** Opaque annotation payload from a host mini-agent. */
export type CmsAnnotationSelection = {
  id?: string;
  label?: string;
  [key: string]: unknown;
};

export type CmsAgentDrawerSlotProps = {
  open: boolean;
  onClose: () => void;
  projectId: string;
  conversationId: string;
  contextProvider: CmsAgentContextProvider;
  route?: string;
  pageId?: string | null;
  sectionId?: string | null;
  blockId?: string | null;
  selectionLabel?: string | null;
  pendingPrompt?: string | null;
  onPendingPromptConsumed?: () => void;
};

export type CmsAgentMiniSlotProps = {
  projectId: string;
  conversationId: string;
  contextProvider: CmsAgentContextProvider;
  annotateSelecting?: boolean;
  onAnnotateToggle?: () => void;
  onAnnotateSubmit?: (
    prompt: string,
    annotation: CmsAnnotationSelection,
  ) => void | Promise<void>;
};

/**
 * Host/deployment capabilities supplied by the embedding application.
 * Consumers implement these — the CMS package does not hardcode navigation or identity.
 */
export type CmsEditorHost = {
  principal?: CmsHostPrincipal | null;
  navigate?: (path: string) => void;
  openExternal?: (url: string) => void;
  labelTemporaryAdapter?: (message: string) => void;
};
