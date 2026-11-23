import React, { useMemo, useState } from 'react';
import type { ProjectState } from '@inneranimalmedia/agentsam-cad-shared';
import { CadResourceCard } from './CadResourceCard';
import { CadPreview3DStatic, CadPreview2D } from './CadPreviewTreatments';
import { QuickAddPreview, categoryLabel, useQuickAddCatalog } from './quick-add';
import type { QuickAddItem } from './quick-add/types';
import { loadStudioProjectTemplate } from '../lib/studio-template-source';

export type CadGalleryHostedProject = { id: string; name: string };
export type CadGalleryLocalSnapshot = { id: string; name: string; date: string; state: ProjectState };

interface Props {
  mode?: 'hosted' | 'local' | 'mixed';
  hostedProjects?: CadGalleryHostedProject[];
  selectedHostedId?: string;
  onOpenHosted?: (projectId: string) => void;
  localSnapshots?: CadGalleryLocalSnapshot[];
  onOpenLocal?: (project: ProjectState) => void;
  onStartTemplate?: (project: ProjectState, name: string) => void;
  onOpenBimLibrary?: () => void;
  emptyHint?: string;
}

type Filter = 'all' | 'projects' | 'revisions' | 'starters';

export function CadProjectGallery({
  mode = 'mixed',
  hostedProjects = [],
  selectedHostedId = '',
  onOpenHosted,
  localSnapshots = [],
  onOpenLocal,
  onStartTemplate,
  onOpenBimLibrary,
  emptyHint = 'Open a registered CAD project or start from a registered studio template.',
}: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  const [loadingTemplateId, setLoadingTemplateId] = useState<string | null>(null);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const catalog = useQuickAddCatalog(true);
  const featuredTemplates = useMemo(() => catalog.items.filter(item => item.tab === 'templates'), [catalog.items]);

  const showProjects = filter === 'all' || filter === 'projects';
  const showRevisions = filter === 'all' || filter === 'revisions';
  const showStarters = filter === 'all' || filter === 'starters';
  const hasAnything =
    (showProjects && hostedProjects.length > 0) ||
    (showRevisions && localSnapshots.length > 0) ||
    (showStarters && (featuredTemplates.length > 0 || catalog.status === 'loading' || !!onOpenBimLibrary));

  const startTemplate = async (item: QuickAddItem) => {
    if (!onStartTemplate) return;
    setLoadingTemplateId(item.id);
    setTemplateError(null);
    try {
      const project = await loadStudioProjectTemplate(item);
      onStartTemplate(project, item.title);
    } catch (error) {
      setTemplateError(error instanceof Error ? error.message : 'The registered template could not be loaded.');
    } finally {
      setLoadingTemplateId(null);
    }
  };

  return (
    <div className="cad-project-gallery" aria-label="CAD Creator projects and revisions">
      <header className="cad-project-gallery__head">
        <div>
          <p className="cad-project-gallery__eyebrow">CAD Creator</p>
          <h2>Projects & revisions</h2>
          <p>Lightweight previews open into the real 2D / 3D workspace — no live engine in the gallery.</p>
        </div>
        <div className="cad-project-gallery__filters" role="tablist" aria-label="Gallery filters">
          {([
            ['all', 'All'],
            ['projects', 'Projects'],
            ['revisions', 'Revisions'],
            ['starters', 'Templates'],
          ] as const).map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={filter === id} onClick={() => setFilter(id)}>
              {label}
            </button>
          ))}
        </div>
      </header>

      {!hasAnything ? (
        <p className="cad-project-gallery__empty" role="status">{emptyHint}</p>
      ) : (
        <div className="cad-project-gallery__grid">
          {showProjects && hostedProjects.map((item) => (
            <CadResourceCard
              key={`hosted-${item.id}`}
              title={item.name}
              category="Registered BIM"
              meta={`Project · ${item.id.slice(0, 12)}${item.id.length > 12 ? '…' : ''}`}
              previewKind="model-3d"
              selected={selectedHostedId === item.id}
              preview={<CadPreview3DStatic seed={item.id} label={item.name} walls={10} rooms={4} />}
              openLabel="Open project"
              onOpen={onOpenHosted ? () => onOpenHosted(item.id) : undefined}
            />
          ))}

          {showRevisions && localSnapshots.map((snap) => (
            <CadResourceCard
              key={`local-${snap.id}`}
              title={snap.name}
              category="Local revision"
              meta={`${snap.date} · ${snap.state.walls.length} walls · ${snap.state.rooms.length} spaces`}
              previewKind="plan-2d"
              preview={<CadPreview2D project={snap.state} />}
              openLabel="Restore"
              onOpen={onOpenLocal ? () => onOpenLocal(snap.state) : undefined}
            />
          ))}

          {showStarters && catalog.status === 'loading' && (
            <p className="cad-project-gallery__empty" role="status">Loading registered studio templates…</p>
          )}
          {showStarters && catalog.status === 'error' && (
            <div className="cad-project-gallery__empty" role="alert">
              <p>{catalog.error || 'The studio template catalog is unavailable.'}</p>
              <button type="button" onClick={catalog.refresh}>Retry catalog</button>
            </div>
          )}
          {showStarters && templateError && <p className="cad-project-gallery__empty" role="alert">{templateError}</p>}
          {showStarters && featuredTemplates.map((item) => (
            <CadResourceCard
              key={`tpl-${item.id}`}
              title={item.title}
              category={categoryLabel(item.category)}
              meta={item.description}
              previewKind="plan-2d"
              preview={<QuickAddPreview item={item} />}
              openLabel={loadingTemplateId === item.id ? 'Loading…' : 'Use template'}
              secondaryLabel="Registered template"
              onOpen={loadingTemplateId ? undefined : () => void startTemplate(item)}
            />
          ))}

          {showStarters && onOpenBimLibrary && (
            <CadResourceCard
              title="Native BIM library"
              category="FreeCAD starters"
              meta="Thumbnails & inspectable mesh derivatives · source stays in FreeCAD"
              previewKind="model-3d"
              preview={<CadPreview3DStatic seed="bim-library" label="Native BIM library" walls={14} rooms={5} />}
              openLabel="Browse BIM"
              onOpen={onOpenBimLibrary}
            />
          )}
        </div>
      )}

      {mode === 'hosted' && hostedProjects.length === 0 && (
        <p className="cad-project-gallery__note">
          No registered Work projects yet. Sign in and attach a CAD registry, or start from a registered studio template.
        </p>
      )}
    </div>
  );
}
