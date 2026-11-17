import { Link } from '@tanstack/react-router';
import { LocalStudioWorkPage } from '@/components/work/LocalStudioWorkPage';
import { MediaLibraryPage } from './MediaLibraryPage';
import { Files, Images } from 'lucide-react';
import './library-layout.css';

/** Single view shared by the public Library and legacy Media entry points.
 * File and media authority stays with the existing Work/Cloudflare providers. */
export function UnifiedLibraryPage({ view }: { view: 'artifacts' | 'media' }) {
  return (
    <div className="agentsam-unified-library" data-studio-product="library" data-library-view={view}>
      <header className="agentsam-library-header">
        <h1>Library</h1>
        <nav className="agentsam-library-switch" aria-label="Library sections">
          <Link to="/admin/library" aria-current={view === 'artifacts' ? 'page' : undefined}
            className={view === 'artifacts' ? 'is-active' : undefined}>
            <Files size={17} aria-hidden="true" /> Artifacts
          </Link>
          <Link to="/admin/media" aria-current={view === 'media' ? 'page' : undefined}
            className={view === 'media' ? 'is-active' : undefined}>
            <Images size={17} aria-hidden="true" /> Media
          </Link>
        </nav>
      </header>
      <section className="agentsam-library-content" aria-label={view === 'artifacts' ? 'Artifacts' : 'Media'}>
        {view === 'artifacts' ? <LocalStudioWorkPage surface="artifacts" /> : <MediaLibraryPage />}
      </section>
    </div>
  );
}
