import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import CmsEditor from './CmsEditor';

export type ClientCmsEditorBoot = {
  projectSlug: string;
  pageId?: string | null;
  panel?: 'pages' | 'sections' | 'templates' | 'imports' | 'theme';
};

/**
 * Imperative mount helper for hosts.
 * Import styles separately:
 *   import '@inneranimalmedia/client-cms-editor/styles/studio.css'
 */
export function mountClientCmsEditor(
  mountEl: HTMLElement,
  boot: ClientCmsEditorBoot,
  onSiteChange?: (slug: string) => void,
) {
  const panelRaw = boot.panel || 'pages';
  const panel =
    panelRaw === 'sections' ||
    panelRaw === 'templates' ||
    panelRaw === 'imports' ||
    panelRaw === 'theme'
      ? panelRaw
      : 'pages';

  createRoot(mountEl).render(
    <StrictMode>
      <CmsEditor
        projectSlug={boot.projectSlug}
        initialPageId={boot.pageId || null}
        initialPanel={panel}
        siteCatalog={[]}
        onSiteChange={(slug) => {
          const url = new URL(window.location.href);
          url.searchParams.set('site', slug);
          window.history.replaceState({}, '', url.toString());
          onSiteChange?.(slug);
        }}
      />
    </StrictMode>,
  );
}
