import { createRoot } from 'react-dom/client';
import { StrictMode } from 'react';
import CmsEditor from './editor/CmsEditor';
import { createHeuristicThemeMemoryAdapter } from './adapters/heuristic';
import './styles/studio.css';

const root = document.getElementById('root');
if (!root) throw new Error('cms_studio_root_missing');

const params = new URLSearchParams(window.location.search);
const example = (params.get('example') || '').trim();
const siteParam = (params.get('site') || params.get('project') || '').trim();
const pageId = (params.get('page') || '').trim() || null;

function boot() {
  if (example === 'heuristic-theme' || example === 'heuristic') {
    const seeded = createHeuristicThemeMemoryAdapter(siteParam || undefined);
    return (
      <CmsEditor
        adapter={seeded.adapter}
        siteId={seeded.siteId}
        initialPageId={pageId}
        ephemeral
      />
    );
  }

  if (!siteParam) {
    return (
      <main className="cms-shell cms-shell--error">
        <h1>CMS site required</h1>
        <p>
          Pass <code>?site=your-site</code> with a real CmsEditorAdapter host, or load the explicit
          example with <code>?example=heuristic-theme</code>.
        </p>
        <p>Localhost no longer silently fabricates a demo CMS.</p>
      </main>
    );
  }

  return (
    <main className="cms-shell cms-shell--error">
      <h1>HTTP adapter host wiring required</h1>
      <p>
        Site <code>{siteParam}</code> needs a host-provided CmsEditorAdapter (SQLite / D1 / HTTP).
        The package no longer invents persistence on localhost.
      </p>
    </main>
  );
}

createRoot(root).render(<StrictMode>{boot()}</StrictMode>);
