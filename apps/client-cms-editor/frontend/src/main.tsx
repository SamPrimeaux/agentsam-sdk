import { createRoot } from 'react-dom/client';
import { StrictMode } from 'react';
import CmsEditor from './CmsEditor';
import './styles/studio.css';

const root = document.getElementById('root');
if (!root) throw new Error('cms_studio_root_missing');

const params = new URLSearchParams(window.location.search);
const projectSlug = (params.get('site') || params.get('project') || 'demo').trim() || 'demo';
const pageId = (params.get('page') || '').trim() || null;

createRoot(root).render(
  <StrictMode>
    <CmsEditor projectSlug={projectSlug} initialPageId={pageId} />
  </StrictMode>,
);
