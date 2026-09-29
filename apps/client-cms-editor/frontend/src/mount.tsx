import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import CmsEditor from './editor/CmsEditor';
import { createHeuristicThemeMemoryAdapter } from './adapters/heuristic';

export type ClientCmsEditorBoot = {
  projectSlug: string;
  pageId?: string | null;
  panel?: 'pages' | 'sections' | 'templates' | 'imports' | 'theme';
  /** Explicit example seed. Never implied by localhost alone. */
  example?: 'heuristic-theme';
};

/**
 * Imperative mount helper for hosts.
 * Import styles separately:
 *   import '@inneranimalmedia/client-cms-editor/styles/studio.css'
 *
 * Hosts should prefer passing their own CmsEditorAdapter. The heuristic example
 * is available only when boot.example === 'heuristic-theme'.
 */
export function mountClientCmsEditor(
  mountEl: HTMLElement,
  boot: ClientCmsEditorBoot,
  onSiteChange?: (slug: string) => void,
) {
  if (boot.example === 'heuristic-theme') {
    const seeded = createHeuristicThemeMemoryAdapter(boot.projectSlug || undefined);
    createRoot(mountEl).render(
      <StrictMode>
        <CmsEditor
          adapter={seeded.adapter}
          siteId={seeded.siteId}
          initialPageId={boot.pageId || null}
          ephemeral
        />
      </StrictMode>,
    );
    onSiteChange?.(seeded.siteId);
    return;
  }

  createRoot(mountEl).render(
    <StrictMode>
      <main className="cms-shell cms-shell--error">
        <h1>CmsEditorAdapter required</h1>
        <p>
          mountClientCmsEditor no longer invents persistence. Pass a host adapter via{' '}
          <code>&lt;CmsEditor adapter=&#123;...&#125; /&gt;</code>, or set{' '}
          <code>example: &apos;heuristic-theme&apos;</code> for the explicit sandbox.
        </p>
      </main>
    </StrictMode>,
  );
}
