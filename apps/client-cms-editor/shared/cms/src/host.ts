/**
 * CMS-owned host integration surfaces (no React, no AgentSam package imports).
 *
 * Hosts adapt their AgentSam/workbench implementations into these slots.
 * CMS does not fork AgentSam message/run/tool types.
 */

/** Minimal authenticated identity the CMS needs for context metadata. */
export type CmsHostPrincipal = {
  accountId: string;
  authUserId: string;
  displayName?: string;
  email?: string;
};

export type CmsAgentSurfaceKind = 'cms' | string;

/** Explicit CMS selection context passed to an optional agent host. */
export type CmsAgentContext = {
  surface: CmsAgentSurfaceKind;
  accountId?: string;
  authUserId?: string;
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
 * Host/deployment capabilities. InnerAnimalMedia, Local Studio, Fuel, etc.
 * implement these — never hardcode deployment navigation inside the package.
 */
export type CmsEditorHost = {
  principal?: CmsHostPrincipal | null;
  navigate?: (path: string) => void;
  openExternal?: (url: string) => void;
  labelEphemeralSandbox?: (message: string) => void;
};
