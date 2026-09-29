import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CmsEditorAdapter } from '../../../shared/cms/src/adapter';
import type {
  CmsEditorBlock,
  CmsEditorPage,
  CmsEditorSection,
  CmsEditorSite,
} from '../../../shared/cms/src/editor-types';
import type { CmsEditorHost } from '../../../shared/cms/src/host';
import type { CmsPublicationSnapshot, CmsRevision } from '../../../shared/cms/src/adapter';

export type CmsEditorUiState = {
  rail: 'pages' | 'sections' | 'blocks' | 'media' | 'settings';
  viewport: 'phone' | 'tablet' | 'desktop';
  dirty: boolean;
  saving: boolean;
  publishing: boolean;
  error: string | null;
  ephemeralNotice: string | null;
};

export type CmsEditorController = {
  adapter: CmsEditorAdapter;
  host?: CmsEditorHost;
  site: CmsEditorSite | null;
  page: CmsEditorPage | null;
  section: CmsEditorSection | null;
  block: CmsEditorBlock | null;
  ui: CmsEditorUiState;
  published: CmsPublicationSnapshot | null;
  lastDraft: CmsRevision | null;
  selectPage: (pageId: string) => void;
  selectSection: (sectionId: string) => void;
  selectBlock: (blockId: string) => void;
  setRail: (rail: CmsEditorUiState['rail']) => void;
  setViewport: (viewport: CmsEditorUiState['viewport']) => void;
  updateSectionField: (key: string, value: unknown) => void;
  saveDraft: () => Promise<void>;
  publish: () => Promise<void>;
  reload: () => Promise<void>;
  navigateHost: (path: string) => void;
};

export type UseCmsEditorControllerArgs = {
  adapter: CmsEditorAdapter;
  host?: CmsEditorHost;
  siteId: string;
  initialPageId?: string | null;
  ephemeral?: boolean;
};

export function useCmsEditorController({
  adapter,
  host,
  siteId,
  initialPageId = null,
  ephemeral = false,
}: UseCmsEditorControllerArgs): CmsEditorController {
  const [site, setSite] = useState<CmsEditorSite | null>(null);
  const [pageId, setPageId] = useState<string | null>(initialPageId);
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [blockId, setBlockId] = useState<string | null>(null);
  const [published, setPublished] = useState<CmsPublicationSnapshot | null>(null);
  const [lastDraft, setLastDraft] = useState<CmsRevision | null>(null);
  const [ui, setUi] = useState<CmsEditorUiState>({
    rail: 'sections',
    viewport: 'desktop',
    dirty: false,
    saving: false,
    publishing: false,
    error: null,
    ephemeralNotice: ephemeral
      ? 'Demo sandbox · changes are temporary until a durable adapter (SQLite/D1) is attached.'
      : null,
  });

  const reload = useCallback(async () => {
    setUi((u) => ({ ...u, error: null }));
    const loaded = await adapter.loadSite(siteId);
    setSite(loaded);
    const page =
      loaded.pages.find((p) => p.id === initialPageId) ||
      loaded.pages.find((p) => p.id === pageId) ||
      loaded.pages[0] ||
      null;
    setPageId(page?.id || null);
    setSectionId(page?.sections[0]?.id || null);
    setBlockId(null);
    setUi((u) => ({ ...u, dirty: false }));
    if (page?.id) {
      const pub = await adapter.getPublishedRevision(page.id);
      setPublished(pub);
    }
  }, [adapter, siteId, initialPageId, pageId]);

  useEffect(() => {
    reload().catch((error) => {
      setUi((u) => ({ ...u, error: error?.message || String(error) }));
      setSite(null);
    });
    // intentionally load once per site/adapter
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter, siteId]);

  const page = useMemo(
    () => site?.pages.find((p) => p.id === pageId) || site?.pages[0] || null,
    [site, pageId],
  );
  const section = useMemo(
    () => page?.sections.find((s) => s.id === sectionId) || page?.sections[0] || null,
    [page, sectionId],
  );
  const block = useMemo(
    () => section?.blocks.find((b) => b.id === blockId) || null,
    [section, blockId],
  );

  const selectPage = useCallback((id: string) => {
    setPageId(id);
    setSectionId(null);
    setBlockId(null);
    setUi((u) => ({ ...u, dirty: false, rail: 'sections' }));
  }, []);

  const selectSection = useCallback((id: string) => {
    setSectionId(id);
    setBlockId(null);
    setUi((u) => ({ ...u, rail: 'sections' }));
  }, []);

  const selectBlock = useCallback((id: string) => {
    setBlockId(id);
    setUi((u) => ({ ...u, rail: 'blocks' }));
  }, []);

  const updateSectionField = useCallback(
    (key: string, value: unknown) => {
      if (!site || !page || !section) return;
      setSite((current) => {
        if (!current) return current;
        return {
          ...current,
          pages: current.pages.map((p) =>
            p.id !== page.id
              ? p
              : {
                  ...p,
                  sections: p.sections.map((s) =>
                    s.id !== section.id ? s : { ...s, fields: { ...s.fields, [key]: value } },
                  ),
                },
          ),
        };
      });
      setUi((u) => ({ ...u, dirty: true }));
    },
    [site, page, section],
  );

  const saveDraft = useCallback(async () => {
    if (!page) return;
    setUi((u) => ({ ...u, saving: true, error: null }));
    try {
      const revision = await adapter.saveDraft(page.id, { sections: page.sections });
      setLastDraft(revision);
      setUi((u) => ({ ...u, dirty: false, saving: false }));
    } catch (error: any) {
      setUi((u) => ({ ...u, saving: false, error: error?.message || String(error) }));
      throw error;
    }
  }, [adapter, page]);

  const publish = useCallback(async () => {
    if (!page) return;
    setUi((u) => ({ ...u, publishing: true, error: null }));
    try {
      if (ui.dirty) await saveDraft();
      const snapshot = await adapter.publish(page.id);
      setPublished(snapshot);
      await reload();
      setUi((u) => ({ ...u, publishing: false, dirty: false }));
    } catch (error: any) {
      setUi((u) => ({ ...u, publishing: false, error: error?.message || String(error) }));
      throw error;
    }
  }, [adapter, page, ui.dirty, saveDraft, reload]);

  const navigateHost = useCallback(
    (path: string) => {
      if (host?.navigate) host.navigate(path);
    },
    [host],
  );

  return {
    adapter,
    host,
    site,
    page,
    section,
    block,
    ui,
    published,
    lastDraft,
    selectPage,
    selectSection,
    selectBlock,
    setRail: (rail) => setUi((u) => ({ ...u, rail })),
    setViewport: (viewport) => setUi((u) => ({ ...u, viewport })),
    updateSectionField,
    saveDraft,
    publish,
    reload,
    navigateHost,
  };
}
