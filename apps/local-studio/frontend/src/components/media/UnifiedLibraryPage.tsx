import { useNavigate, useRouterState } from '@tanstack/react-router';
import { LocalStudioWorkPage } from '@/components/work/LocalStudioWorkPage';
import { MediaLibraryPage } from './MediaLibraryPage';
import { Files, Images } from 'lucide-react';
import './library-layout.css';

/** Single view shared by the public Library and legacy Media entry points.
 * File and media authority stays with the existing Work/Cloudflare providers. */
export function UnifiedLibraryPage({ view }: { view: 'artifacts' | 'media' }) {
  const navigate = useNavigate();
  const artifactFilter = useRouterState({ select: state => {
    const requested = new URLSearchParams(state.location.searchStr).get('view');
    return requested === 'yours' || requested === 'shared' || requested === 'recent' || requested === 'starred' || requested === 'trash'
      ? requested : 'all';
  }});
  return (
    <div className="agentsam-unified-library" data-studio-product="library" data-library-view={view}>
      <header className="agentsam-library-header">
        <h1>Library</h1>
        <nav className="agentsam-library-switch" aria-label="Library sections">
          <button type="button" aria-current={view === 'artifacts' ? 'page' : undefined}
            aria-selected={view === 'artifacts'} className={view === 'artifacts' ? 'is-active' : undefined}
            onClick={() => void navigate({ to: '/admin/library' })}>
            <Files size={17} aria-hidden="true" /> Artifacts
          </button>
          <button type="button" aria-current={view === 'media' ? 'page' : undefined}
            aria-selected={view === 'media'} className={view === 'media' ? 'is-active' : undefined}
            onClick={() => void navigate({ to: '/admin/media' })}>
            <Images size={17} aria-hidden="true" /> Media
          </button>
        </nav>
      </header>
      <section className="agentsam-library-content" aria-label={view === 'artifacts' ? 'Artifacts' : 'Media'}>
        {view === 'artifacts' ? <LocalStudioWorkPage surface="artifacts" artifactView={artifactFilter} /> : <MediaLibraryPage />}
      </section>
    </div>
  );
}
