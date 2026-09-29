import type { CmsAgentContext, CmsAgentContextProvider, CmsHostPrincipal } from './host';

export type CmsAgentContextInput = {
  principal: CmsHostPrincipal;
  projectId: string;
  route?: string;
  pageId?: string | null;
  sectionId?: string | null;
  blockId?: string | null;
  publicationRevision?: number | null;
};

export function createCmsAgentContext(input: CmsAgentContextInput): CmsAgentContext {
  return {
    surface: 'cms',
    accountId: input.principal.accountId,
    subjectId: input.principal.subjectId,
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

export function createCmsAgentContextProvider(
  getInput: () => CmsAgentContextInput | Promise<CmsAgentContextInput>,
): CmsAgentContextProvider {
  return {
    async getContext() {
      return createCmsAgentContext(await getInput());
    },
  };
}
