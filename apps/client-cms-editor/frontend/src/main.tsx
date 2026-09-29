import { createRoot } from 'react-dom/client';
import { StrictMode, useEffect, useState } from 'react';
import CmsEditor from './editor/CmsEditor';
import { previewHeuristicStarter } from './adapters/heuristic';
import type { CmsEditorAdapter } from '../../shared/cms/src/adapter';
import './styles/studio.css';

const root = document.getElementById('root');
if (!root) throw new Error('cms_studio_root_missing');

const params = new URLSearchParams(window.location.search);
const starter = (params.get('starter') || params.get('example') || '').trim();
const siteParam = (params.get('site') || params.get('project') || '').trim();
const pageId = (params.get('page') || '').trim() || null;

function HeuristicBoot() {
  const [state, setState] = useState<{
    adapter: CmsEditorAdapter;
    siteId: string;
    pageId: string | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    previewHeuristicStarter(siteParam || undefined)
      .then((seeded) =>
        setState({
          adapter: seeded.adapter,
          siteId: seeded.siteId,
          pageId: pageId || seeded.pageId,
        }),
      )
      .catch((err) => setError(err?.message || String(err)));
  }, []);

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
        <p>Installing Heuristic starter into temporary adapter…</p>
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

function boot() {
  if (starter === 'heuristic' || starter === 'heuristic-theme') {
    return <HeuristicBoot />;
  }

  if (!siteParam) {
    return (
      <main className="cms-shell cms-shell--error">
        <h1>CMS site required</h1>
        <p>
          Pass <code>?site=your-site</code> with a host-provided CmsEditorAdapter, or start the
          stock Heuristic pack with <code>?starter=heuristic</code> (temporary in-memory adapter
          until a durable adapter is attached).
        </p>
      </main>
    );
  }

  return (
    <main className="cms-shell cms-shell--error">
      <h1>CmsEditorAdapter required</h1>
      <p>
        Site <code>{siteParam}</code> needs a host-provided CmsEditorAdapter. This package does not
        invent persistence from hostname or empty site ids.
      </p>
    </main>
  );
}

createRoot(root).render(<StrictMode>{boot()}</StrictMode>);
