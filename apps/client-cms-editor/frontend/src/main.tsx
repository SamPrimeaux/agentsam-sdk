import { createRoot } from 'react-dom/client';
import { StrictMode } from 'react';
import CmsEditor from './CmsEditor';
import './styles/studio.css';

const root = document.getElementById('root');
if (!root) throw new Error('cms_studio_root_missing');

const params = new URLSearchParams(window.location.search);
const projectSlug = (params.get('site') || params.get('project') || '').trim();
const pageId = (params.get('page') || '').trim() || null;

function MissingSiteContext() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 32, maxWidth: 720 }}>
      <h1>AgentSam CMS Studio</h1>
      <p>This authoring surface requires explicit site context.</p>
      <p>Open it with <code>?site=&lt;site-slug&gt;</code>, or mount <code>CmsEditor</code> from an authenticated host.</p>
    </main>
  );
}

createRoot(root).render(
  <StrictMode>
    {projectSlug
      ? <CmsEditor projectSlug={projectSlug} initialPageId={pageId} />
      : <MissingSiteContext />}
  </StrictMode>,
);
