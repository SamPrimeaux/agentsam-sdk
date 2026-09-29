import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import CmsEditor from './editor/CmsEditor';
import { previewHeuristicStarter } from './adapters/heuristic';
import type { CmsEditorAdapter } from '../../shared/cms/src/adapter';

export type ClientCmsEditorBoot = {
  projectSlug: string;
  pageId?: string | null;
  panel?: 'pages' | 'sections' | 'templates' | 'imports' | 'theme';
  /**
   * Explicit stock starter. Never implied by localhost alone.
   * Installs Heuristic into a temporary in-memory adapter for preview.
   * Durable hosts should call installStarterPack(adapter, heuristicStarterPack) themselves.
   */
  starter?: 'heuristic';
  /** @deprecated Use starter: 'heuristic' */
  example?: 'heuristic-theme';
};

function HeuristicMount({
  projectSlug,
  pageId,
  onSiteChange,
}: {
  projectSlug: string;
  pageId?: string | null;
  onSiteChange?: (slug: string) => void;
}) {
  const [state, setState] = useState<{
    adapter: CmsEditorAdapter;
    siteId: string;
    pageId: string | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    previewHeuristicStarter(projectSlug || undefined)
      .then((seeded) => {
        setState({
          adapter: seeded.adapter,
          siteId: seeded.siteId,
          pageId: pageId || seeded.pageId,
        });
        onSiteChange?.(seeded.siteId);
      })
      .catch((err) => setError(err?.message || String(err)));
  }, [projectSlug, pageId, onSiteChange]);

  if (error) {
    return (
      <main className="cms-shell cms-shell--error">
        <h1>Starter install failed</h1>
        <p>{error}</p>
      </main>
    );
  }
  if (!state) {
    return (
      <main className="cms-shell cms-shell--loading">
        <p>Installing Heuristic starter…</p>
      </main>
    );
  }
  return (
    <CmsEditor
      adapter={state.adapter}
      siteId={state.siteId}
      initialPageId={state.pageId}
      temporaryAdapter
    />
  );
}

/**
 * Imperative mount helper for hosts.
 * Import styles separately:
 *   import '@inneranimalmedia/client-cms-editor/styles/studio.css'
 *
 * Hosts should prefer passing their own CmsEditorAdapter + installStarterPack.
 */
export function mountClientCmsEditor(
  mountEl: HTMLElement,
  boot: ClientCmsEditorBoot,
  onSiteChange?: (slug: string) => void,
) {
  if (boot.starter === 'heuristic' || boot.example === 'heuristic-theme') {
    createRoot(mountEl).render(
      <StrictMode>
        <HeuristicMount
          projectSlug={boot.projectSlug}
          pageId={boot.pageId}
          onSiteChange={onSiteChange}
        />
      </StrictMode>,
    );
    return;
  }

  createRoot(mountEl).render(
    <StrictMode>
      <main className="cms-shell cms-shell--error">
        <h1>CmsEditorAdapter required</h1>
        <p>
          mountClientCmsEditor no longer invents persistence. Pass a host adapter via{' '}
          <code>&lt;CmsEditor adapter=&#123;...&#125; /&gt;</code> and optionally{' '}
          <code>installStarterPack(adapter, heuristicStarterPack)</code>, or set{' '}
          <code>starter: &apos;heuristic&apos;</code> for an explicit temporary preview.
        </p>
      </main>
    </StrictMode>,
  );
}
