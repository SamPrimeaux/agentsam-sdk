import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { LocalStudioWorkPage } from '@/components/work/LocalStudioWorkPage';
import { MediaLibraryPage } from '@/components/media/MediaLibraryPage';
import { Files, Images } from 'lucide-react';

/** A single Library entry over the existing Work artifact and Cloudflare/local
 * media providers. This creates no new asset registry or storage layer. */
export const Route = createFileRoute('/(apps)/library')({ component: LibraryPage });

function LibraryPage() {
  const [tab, setTab] = useState<'files' | 'media'>('files');
  return <div className="agentsam-unified-library" data-studio-product="library">
    <div className="agentsam-library-switch" role="tablist" aria-label="Library content">
      <button type="button" id="agentsam-library-files-tab" role="tab" aria-selected={tab==='files'} aria-controls="agentsam-library-panel" onClick={()=>setTab('files')}>
        <Files size={17} aria-hidden="true"/> Files
      </button>
      <button type="button" id="agentsam-library-media-tab" role="tab" aria-selected={tab==='media'} aria-controls="agentsam-library-panel" onClick={()=>setTab('media')}>
        <Images size={17} aria-hidden="true"/> Media
      </button>
    </div>
    <div id="agentsam-library-panel" className="agentsam-library-content" role="tabpanel" aria-labelledby={tab==='files'?'agentsam-library-files-tab':'agentsam-library-media-tab'}>
      {tab==='files' ? <LocalStudioWorkPage surface="artifacts"/> : <MediaLibraryPage/>}
    </div>
  </div>;
}
