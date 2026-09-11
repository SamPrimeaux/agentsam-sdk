import type { AgentContext, AgentContextProvider, AgentPrincipal } from '@inneranimalmedia/agentsam-contracts';

export type CmsAgentContextInput = {
  principal: AgentPrincipal;
  projectId: string;
  route?: string;
  pageId?: string | null;
  sectionId?: string | null;
  blockId?: string | null;
  publicationRevision?: number | null;
};

export function createCmsAgentContext(input: CmsAgentContextInput): AgentContext {
  return {
    surface: 'cms',
    accountId: input.principal.accountId,
    authUserId: input.principal.authUserId,
    projectId: input.projectId,
    metadata: {
      route: input.route ?? null,
      pageId: input.pageId ?? null,
      sectionId: input.sectionId ?? null,
      blockId: input.blockId ?? null,
      publicationRevision: input.publicationRevision ?? null,
    },
  };
}

export function createCmsAgentContextProvider(getInput: () => CmsAgentContextInput | Promise<CmsAgentContextInput>): AgentContextProvider {
  return {
    async getContext() {
      return createCmsAgentContext(await getInput());
    },
  };
}
