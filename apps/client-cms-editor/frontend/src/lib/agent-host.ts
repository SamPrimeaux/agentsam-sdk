/**
 * Optional AgentSam / workbench host slot (React render props).
 * Defined in the frontend package so shared/cms stays React-free.
 */
import type { ReactNode } from 'react';
import type {
  CmsAgentDrawerSlotProps,
  CmsAgentMiniSlotProps,
  CmsHostPrincipal,
} from '../../../shared/cms/src/host';

export type CmsAgentHost = {
  principal?: CmsHostPrincipal | null;
  conversationId?: string;
  renderDrawer?: (props: CmsAgentDrawerSlotProps) => ReactNode;
  renderMini?: (props: CmsAgentMiniSlotProps) => ReactNode;
};

export type {
  CmsAgentDrawerSlotProps,
  CmsAgentMiniSlotProps,
  CmsAnnotationSelection,
  CmsHostPrincipal,
} from '../../../shared/cms/src/host';
